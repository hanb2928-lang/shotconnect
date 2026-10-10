import { useEffect, useRef, useState, useCallback } from 'react';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { supabase, ensureFreshSession } from '@/lib/supabase';
import { stepToProgress } from '@/lib/videoGenSteps';
import { HybridRealtimePoller, type ChannelHealth } from '@/lib/hybridRealtimePoller';

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

const POLL_FIRST_DELAY_MS = 8000;
const SOFT_WARN_MS = 120_000;
const HARD_TIMEOUT_MS = 600_000;
const POLL_ERROR_WINDOW_MS = 60_000;
const MAX_POLL_ERRORS_IN_WINDOW = 8;

/**
 * Encapsulates Runway direct polling and DB force-sync for a video job.
 *
 * - Polls the `generate-video` edge function in `poll` mode every 5 seconds.
 * - Falls back to a direct `video_jobs` DB query (force sync) if the edge
 *   function call fails repeatedly.
 * - Fires a soft warning after 120 seconds and a hard timeout at 600 seconds.
 */
export function useResultPolling(
  jobId: string | null,
  options: ResultPollingOptions = {},
) {
  const { scanId, onCompleted, onError, onSoftWarn } = options;

  const [jobState, setJobState] = useState<JobState>('idle');
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [serverProgress, setServerProgress] = useState<number | null>(null);
  const [serverStep, setServerStep] = useState<string | null>(null);
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
    setServerProgress(null);
    setServerStep(null);
    setError(null);
    setIsTimeout(false);

    const startTime = Date.now();
    let cancelled = false;
    const hybridPoller = new HybridRealtimePoller();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let softWarnTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAbort: AbortController | null = null;
    let forceSyncAbort: AbortController | null = null;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    // Hoisted early so cleanup() can reference it without TDZ issues.
    let resumeBurstTimer: ReturnType<typeof setTimeout> | null = null;
    let softWarnFired = false;
    let bgEnterTime: number | null = null;
    const pollErrorWindow: number[] = [];
    let notFoundRetries = 0;
    const MAX_404_RETRIES = 3;
    // Monotonic guard: track the highest progress and latest step seen
    // across both realtime and polling. Stale realtime payloads that arrive
    // after a newer poll result (common on background→foreground transition)
    // are rejected instead of regressing the UI backwards.
    let highestProgressSeen = 0;
    let latestStepSeen: string | null = null;

    const applyProgress = (stepProg: number | null, step: string | null) => {
      if (stepProg !== null && !isNaN(stepProg) && stepProg > 0) {
        const isStepChange = step !== null && step !== latestStepSeen;
        if (stepProg < highestProgressSeen && !isStepChange) return; // stale — reject
        if (isStepChange) highestProgressSeen = stepProg;
        else highestProgressSeen = Math.max(highestProgressSeen, stepProg);
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        const pctLabel = ` (${Math.round(stepProg * 100)}%)`;
        setProgressMessage(`AI가 영상을 렌더링하고 있어요${pctLabel} · ${elapsedSec}초`);
        setServerProgress((prev) => Math.max(prev ?? 0, stepProg));
      }
      if (step && step !== latestStepSeen) {
        latestStepSeen = step;
        setServerStep(step);
      }
    };

    // Primary trigger: Realtime websocket push on video_jobs row update.
    // This fires the instant the server writes a terminal status, giving
    // millisecond-level completion detection without waiting for the next poll.
    // When the task ID is a soft-fallback placeholder (server didn't respond
    // within 10s), filter by scan_id instead of task_id so we still receive
    // updates for the real job row the server created asynchronously.
    const isSoftTaskId = jobId.startsWith('soft-');
    const realtimeFilter = isSoftTaskId && scanId
      ? `scan_id=eq.${scanId}`
      : `task_id=eq.${jobId}`;

    const createRealtimeChannel = () => {
      const ch = supabase
        .channel(`job-poll-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'video_jobs',
            filter: realtimeFilter,
          },
          (payload) => {
            if (cancelled || settledRef.current) return;
            hybridPoller.onRealtimeEvent();
            try {
              const row = payload.new as { status: string; video_url: string | null; error_message: string | null; step: string | null };
              if (!row || typeof row.status !== 'string') return;
              if (row.status === 'SUCCESS' && row.video_url) {
                handleResult(row.status, row.video_url);
              } else if (row.status === 'FAILED') {
                handleResult(row.status, null, row.error_message ?? undefined);
              } else {
                applyProgress(stepToProgress(row.step), row.step ?? null);
              }
            } catch {
              // Malformed payload — ignore, polling will catch up
            }
          },
        );

      if (scanId) {
        ch.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'scans',
            filter: `id=eq.${scanId}`,
          },
          (payload) => {
            if (cancelled || settledRef.current) return;
            hybridPoller.onRealtimeEvent();
            try {
              const row = payload.new as { video_url?: string | null; muxed_video_url?: string | null };
              const finalUrl = row?.muxed_video_url ?? row?.video_url;
              if (finalUrl) {
                handleResult('SUCCESS', finalUrl);
              }
            } catch {
              // Malformed payload — ignore, polling will catch up
            }
          },
        );
      }

      return ch.subscribe((status: string) => {
        if (cancelled || settledRef.current) return;
        const health = HybridRealtimePoller.statusToHealth(status);
        if (health === 'HEALTHY') hybridPoller.markHealthy();
        else if (health === 'DEGRADED') hybridPoller.markDegraded();
        else hybridPoller.markDisconnected();
      });
    };

    try {
      realtimeChannel = createRealtimeChannel();
    } catch {
      // Realtime unavailable — polling still works as fallback
    }

    const cleanup = () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (softWarnTimer) clearTimeout(softWarnTimer);
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      if (realtimeChannel) {
        try { supabase.removeChannel(realtimeChannel); } catch { /* ignore */ }
      }
      pollAbort?.abort();
      forceSyncAbort?.abort();
    };

    // Direct DB force-sync: query video_jobs table as a fallback.
    // For soft-fallback task IDs, look up by scan_id since no real row
    // has the fake task ID.
    const forceSyncDb = async (): Promise<{ status: string; videoUrl: string | null; step: string | null } | null> => {
      forceSyncAbort?.abort();
      forceSyncAbort = new AbortController();
      try {
        let query = supabase
          .from('video_jobs')
          .select('status, video_url, step');
        const { data, error: dbError } = isSoftTaskId && scanId
          ? await query.eq('scan_id', scanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
          : await query.eq('task_id', jobId).maybeSingle();
        if (forceSyncAbort.signal.aborted || dbError || !data) return null;
        const row = data as { status: string; video_url: string | null; step: string | null };
        return { status: row.status, videoUrl: row.video_url, step: row.step };
      } catch {
        return null;
      }
    };

    // Also check by scan_id if the task_id lookup fails.
    // Returns step so the soft-fallback path can propagate progress.
    const forceSyncByScan = async (): Promise<{ status: string; videoUrl: string | null; step: string | null } | null> => {
      if (!scanId) return null;
      forceSyncAbort?.abort();
      forceSyncAbort = new AbortController();
      try {
        const { data, error: dbError } = await supabase
          .from('video_jobs')
          .select('status, video_url, step')
          .eq('scan_id', scanId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (forceSyncAbort.signal.aborted || dbError || !data) {
          // Fallback: check scans.video_url / muxed_video_url directly — the
          // webhook may have written the result to scans without the
          // video_jobs row updating.
          const { data: scanData } = await supabase
            .from('scans')
            .select('video_url, muxed_video_url')
            .eq('id', scanId)
            .maybeSingle();
          const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
          if (scanFinalUrl) {
            return { status: 'SUCCESS', videoUrl: scanFinalUrl, step: 'completed' };
          }
          return null;
        }
        const row = data as { status: string; video_url: string | null; step: string | null };
        if (row.status === 'SUCCESS' && row.video_url) {
          return { status: row.status, videoUrl: row.video_url, step: row.step };
        }
        // Non-terminal: also check scans.video_url / muxed_video_url as a fallback.
        const { data: scanData } = await supabase
          .from('scans')
          .select('video_url, muxed_video_url')
          .eq('id', scanId)
          .maybeSingle();
        const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
        if (scanFinalUrl) {
          return { status: 'SUCCESS', videoUrl: scanFinalUrl, step: 'completed' };
        }
        return { status: row.status, videoUrl: row.video_url, step: row.step };
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

      // At 85%+, the forced completion guard is already running a
      // DB force-sync. Skip redundant edge function polls to avoid lock
      // conflicts and wasted network requests on native.
      if (highestProgressSeen >= 0.85) {
        const delayMs = hybridPoller.nextPollDelayMs();
        pollTimer = setTimeout(pollOnce, delayMs);
        return;
      }

      // Abort any previous in-flight poll before starting a new one.
      pollAbort?.abort();
      pollAbort = new AbortController();

      const elapsed = Date.now() - startTime;
      if (elapsed > HARD_TIMEOUT_MS) {
        settle('timeout', '영상 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      const elapsedSec = Math.round(elapsed / 1000);

      // When the task ID is a soft-fallback placeholder, skip the edge
      // function poll (it can't find the job by a fake task ID) and go
      // straight to DB lookup by scanId — the real job row was created
      // server-side even though we never got the response. Also propagate
      // step/progress so the UI stays live during the soft path.
      if (isSoftTaskId) {
        const scanResult = await forceSyncByScan();
        if (cancelled || settledRef.current) return;
        if (scanResult) {
          if (scanResult.step) {
            applyProgress(stepToProgress(scanResult.step), scanResult.step);
          }
          handleResult(scanResult.status, scanResult.videoUrl);
          if (settledRef.current) return;
        }
        if (!cancelled && !settledRef.current) {
          const delayMs = hybridPoller.nextPollDelayMs();
          pollTimer = setTimeout(pollOnce, delayMs);
        }
        return;
      }

      // Primary path: poll via the generate-video edge function.
      try {
        const { data: pollData } = await supabase.functions.invoke('generate-video', {
          body: { mode: 'poll', taskId: jobId, scanId: scanId ?? undefined },
        });

        if (pollAbort.signal.aborted || cancelled) return;
        if (pollData && typeof pollData === 'object') {
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
            const errStr = (pollData.error as string) ?? '';
            if (errStr.includes('404') && notFoundRetries < MAX_404_RETRIES) {
              notFoundRetries++;
              const notFoundDelay = 3000 * notFoundRetries;
              setProgressMessage(notFoundRetries === 1
                ? '서버에 작업이 등록되는 중입니다. 잠시만 기다려주세요...'
                : '작업 상태를 다시 확인하는 중...');
              if (!cancelled && !settledRef.current) {
                pollTimer = setTimeout(pollOnce, notFoundDelay);
              }
              return;
            }
            handleResult(status, null, errStr || undefined);
            return;
          } else {
            const rawProgress = pollData.progress ? parseFloat(pollData.progress) : NaN;
            const stepProg = stepToProgress(pollData.step as string | undefined);
            const candidate = !isNaN(rawProgress) ? rawProgress : stepProg;
            const bestProgress = Math.max(0, Math.min(1, (candidate ?? 0))) || 0;
            applyProgress(!isNaN(bestProgress) && bestProgress > 0 ? bestProgress : null, (pollData.step as string) ?? null);
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
        if (cancelled) return;
        if (dbResult) {
          handleResult(dbResult.status, dbResult.videoUrl);
          if (settledRef.current) return;
        }
        // Also check scans.video_url — the webhook may have completed
        // without the video_jobs row being visible yet.
        if (scanId) {
          const scanResult = await forceSyncByScan();
          if (cancelled) return;
          if (scanResult) {
            handleResult(scanResult.status, scanResult.videoUrl);
            if (settledRef.current) return;
          }
        }
      }

      if (!cancelled && !settledRef.current) {
        const delayMs = hybridPoller.nextPollDelayMs();
        pollTimer = setTimeout(pollOnce, delayMs);
      }
    };

    const armSoftWarn = (delayMs: number) => {
      if (softWarnTimer) clearTimeout(softWarnTimer);
      softWarnTimer = setTimeout(() => {
        if (!cancelled && !settledRef.current) {
          softWarnFired = true;
          setProgressMessage('영상 생성이 조금 오래 걸리고 있어요. 잠시만 기다려주세요...');
          callbacksRef.current.onSoftWarn?.();
        }
      }, delayMs);
    };

    const armHardTimeout = (delayMs: number) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => {
        if (!cancelled && !settledRef.current) {
          settle('timeout', '영상 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        }
      }, delayMs);
    };

    armSoftWarn(SOFT_WARN_MS);
    armHardTimeout(HARD_TIMEOUT_MS);

    // Start polling — first poll fires at 500ms for instant status check,
    // subsequent polls use the adaptive backoff starting at 1500ms.
    pollTimer = setTimeout(pollOnce, POLL_FIRST_DELAY_MS);

    // Resume pump: on foreground return, immediately poll + run a short
    // burst of fast polls so the UI catches up without waiting for the
    // normal backoff schedule (which starts at 3 seconds).
    const RESUME_BURST_INTERVAL_MS = 1500;
    const RESUME_BURST_COUNT = 3;
    let resumeBurstCount = 0;
    const runResumeBurst = async () => {
      if (cancelled || settledRef.current || resumeBurstCount >= RESUME_BURST_COUNT) {
        resumeBurstTimer = null;
        return;
      }
      resumeBurstCount++;
      if (resumeBurstCount === 1) {
        try { await ensureFreshSession(); } catch { /* non-fatal */ }
        // Instant DB force-sync on foreground return: the Realtime websocket
        // may take 1-2 seconds to re-subscribe after a network drop, so check
        // the DB directly to catch any completion that happened while
        // backgrounded. This fills the gap before the first poll cycle fires.
        const dbResult = isSoftTaskId ? await forceSyncByScan() : await forceSyncDb();
        if (!cancelled && !settledRef.current && dbResult) {
          handleResult(dbResult.status, dbResult.videoUrl);
          if (settledRef.current) return;
        }
        // Also check scans.video_url — the webhook may have written the
        // result directly to scans without the video_jobs row updating.
        if (!cancelled && !settledRef.current && scanId && !isSoftTaskId) {
          const scanResult = await forceSyncByScan();
          if (!cancelled && !settledRef.current && scanResult) {
            handleResult(scanResult.status, scanResult.videoUrl);
            if (settledRef.current) return;
          }
        }
      }
      pollOnce();
      resumeBurstTimer = setTimeout(runResumeBurst, RESUME_BURST_INTERVAL_MS);
    };

    // Pause polling when app is backgrounded to avoid zombie requests.
    // On background: abort in-flight fetches, clear all timers, and
    // unsubscribe Realtime so the OS can reclaim memory without orphaned
    // callbacks crashing the app. On foreground: re-subscribe Realtime,
    // run a resume burst, and restart the normal poll schedule.
    const handleAppState = (nextState: string) => {
      if (nextState === 'active') {
        if (!cancelled && !settledRef.current) {
          // Re-subscribe Realtime channel (was unsubscribed on background).
          if (!realtimeChannel) {
            try {
              realtimeChannel = createRealtimeChannel();
            } catch {
              // Realtime unavailable — polling still works as fallback
            }
          }
          if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
          resumeBurstCount = 0;
          runResumeBurst();

          // Re-arm soft warn and hard timeout with remaining time so
          // background duration does not count toward the user's wait.
          if (bgEnterTime !== null) {
            const bgDuration = Date.now() - bgEnterTime;
            bgEnterTime = null;
            const elapsed = Date.now() - startTime - bgDuration;
            const remainingSoft = SOFT_WARN_MS - elapsed;
            const remainingHard = HARD_TIMEOUT_MS - elapsed;
            if (!softWarnFired && remainingSoft > 0) {
              armSoftWarn(remainingSoft);
            } else if (!softWarnFired && remainingSoft <= 0) {
              softWarnFired = true;
              setProgressMessage('영상 생성이 조금 오래 걸리고 있어요. 잠시만 기다려주세요...');
              callbacksRef.current.onSoftWarn?.();
            }
            if (remainingHard > 0) {
              armHardTimeout(remainingHard);
            }
          }
        }
      } else if (nextState === 'background' || nextState === 'inactive') {
        // Graceful pause: abort all in-flight network requests, clear ALL
        // timers (including soft warn and hard timeout), and release the
        // Realtime websocket so the OS can reclaim memory without
        // triggering orphaned-callback crashes or premature timeouts.
        bgEnterTime = Date.now();
        pollAbort?.abort();
        forceSyncAbort?.abort();
        if (resumeBurstTimer) { clearTimeout(resumeBurstTimer); resumeBurstTimer = null; }
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        if (softWarnTimer) { clearTimeout(softWarnTimer); softWarnTimer = null; }
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
        if (realtimeChannel) {
          try { supabase.removeChannel(realtimeChannel); } catch { /* ignore */ }
          realtimeChannel = null;
        }
      }
    };
    const unsubAppState = registerAppStateHandler('deferred', handleAppState);

    return () => {
      cleanup();
      unsubAppState();
    };
  }, [jobId, scanId, settle]);

  // Forced completion guard: when server-reported progress reaches 85%+
  // (rendering) while still polling, start a 15-second timer. If no terminal
  // status arrives, do a DB force-sync — complete if the video is ready,
  // otherwise retry up to 6 times at 10-second intervals before escalating
  // to a timeout error. The server goes rendering→completed directly, so
  // 85% means rendering is underway and the result should arrive soon.
  useEffect(() => {
    if (jobState !== 'polling' || serverProgress === null || serverProgress < 0.85) return;
    if (!jobId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let aborted = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 6;

    const checkOnce = async () => {
      if (aborted || settledRef.current) return;
      try {
        await ensureFreshSession();
        if (scanId) {
          const { data: scanData } = await supabase
            .from('scans')
            .select('video_url, muxed_video_url')
            .eq('id', scanId)
            .maybeSingle();
          if (aborted || settledRef.current) return;
          const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
          if (scanFinalUrl) {
            settle('completed', undefined, scanFinalUrl);
            return;
          }
        }
        const isSoft = jobId.startsWith('soft-');
        let query = supabase.from('video_jobs').select('status, video_url, error_message');
        const { data, error: dbErr } = isSoft && scanId
          ? await query.eq('scan_id', scanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
          : await query.eq('task_id', jobId).maybeSingle();
        if (aborted || settledRef.current) return;
        if (dbErr || !data) {
          attempts++;
          if (attempts < MAX_ATTEMPTS && !aborted && !settledRef.current) {
            timer = setTimeout(checkOnce, 10_000);
            return;
          }
          settle('timeout', '영상 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
          return;
        }
        const row = data as { status: string; video_url: string | null; error_message: string | null };
        if (row.status === 'SUCCESS' && row.video_url) {
          settle('completed', undefined, row.video_url);
        } else if (row.status === 'FAILED') {
          settle('failed', row.error_message ?? '영상 생성에 실패했습니다.');
        } else {
          attempts++;
          if (attempts < MAX_ATTEMPTS && !aborted && !settledRef.current) {
            timer = setTimeout(checkOnce, 10_000);
            return;
          }
          settle('timeout', '영상 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        }
      } catch {
        attempts++;
        if (attempts < MAX_ATTEMPTS && !aborted && !settledRef.current) {
          timer = setTimeout(checkOnce, 10_000);
          return;
        }
        if (!aborted && !settledRef.current) {
          settle('timeout', '영상 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        }
      }
    };

    timer = setTimeout(checkOnce, 15_000);

    return () => {
      aborted = true;
      if (timer) clearTimeout(timer);
    };
  }, [serverProgress, jobState, jobId, scanId, settle]);

  return { jobState, progressMessage, serverProgress, serverStep, isTimeout, error };
}
