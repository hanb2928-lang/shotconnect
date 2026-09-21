import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

export type JobType =
  | 'analyze-photo'
  | 'virtual-fitting'
  | 'virtual-cuts'
  | 'generate-tts'
  | 'generate-copy'
  | 'generate-review'
  | 'generate-comic-scenario'
  | 'render-video';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface RenderJob {
  id: string;
  job_type: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  scan_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
}

const POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 300000;
const MAX_POLL_ERRORS = 5;

const ENQUEUE_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.`)), ms)
    ),
  ]);
}

export async function enqueueJob(
  jobType: JobType,
  payload: Record<string, unknown>,
  options: { priority?: number; scanId?: string } = {},
): Promise<string> {
  const { data, error } = await withTimeout(
    Promise.resolve(
      supabase
        .from('render_jobs')
        .insert({
          job_type: jobType,
          status: 'queued',
          priority: options.priority ?? 5,
          payload,
          scan_id: options.scanId ?? null,
        })
        .select('id')
        .single()
    ),
    ENQUEUE_TIMEOUT_MS,
    '작업 등록',
  );

  if (error) throw new Error(`Job enqueue failed: ${error.message}`);

  triggerQueueProcessor().catch(() => {});

  return data.id;
}

export async function getJob(jobId: string): Promise<RenderJob | null> {
  const { data, error } = await supabase
    .from('render_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new Error(`Job fetch failed: ${error.message}`);
  return data as RenderJob | null;
}

export interface JobResult<T = Record<string, unknown>> {
  success: boolean;
  result?: T;
  error?: string;
}

export async function waitForJob<T = Record<string, unknown>>(
  jobId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<JobResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let initialPollTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const cleanup = () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (initialPollTimer) clearTimeout(initialPollTimer);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };

    const finish = (result: JobResult<T>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    let channelRetryCount = 0;
    const MAX_WAIT_CHANNEL_RETRIES = 5;
    const connectChannel = () => {
      channel = supabase
        .channel(`job-wait:${jobId}${channelRetryCount > 0 ? `:r${channelRetryCount}` : ''}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'render_jobs', filter: `id=eq.${jobId}` },
          (payload) => {
            if (!payload.new) return;
            const job = payload.new as RenderJob;
            if (job.status === 'done') {
              finish({ success: true, result: (job.result ?? {}) as T });
            } else if (job.status === 'error') {
              finish({ success: false, error: job.error_message ?? 'Job failed' });
            }
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && !settled) {
            if (channel) {
              supabase.removeChannel(channel);
              channel = undefined;
            }
            channelRetryCount++;
            if (channelRetryCount > MAX_WAIT_CHANNEL_RETRIES) {
              finish({ success: false, error: '실시간 연결이 끊겼습니다. 네트워크를 확인해주세요.' });
            } else {
              setTimeout(connectChannel, 3000);
            }
          }
        });
    };
    connectChannel();

    timeoutTimer = setTimeout(() => {
      finish({ success: false, error: 'Job timed out' });
    }, timeoutMs);

    const pollErrorWindow: number[] = [];
    const POLL_ERROR_WINDOW_MS = 30000;

    const poll = async () => {
      if (settled) return;
      try {
        const job = await getJob(jobId);
        if (!job) { finish({ success: false, error: 'Job not found' }); return; }
        if (job.status === 'done') {
          finish({ success: true, result: (job.result ?? {}) as T });
        } else if (job.status === 'error') {
          finish({ success: false, error: job.error_message ?? 'Job failed' });
        }
      } catch {
        const now = Date.now();
        pollErrorWindow.push(now);
        while (pollErrorWindow.length > 0 && now - pollErrorWindow[0] > POLL_ERROR_WINDOW_MS) {
          pollErrorWindow.shift();
        }
        if (pollErrorWindow.length >= MAX_POLL_ERRORS) {
          finish({ success: false, error: '네트워크 연결이 불안정합니다. 다시 시도해주세요.' });
        }
      }
    };

    initialPollTimer = setTimeout(poll, 5000);
    pollInterval = setInterval(poll, POLL_INTERVAL_MS);
  });
}

const MAX_CHANNEL_RETRIES = 5;
const CHANNEL_RETRY_DELAY_MS = 3000;

export function subscribeToJob(
  jobId: string,
  onUpdate: (job: RenderJob) => void,
  onError?: () => void,
): { unsubscribe: () => void } {
  let disposed = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let currentChannel: ReturnType<typeof supabase.channel> | null = null;

  const connect = () => {
    if (disposed) return;

    currentChannel = supabase
      .channel(`job:${jobId}${retryCount > 0 ? `:r${retryCount}` : ''}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'render_jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          if (payload.new) {
            retryCount = 0;
            onUpdate(payload.new as RenderJob);
          }
        },
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'CHANNEL_ERROR') {
          if (currentChannel) {
            supabase.removeChannel(currentChannel);
            currentChannel = null;
          }
          retryCount++;
          if (retryCount > MAX_CHANNEL_RETRIES) {
            if (onError) onError();
          } else {
            retryTimer = setTimeout(connect, CHANNEL_RETRY_DELAY_MS);
          }
        }
      });
  };

  connect();

  return {
    unsubscribe: () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
        currentChannel = null;
      }
    },
  };
}

export async function enqueueAndWait<T = Record<string, unknown>>(
  jobType: JobType,
  payload: Record<string, unknown>,
  options: { priority?: number; scanId?: string; timeoutMs?: number } = {},
): Promise<JobResult<T>> {
  const jobId = await enqueueJob(jobType, payload, options);
  return waitForJob<T>(jobId, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

async function triggerQueueProcessor(): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/process-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ trigger: true }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      await resp.text().catch(() => '');
    }
  } catch {
    // Network error — register a one-time retry on network recovery.
    // Without this, a job enqueued during a brief outage sits idle until
    // another trigger fires (e.g. a new insert), which could be never.
    registerTriggerRetryOnRecovery();
  } finally {
    clearTimeout(timeoutId);
  }
}

let triggerRetryRegistered = false;
function registerTriggerRetryOnRecovery(): void {
  if (triggerRetryRegistered) return;
  triggerRetryRegistered = true;

  const retry = () => {
    triggerRetryRegistered = false;
    triggerQueueProcessor().catch(() => {});
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', retry, { once: true });
  } else {
    // On native, retry after a short delay since we can't listen to 'online'
    setTimeout(retry, 5000);
  }
}
