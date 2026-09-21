import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { enqueueJob, subscribeToJob, getJob, type RenderJob, type JobType, type JobStatus } from '@/lib/jobQueue';

interface QueuedJobState {
  jobId: string | null;
  status: JobStatus | 'idle';
  error: string | null;
  result: Record<string, unknown> | null;
}

const DEFAULT_TIMEOUT_MS = 120000;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ERRORS = 5;

export function useQueuedJob() {
  const [state, setState] = useState<QueuedJobState>({
    jobId: null,
    status: 'idle',
    error: null,
    result: null,
  });
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineCleanupRef = useRef<(() => void) | null>(null);
  const submitIdRef = useRef(0);

  const clearAll = useCallback(() => {
    if (subRef.current) {
      subRef.current.unsubscribe();
      subRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (onlineCleanupRef.current) {
      onlineCleanupRef.current();
      onlineCleanupRef.current = null;
    }
  }, []);

  const submit = useCallback(async (
    jobType: JobType,
    payload: Record<string, unknown>,
    options: { priority?: number; scanId?: string; timeoutMs?: number } = {},
  ): Promise<string> => {
    const mySubmitId = ++submitIdRef.current;
    clearAll();

    setState({ jobId: null, status: 'queued', error: null, result: null });

    let jobId: string;
    try {
      jobId = await enqueueJob(jobType, payload, options);
    } catch (err) {
      if (mySubmitId !== submitIdRef.current) return '';
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : '작업 등록에 실패했습니다.',
      }));
      return '';
    }

    if (mySubmitId !== submitIdRef.current) return jobId;

    setState((prev) => ({ ...prev, jobId }));

    const handleUpdate = (job: RenderJob) => {
      if (mySubmitId !== submitIdRef.current) return;
      setState((prev) => ({
        ...prev,
        status: job.status,
        error: job.error_message,
        result: job.result,
      }));
      if (job.status === 'done' || job.status === 'error') {
        clearAll();
      }
    };

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    timeoutRef.current = setTimeout(() => {
      if (mySubmitId !== submitIdRef.current) return;
      clearAll();
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: '작업 시간이 초과되었어요. 다시 시도해주세요.',
      }));
    }, timeoutMs);

    subRef.current = subscribeToJob(jobId, handleUpdate, () => {
      if (mySubmitId !== submitIdRef.current) return;
      clearAll();
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: '실시간 연결이 끊겼습니다. 네트워크를 확인 후 다시 시도해주세요.',
      }));
    });

    getJob(jobId).then((job) => {
      if (mySubmitId !== submitIdRef.current) return;
      if (job && (job.status === 'done' || job.status === 'error')) {
        handleUpdate(job);
      }
    }).catch(() => {});

    const pollErrorTimestamps: number[] = [];
    const POLL_ERROR_WINDOW_MS = 30000;
    let pollingPaused = false;

    const startPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (mySubmitId !== submitIdRef.current) return;
        getJob(jobId).then((job) => {
          if (mySubmitId !== submitIdRef.current) return;
          pollingPaused = false;
          if (job) handleUpdate(job);
        }).catch(() => {
          const now = Date.now();
          pollErrorTimestamps.push(now);
          while (pollErrorTimestamps.length > 0 && now - pollErrorTimestamps[0] > POLL_ERROR_WINDOW_MS) {
            pollErrorTimestamps.shift();
          }
          if (pollErrorTimestamps.length >= MAX_POLL_ERRORS) {
            // Pause polling instead of permanently erroring — the network
            // may recover. We'll resume on the 'online' event.
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            pollingPaused = true;
            setState((prev) => ({
              ...prev,
              error: '네트워크 연결이 불안정합니다. 연결이 복구되면 자동으로 재개됩니다.',
            }));
          }
        });
      }, POLL_INTERVAL_MS);
    };

    startPolling();

    // Resume polling when the network comes back online after a pause
    const handleOnline = () => {
      if (mySubmitId !== submitIdRef.current) return;
      if (pollingPaused) {
        pollErrorTimestamps.length = 0;
        pollingPaused = false;
        setState((prev) => ({
          ...prev,
          error: null,
          status: prev.status === 'error' ? 'queued' : prev.status,
        }));
        startPolling();
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      onlineCleanupRef.current = () => {
        window.removeEventListener('online', handleOnline);
      };
    }

    return jobId;
  }, [clearAll]);

  const reset = useCallback(() => {
    submitIdRef.current++;
    clearAll();
    setState({ jobId: null, status: 'idle', error: null, result: null });
  }, [clearAll]);

  useEffect(() => {
    return () => {
      submitIdRef.current++;
      clearAll();
    };
  }, [clearAll]);

  return { ...state, submit, reset };
}
