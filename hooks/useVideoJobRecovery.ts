import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { getActiveVideoJob, clearActiveVideoJob } from '@/lib/videoJobPersistence';

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

  const checkJob = useCallback(async (jobId: string) => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    setInfo({ state: 'checking', jobId, step: null, videoUrl: null, errorMsg: null });

    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('video_jobs')
        .select('status, step, video_url, error_message')
        .eq('id', jobId)
        .maybeSingle();

      if (error || !data) {
        clearActiveVideoJob();
        setInfo({ ...INITIAL, state: 'not_found' });
        return;
      }

      const row = data as { status: string; step?: string | null; video_url: string | null; error_message: string | null };

      if (row.status === 'SUCCESS') {
        clearActiveVideoJob();
        setInfo({
          state: 'completed',
          jobId,
          step: row.step ?? null,
          videoUrl: row.video_url ?? null,
          errorMsg: null,
        });
      } else if (row.status === 'FAILED') {
        clearActiveVideoJob();
        setInfo({
          state: 'failed',
          jobId,
          step: row.step ?? null,
          videoUrl: null,
          errorMsg: row.error_message ?? '비디오 생성에 실패했습니다.',
        });
      } else {
        setInfo({
          state: 'in_progress',
          jobId,
          step: row.step ?? null,
          videoUrl: null,
          errorMsg: null,
        });
      }
    } catch {
      setInfo({ ...INITIAL, state: 'not_found' });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const runRecovery = useCallback(async () => {
    const activeJob = await getActiveVideoJob();
    if (!activeJob || !activeJob.jobId) return;
    await checkJob(activeJob.jobId);
  }, [checkJob]);

  const dismiss = useCallback(() => {
    setInfo(INITIAL);
  }, []);

  useEffect(() => {
    // Check on mount in case app was backgrounded and reopened
    runRecovery();

    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      if (!document.hidden) {
        runRecovery();
      }
    };

    const handleOnline = () => {
      runRecovery();
    };

    let cleanupFns: (() => void)[] = [];

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
      cleanupFns.push(() => document.removeEventListener('visibilitychange', handleVisibility));
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      cleanupFns.push(() => window.removeEventListener('online', handleOnline));
    }

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
  }, [runRecovery]);

  return { info, dismiss, runRecovery };
}
