import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type JobState = 'idle' | 'polling' | 'completed' | 'failed' | 'timeout';

export interface ResultPollingOptions {
  /** Scan ID associated with the video job (used for DB force-sync lookups). */
  scanId?: string | null;
  /** Called when the job completes successfully. */
  onCompleted?: (videoUrl: string) => void;
  /** Called when the job fails or times out. */
  onError?: (errorMsg: string) => void;
  /** Called when the 120-second soft-warning threshold is crossed. */
  onSoftWarn?: () => void;
}

const POLL_INTERVAL_MS = 5000;
const SOFT_WARN_MS = 120_000;
const HARD_TIMEOUT_MS = 300_000;
const POLL_ERROR_WINDOW_MS = 60_000;
const MAX_POLL_ERRORS_IN_WINDOW = 8;

/**
 * Encapsulates Runway direct polling and DB force-sync for a video job.
 *
 * - Polls the `generate-video` edge function in `poll` mode every 5 seconds.
 * - Falls back to a direct `video_jobs` DB query (force sync) if the edge
 *   function call fails repeatedly.
 * - Fires a soft warning after 120 seconds and a hard timeout at 300 seconds.
 */
export function useResultPolling(
  jobId: string | null,
  options: ResultPollingOptions = {},
) {
  const { scanId, onCompleted, onError, onSoftWarn } = options;

  const [jobState, setJobState] = useState<JobState>('idle');
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [isTimeout, setIsTimeout] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const callbacksRef = useRef({ onCompleted, onError, onSoftWarn });
  callbacksRef.current = { onCompleted, onError, onSoftWarn };

  const settledRef = useRef(false);

  const settle = useCallback(
    (state: JobState, errMsg?: string, videoUrl?: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      setJobState(state);
      if (state === 'completed' && videoUrl) {
        setProgressMessage('영상 생성 완료');
        callbacksRef.current.onCompleted?.(videoUrl);
      } else if (state === 'failed' || state === 'timeout') {
        const msg = errMsg ?? '영상 생성에 실패했습니다.';
        setError(msg);
        setProgressMessage(msg);
        if (state === 'timeout') setIsTimeout(true);
        callbacksRef.current.onError?.(msg);
      }
    },
    [],
  );

  useEffect(() => {
    if (!jobId) {
      setJobState('idle');
      return;
    }

    settledRef.current = false;
    setJobState('polling');
    setProgressMessage('영상 생성 상태를 확인하는 중...');
    setError(null);
    setIsTimeout(false);

    const startTime = Date.now();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let softWarnTimer: ReturnType<typeof setTimeout> | null = null;
    const pollErrorWindow: number[] = [];

    const cleanup = () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (softWarnTimer) clearTimeout(softWarnTimer);
    };

    // Direct DB force-sync: query video_jobs table as a fallback.
    const forceSyncDb = async (): Promise<{ status: string; videoUrl: string | null } | null> => {
      try {
        const { data, error: dbError } = await supabase
          .from('video_jobs')
          .select('status, video_url')
          .eq('task_id', jobId)
          .maybeSingle();
        if (dbError || !data) return null;
        const row = data as { status: string; video_url: string | null };
        return { status: row.status, videoUrl: row.video_url };
      } catch {
        return null;
      }
    };

    // Also check by scan_id if the task_id lookup fails.
    const forceSyncByScan = async (): Promise<{ status: string; videoUrl: string | null } | null> => {
      if (!scanId) return null;
      try {
        const { data, error: dbError } = await supabase
          .from('video_jobs')
          .select('status, video_url')
          .eq('scan_id', scanId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dbError || !data) return null;
        const row = data as { status: string; video_url: string | null };
        return { status: row.status, videoUrl: row.video_url };
      } catch {
        return null;
      }
    };

    const handleResult = (status: string, videoUrl: string | null, errMsg?: string) => {
      if (cancelled) return;
      if (status === 'SUCCESS' && videoUrl) {
        settle('completed', undefined, videoUrl);
      } else if (status === 'FAILED') {
        settle('failed', errMsg ?? '영상 생성에 실패했습니다.');
      }
    };

    const pollOnce = async () => {
      if (cancelled || settledRef.current) return;

      const elapsed = Date.now() - startTime;
      if (elapsed > HARD_TIMEOUT_MS) {
        settle('timeout', '영상 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      const elapsedSec = Math.round(elapsed / 1000);

      // Primary path: poll via the generate-video edge function.
      try {
        const { data: pollData } = await supabase.functions.invoke('generate-video', {
          body: { mode: 'poll', taskId: jobId, scanId: scanId ?? undefined },
        });

        if (!cancelled && pollData && typeof pollData === 'object') {
          // Do NOT reset the error window on a successful edge function response.
          // On a flaky network, sporadic successes would keep the count below
          // the threshold, trapping the user in an infinite loading state.
          // The sliding window expires errors naturally by time, so only
          // actual failures are counted.
          const status = pollData.status as string;

          if (status === 'SUCCESS' && pollData.videoUrl) {
            handleResult(status, pollData.videoUrl as string);
            return;
          } else if (status === 'FAILED') {
            handleResult(status, null, pollData.error as string | undefined);
            return;
          } else {
            const rawProgress = pollData.progress ? parseFloat(pollData.progress) : NaN;
            const pctLabel = !isNaN(rawProgress) ? ` (${Math.round(rawProgress * 100)}%)` : '';
            setProgressMessage(`AI가 영상을 렌더링하고 있어요${pctLabel} · ${elapsedSec}초`);
          }
        }
      } catch {
        const now = Date.now();
        pollErrorWindow.push(now);
        while (pollErrorWindow.length > 0 && now - pollErrorWindow[0] > POLL_ERROR_WINDOW_MS) {
          pollErrorWindow.shift();
        }
        if (pollErrorWindow.length >= MAX_POLL_ERRORS_IN_WINDOW) {
          // Force-sync DB as a last resort before giving up.
          const dbResult = await forceSyncDb();
          if (!dbResult) {
            const scanResult = await forceSyncByScan();
            if (scanResult) {
              handleResult(scanResult.status, scanResult.videoUrl);
              return;
            }
          } else {
            handleResult(dbResult.status, dbResult.videoUrl);
            return;
          }
          settle('failed', '네트워크 연결이 불안정하여 영상 생성 상태를 확인할 수 없습니다. 다시 시도해주세요.');
          return;
        }
      }

      // Fallback: also try DB force-sync if we haven't resolved yet and
      // the poll failed (but hasn't hit the threshold yet).
      if (!cancelled && !settledRef.current && pollErrorWindow.length > 0) {
        const dbResult = await forceSyncDb();
        if (dbResult) {
          handleResult(dbResult.status, dbResult.videoUrl);
          if (settledRef.current) return;
        }
      }

      if (!cancelled && !settledRef.current) {
        pollTimer = setTimeout(pollOnce, POLL_INTERVAL_MS);
      }
    };

    // Soft warning at 120 seconds.
    softWarnTimer = setTimeout(() => {
      if (!cancelled && !settledRef.current) {
        setProgressMessage('영상 생성이 조금 오래 걸리고 있어요. 잠시만 기다려주세요...');
        callbacksRef.current.onSoftWarn?.();
      }
    }, SOFT_WARN_MS);

    // Hard timeout at 300 seconds.
    timeoutTimer = setTimeout(() => {
      if (!cancelled && !settledRef.current) {
        settle('timeout', '영상 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
      }
    }, HARD_TIMEOUT_MS);

    // Start polling.
    pollTimer = setTimeout(pollOnce, 1000);

    return () => {
      cleanup();
    };
  }, [jobId, scanId, settle]);

  return { jobState, progressMessage, isTimeout, error };
}
