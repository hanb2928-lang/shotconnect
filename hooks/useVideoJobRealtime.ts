import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { saveActiveVideoJob, clearActiveVideoJob } from '@/lib/videoJobPersistence';
import { onNetworkRecovery } from '@/hooks/useNetworkStatus';

type VideoJobStatus = 'idle' | 'processing' | 'completed' | 'failed';

export type VideoJobStep = 'idle' | 'uploading' | 'rendering' | 'completed' | 'failed';

interface UseVideoJobRealtimeOptions {
  jobId: string | null;
  onCompleted?: (resultUrl: string) => void;
  onError?: (errorMsg: string) => void;
}

const POLL_INITIAL_MS = 3000;
const POLL_MAX_MS = 15000;
const POLL_BACKOFF_FACTOR = 1.5;
const TIMEOUT_MS = 300_000;
const MAX_CHANNEL_RETRIES = 5;
const CHANNEL_RETRY_DELAY_MS = 3000;
const JITTER = () => 0.8 + Math.random() * 0.4;
const BG_MAX_WAIT_MS = 120_000;

export function useVideoJobRealtime({ jobId, onCompleted, onError }: UseVideoJobRealtimeOptions) {
  const [status, setStatus] = useState<VideoJobStatus>('idle');
  const [step, setStep] = useState<VideoJobStep>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const callbacksRef = useRef({ onCompleted, onError });
  callbacksRef.current = { onCompleted, onError };

  const settledRef = useRef(false);
  const onCompletedRef = useRef(onCompleted);
  const onErrorRef = useRef(onError);
  onCompletedRef.current = onCompleted;
  onErrorRef.current = onError;

  const handleResult = useCallback((s: VideoJobStatus, url?: string, err?: string, jobStep?: VideoJobStep) => {
    if (settledRef.current) return;
    if (jobStep) setStep(jobStep);
    if (s === 'completed') {
      settledRef.current = true;
      setStatus('completed');
      if (url) setResultUrl(url);
      if (url) callbacksRef.current.onCompleted?.(url);
      clearActiveVideoJob();
    } else if (s === 'failed') {
      settledRef.current = true;
      setStatus('failed');
      const msg = err ?? '비디오 생성에 실패했습니다.';
      setErrorMsg(msg);
      callbacksRef.current.onError?.(msg);
      clearActiveVideoJob();
    } else {
      setStatus(s);
    }
  }, []);

  useEffect(() => {
    if (!jobId) return;
    settledRef.current = false;
    setStatus('processing');
    setResultUrl(null);
    setErrorMsg(null);
    void saveActiveVideoJob(jobId, 'uploading').catch(() => {});

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let bgTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let pollAttempt = 0;

    const cleanup = () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (bgTimer) clearTimeout(bgTimer);
    };

    const checkDb = async () => {
      if (settledRef.current) return;
      try {
        const { data, error } = await supabase
          .from('video_jobs')
          .select('status, step, video_url, error_message')
          .eq('id', jobId)
          .maybeSingle();
        if (error || !data) return;
        const row = data as { status: string; step?: string | null; video_url: string | null; error_message: string | null };
        if (row.step) setStep(row.step as VideoJobStep);
        if (row.status === 'SUCCESS') {
          handleResult('completed', row.video_url ?? undefined, undefined, row.step as VideoJobStep | undefined);
        } else if (row.status === 'FAILED') {
          handleResult('failed', undefined, row.error_message ?? undefined, row.step as VideoJobStep | undefined);
        }
      } catch {
        // ignore — realtime is the primary path
      }
    };

    const schedulePoll = () => {
      if (settledRef.current) return;
      const delayMs = Math.min(
        Math.round(POLL_INITIAL_MS * Math.pow(POLL_BACKOFF_FACTOR, pollAttempt)),
        POLL_MAX_MS,
      );
      pollAttempt++;
      pollTimer = setTimeout(async () => {
        if (settledRef.current) return;
        await checkDb();
        if (!settledRef.current) schedulePoll();
      }, delayMs);
    };

    const connectChannel = () => {
      if (settledRef.current) return;
      channel = supabase
        .channel(`video-job:${jobId}${retryCount > 0 ? `:r${retryCount}` : ''}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'video_jobs', filter: `id=eq.${jobId}` },
          (payload) => {
            if (!payload.new || settledRef.current) return;
            const row = payload.new as { status: string; step?: string | null; video_url: string | null; error_message: string | null };
            if (row.step) setStep(row.step as VideoJobStep);
            if (row.status === 'SUCCESS') {
              handleResult('completed', row.video_url ?? undefined, undefined, row.step as VideoJobStep | undefined);
            } else if (row.status === 'FAILED') {
              handleResult('failed', undefined, row.error_message ?? undefined, row.step as VideoJobStep | undefined);
            }
          },
        )
        .subscribe((subStatus: string) => {
          if (settledRef.current) return;
          if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
            if (channel) {
              try { supabase.removeChannel(channel); } catch { /* ignore */ }
              channel = null;
            }
            retryCount++;
            if (retryCount > MAX_CHANNEL_RETRIES) {
              handleResult('failed', undefined, '실시간 연결이 끊겼습니다. 네트워크를 확인 후 다시 시도해주세요.');
            } else {
              reconnectTimer = setTimeout(connectChannel, CHANNEL_RETRY_DELAY_MS * JITTER());
            }
          }
        });
    };

    connectChannel();
    checkDb();
    schedulePoll();

    timeoutTimer = setTimeout(() => {
      if (settledRef.current) return;
      handleResult('failed', undefined, '비디오 생성 시간이 초과되었습니다. 잠시 후 다시 확인해주세요.');
    }, TIMEOUT_MS);

    // Pause polling and realtime when backgrounded to avoid zombie requests.
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
        if (!settledRef.current) {
          pollAttempt = 0;
          checkDb();
          if (!pollTimer) schedulePoll();
          if (!channel) connectChannel();
        }
      } else if (nextState === 'background' || nextState === 'inactive') {
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        if (channel) {
          try { supabase.removeChannel(channel); } catch { /* ignore */ }
          channel = null;
        }
        bgTimer = setTimeout(() => {
          if (settledRef.current) return;
          handleResult('failed', undefined, '백그라운드 대기 시간이 초과되었습니다. 앱으로 돌아오면 완성된 영상을 확인할 수 있습니다.');
        }, BG_MAX_WAIT_MS);
      }
    };
    const appSub = AppState.addEventListener('change', handleAppState);

    const unsubRecovery = onNetworkRecovery(() => {
      if (settledRef.current) return;
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      retryCount = 0;
      pollAttempt = 0;
      checkDb();
      connectChannel();
      if (!pollTimer) schedulePoll();
    });

    return () => {
      settledRef.current = true;
      cleanup();
      appSub.remove();
      unsubRecovery();
    };
  }, [jobId, handleResult]);

  return { status, step, resultUrl, errorMsg };
}
