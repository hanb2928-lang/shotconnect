import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { getActiveVideoJob, clearActiveVideoJob } from '@/lib/videoJobPersistence';
import { supabase, ensureFreshSession } from '@/lib/supabase';

export type RecoveryState = 'idle' | 'checking' | 'in_progress' | 'completed' | 'failed' | 'not_found';

export interface VideoJobRecoveryInfo {
  state: RecoveryState;
  jobId: string | null;
  step: string | null;
  videoUrl: string | null;
  errorMsg: string | null;
}

const INITIAL: VideoJobRecoveryInfo = {
  state: 'idle',
  jobId: null,
  step: null,
  videoUrl: null,
  errorMsg: null,
};

export function useVideoJobRecovery() {
  const [info, setInfo] = useState<VideoJobRecoveryInfo>(INITIAL);
  const checkingRef = useRef(false);
  const mountedRef = useRef(true);
  const dismissedJobIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeSetInfo = useCallback((updater: VideoJobRecoveryInfo | ((prev: VideoJobRecoveryInfo) => VideoJobRecoveryInfo)) => {
    if (mountedRef.current) setInfo(updater);
  }, []);

  const checkJob = useCallback(async (jobId: string) => {
    if (checkingRef.current) return;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    checkingRef.current = true;

    safeSetInfo({ state: 'checking', jobId, step: null, videoUrl: null, errorMsg: null });

    try {
      await ensureFreshSession();
      const isSoft = jobId.startsWith('soft-') || jobId.startsWith('hd-soft-');

      // For soft-fallback IDs, no DB row has that task_id — look up by
      // scan_id instead (stored in the persisted ActiveVideoJob).
      const activeJob = await getActiveVideoJob();
      const scanId = activeJob?.scanId ?? null;

      let query = supabase
        .from('video_jobs')
        .select('id, status, step, video_url, error_message');

      const queryPromise = (isSoft && scanId)
        ? query.eq('scan_id', scanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : query.eq('task_id', jobId).maybeSingle();

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        timeoutId = setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 5000);
      });

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      if (error || !data) {
        clearActiveVideoJob();
        safeSetInfo({ ...INITIAL, state: 'not_found' });
        return;
      }

      const row = data as { status: string; step?: string | null; video_url: string | null; error_message: string | null };

      if (row.status === 'SUCCESS') {
        clearActiveVideoJob();
        safeSetInfo({
          state: 'completed',
          jobId,
          step: row.step ?? null,
          videoUrl: row.video_url ?? null,
          errorMsg: null,
        });
      } else if (row.status === 'FAILED') {
        clearActiveVideoJob();
        safeSetInfo({
          state: 'failed',
          jobId,
          step: row.step ?? null,
          videoUrl: null,
          errorMsg: row.error_message ?? '비디오 생성에 실패했습니다.',
        });
      } else {
        safeSetInfo({
          state: 'in_progress',
          jobId,
          step: row.step ?? null,
          videoUrl: null,
          errorMsg: null,
        });
        pollTimerRef.current = setTimeout(() => {
          pollTimerRef.current = null;
          checkJob(jobId).catch(() => {});
        }, 5000);
      }
    } catch {
      safeSetInfo({ ...INITIAL, state: 'not_found' });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const runRecovery = useCallback(async () => {
    const activeJob = await getActiveVideoJob();
    if (!activeJob || !activeJob.jobId) return;
    if (dismissedJobIdRef.current === activeJob.jobId) return;
    await checkJob(activeJob.jobId);
  }, [checkJob]);

  const dismiss = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (info.jobId) dismissedJobIdRef.current = info.jobId;
    setInfo(INITIAL);
  }, [info.jobId]);

  useEffect(() => {
    mountedRef.current = true;
    // Check on mount in case app was backgrounded and reopened
    runRecovery().catch(() => {});

    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      if (!document.hidden) {
        runRecovery().catch(() => {});
      }
    };

    const handleOnline = () => {
      runRecovery().catch(() => {});
    };

    // Pause recovery checks while backgrounded; resume on foreground.
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        runRecovery().catch(() => {});
      }
    };
    const appSub = AppState.addEventListener('change', handleAppState);

    let cleanupFns: (() => void)[] = [];
    cleanupFns.push(() => appSub.remove());

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
      cleanupFns.push(() => document.removeEventListener('visibilitychange', handleVisibility));
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', handleOnline);
      cleanupFns.push(() => window.removeEventListener('online', handleOnline));
    }

    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      cleanupFns.forEach((fn) => fn());
    };
  }, [runRecovery]);

  return { info, dismiss, runRecovery };
}
