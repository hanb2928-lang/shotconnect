import { supabase } from './supabase';
import type { ProductVisionResult } from './productVision';
import { isOnline } from '@/hooks/useNetworkStatus';
import { getMultiAngleCache, setMultiAngleCache } from './aiCache';
import { stepToProgress } from './videoGenSteps';

export type VideoGenPhase = 'submitting' | 'generating' | 'completed' | 'error' | 'hd_upgrading' | 'hd_completed';

export interface VideoGenProgress {
  phase: VideoGenPhase;
  progress: number;
  message: string;
  elapsedSec: number;
}

export interface VideoGenResult {
  videoUrl: string;
  jobId: string;
  motionPrompt: string;
  durationSec: number;
  aspectRatio: string;
  variationSeed: number;
  persisted: boolean;
  provider: string;
  isDraft?: boolean;
}

interface GenerateAiVideoOptions {
  durationSec?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
  productName?: string;
  scanId?: string;
  variationSeed?: number;
  bgmMood?: string;
  captionText?: string;
  platform?: string;
  hookCategory?: string;
  cutCount?: number;
  productVision?: ProductVisionResult | null;
  draft?: boolean;
  isCleanVideoMode?: boolean;
  promptStrength?: number;
  negativePrompt?: string;
  bgStyle?: string;
  outfitIntensity?: number;
  zoomSpeed?: number;
  cameraRotation?: number;
  transitionEffect?: string;
  stylePreset?: string;
  detailRestoration?: boolean;
  hdUpscale?: boolean;
  qualityTier?: 'standard' | 'pro';
  resolution?: string;
  fps?: number;
  imageHash?: string;
  contentTone?: string;
  selectedMode?: 'auto_3d' | 'universal_synthesis' | 'manual';
  enableOrbit360?: boolean;
  orbitSpeed?: number;
  enableCaustics?: boolean;
  enableVirtualFitting?: boolean;
  enableFabricPhysics?: boolean;
}


const SUBMIT_MAX_RETRIES = 2;
const SUBMIT_RETRY_DELAY_MS = 2000;
const REALTIME_TIMEOUT_MS = 300_000;
const REALTIME_SOFT_WARN_MS = 120_000;
const FALLBACK_POLL_INTERVAL_MS = 5000;
const RUNWAY_POLL_FALLBACK_INTERVAL_MS = 15000;
const RUNWAY_POLL_FALLBACK_START_MS = 30_000;
const POLL_MIN_INTERVAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 12000;
const POLL_BACKOFF_FACTOR = 1.5;
const CHANNEL_RECONNECT_DELAY_MS = 3000;
const CHANNEL_MAX_RECONNECT_ATTEMPTS = 5;

enum ChannelHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  DISCONNECTED = 'disconnected',
}

function computeBackoffDelay(attempt: number): number {
  const base = POLL_MIN_INTERVAL_MS * Math.pow(POLL_BACKOFF_FACTOR, attempt);
  return Math.min(Math.round(base), POLL_MAX_INTERVAL_MS);
}

const OFFLINE_POLL_MS = 1000;
const OFFLINE_WAIT_MAX_MS = 30000;

function waitForOnline(): Promise<boolean> {
  if (isOnline()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const deadline = Date.now() + OFFLINE_WAIT_MAX_MS;
    const check = () => {
      if (isOnline() || Date.now() >= deadline) {
        resolve(isOnline());
        return;
      }
      setTimeout(check, OFFLINE_POLL_MS);
    };
    check();
  });
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('abort');
  }
  return false;
}

async function invokeWithNetworkRetry(
  fnName: string,
  body: Record<string, unknown>,
  maxRetries: number,
  onRetry?: (attempt: number, reason: string) => void,
): Promise<{ data: unknown; error: unknown }> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isNetworkError(err)) {
        if (!isOnline()) {
          onRetry?.(attempt + 1, '네트워크 연결 대기 중...');
          const recovered = await waitForOnline();
          if (!recovered) throw err;
        }
        onRetry?.(attempt + 1, '네트워크 재시도 중...');
        await delay(SUBMIT_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}


export async function generateAiVideo(
  prompt: string,
  options: GenerateAiVideoOptions,
  onProgress?: (progress: VideoGenProgress) => void,
): Promise<VideoGenResult> {
  const startTime = Date.now();

  const report = (phase: VideoGenPhase, progress: number, message: string) => {
    onProgress?.({
      phase,
      progress,
      message,
      elapsedSec: Math.round((Date.now() - startTime) / 1000),
    });
  };

  const isDraft = options.draft === true;

  // Cache hit check: if we have an imageHash + contentTone, look up
  // ai_analysis_cache before submitting to the render queue. On a hit,
  // skip the entire LLM + rendering pipeline and return the cached video.
  if (options.imageHash && options.contentTone && !isDraft) {
    const cached = await getMultiAngleCache(options.imageHash, options.contentTone);
    if (cached) {
      report('completed', 1.0, '캐시된 영상을 불러왔습니다.');
      return {
        videoUrl: cached.renderedVideoUrl,
        jobId: '',
        motionPrompt: '',
        durationSec: options.durationSec ?? 5,
        aspectRatio: options.aspectRatio ?? '9:16',
        variationSeed: options.variationSeed ?? 0,
        persisted: true,
        provider: 'cache',
      };
    }
  }

  report('submitting', 0.05, isDraft ? '빠른 미리보기 생성 요청 중...' : 'AI 비디오 생성 요청 전송 중...');

  // Phase 1: Submit task
  let submitData: { taskId: string; motionPrompt: string; durationSec: number; aspectRatio: string; variationSeed: number } | null = null;
  let lastSubmitErr: Error | null = null;

  for (let attempt = 0; attempt <= SUBMIT_MAX_RETRIES; attempt++) {
    try {
      const result = await invokeWithNetworkRetry(
        'generate-video',
        {
          mode: 'submit',
          prompt,
          durationSec: options.durationSec ?? 5,
          aspectRatio: options.aspectRatio ?? '9:16',
          productName: options.productName,
          scanId: options.scanId,
          variationSeed: options.variationSeed ?? 0,
          bgmMood: options.bgmMood,
          captionText: options.captionText,
          platform: options.platform ?? 'shorts',
          hookCategory: options.hookCategory ?? 'curiosity',
          cutCount: options.cutCount,
          productVision: options.productVision ?? null,
          draft: isDraft,
          isCleanVideoMode: options.isCleanVideoMode ?? false,
          promptStrength: options.promptStrength,
          negativePrompt: options.negativePrompt,
          bgStyle: options.bgStyle,
          outfitIntensity: options.outfitIntensity,
          zoomSpeed: options.zoomSpeed,
          cameraRotation: options.cameraRotation,
          transitionEffect: options.transitionEffect,
          stylePreset: options.stylePreset,
          detailRestoration: options.detailRestoration,
          hdUpscale: options.hdUpscale,
          qualityTier: options.hdUpscale ? 'pro' : (options.qualityTier ?? 'standard'),
          resolution: options.resolution ?? (options.hdUpscale ? '1080p' : '720p'),
          fps: options.fps ?? (options.hdUpscale ? 30 : 24),
          selectedMode: options.selectedMode,
          enableOrbit360: options.enableOrbit360,
          orbitSpeed: options.orbitSpeed,
          enableCaustics: options.enableCaustics,
          enableVirtualFitting: options.enableVirtualFitting,
          enableFabricPhysics: options.enableFabricPhysics,
        },
        0,
        (retryAttempt) => report('submitting', 0.05 + retryAttempt * 0.02, `네트워크 복구 후 재시도 중 (${retryAttempt}/${SUBMIT_MAX_RETRIES})...`),
      );

      const data = result.data as { taskId?: string; motionPrompt?: string; durationSec?: number; aspectRatio?: string; variationSeed?: number } | null;

      if (!data || typeof data !== 'object' || typeof data.taskId !== 'string') {
        throw new Error('서버가 작업 ID를 반환하지 않았습니다.');
      }

      submitData = {
        taskId: data.taskId,
        motionPrompt: data.motionPrompt as string,
        durationSec: data.durationSec as number,
        aspectRatio: data.aspectRatio as string,
        variationSeed: data.variationSeed as number,
      };
      break;
    } catch (err) {
      lastSubmitErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < SUBMIT_MAX_RETRIES) {
        if (!isOnline()) {
          report('submitting', 0.05 + attempt * 0.02, '네트워크 연결을 기다리는 중...');
          const recovered = await waitForOnline();
          if (!recovered) break;
        }
        report('submitting', 0.05 + attempt * 0.02, `생성 요청 재시도 중 (${attempt + 1}/${SUBMIT_MAX_RETRIES})...`);
        await delay(SUBMIT_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  if (!submitData) {
    const msg = lastSubmitErr?.message ?? '비디오 생성 요청 실패';
    report('error', 0, msg);
    throw new Error(msg);
  }

  const draftLabel = isDraft ? '빠른 미리보기' : 'AI 비디오';
  report('generating', 0.1, `${draftLabel} 작업이 접수되었습니다. 완료되면 알려드릴게요...`);

  // Phase 2: Wait for completion via Supabase Realtime on video_jobs table.
  // Runway's webhook writes the result to video_jobs — we subscribe to that DB
  // change instead of polling the Runway API in a tight loop. A low-frequency
  // fallback poll guards against missed realtime events.
  const result = await waitForVideoCompletion(submitData, options.scanId, startTime, report);

  // Cache miss path: now that rendering is complete, archive the result
  // into ai_analysis_cache so future requests for the same image+tone
  // combination can skip the entire pipeline.
  if (options.imageHash && options.contentTone) {
    setMultiAngleCache(
      options.imageHash,
      options.contentTone,
      {
        productName: options.productName ?? '',
        prompt,
        scanId: options.scanId ?? '',
      },
      {
        captionText: options.captionText ?? '',
        hookCategory: options.hookCategory ?? '',
      },
      result.videoUrl,
    ).catch(() => {});
  }

  return result;
}

export function createVideoGenProgressTracker(
  onProgress: (progress: VideoGenProgress) => void,
): { update: (progress: number, message: string) => void; error: (message: string) => void; done: (message: string) => void } {
  const startTime = Date.now();
  return {
    update: (progress: number, message: string) => {
      const phase: VideoGenPhase = progress < 0.15 ? 'submitting' : progress < 1.0 ? 'generating' : 'completed';
      onProgress({
        phase,
        progress,
        message: `${message} (${Math.round(progress * 100)}%)`,
        elapsedSec: Math.round((Date.now() - startTime) / 1000),
      });
    },
    error: (message: string) => {
      onProgress({ phase: 'error', progress: 0, message, elapsedSec: Math.round((Date.now() - startTime) / 1000) });
    },
    done: (message: string) => {
      onProgress({ phase: 'completed', progress: 1.0, message, elapsedSec: Math.round((Date.now() - startTime) / 1000) });
    },
  };
}

async function buildVideoFunctionError(error: unknown): Promise<Error> {
  const fallback = error instanceof Error ? error.message : '비디오 생성 요청에 실패했습니다.';
  const response = (error as { context?: unknown } | null)?.context;

  if (response && typeof response === 'object' && 'clone' in response) {
    try {
      const cloned = (response as Response).clone();
      const contentType = cloned.headers.get('content-type') ?? '';
      const text = await cloned.text();
      if (contentType.includes('application/json') || text.trim().startsWith('{')) {
        const payload = JSON.parse(text) as { error?: unknown; message?: unknown; step?: unknown; provider?: unknown };
        const message = typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : fallback;
        const details = [
          typeof payload.step === 'string' ? `단계: ${payload.step}` : '',
          typeof payload.provider === 'string' ? `프로바이더: ${payload.provider}` : '',
        ].filter(Boolean).join(' · ');
        return new Error(details ? `${message} (${details})` : message);
      }
      if (text.trim().startsWith('<!') || text.trim().startsWith('<html') || contentType.includes('text/html')) {
        return new Error('AI 비디오 서버가 올바른 응답을 반환하지 않았습니다. 잠시 후 다시 시도해주세요.');
      }
      return new Error(fallback);
    } catch {
      return new Error(fallback);
    }
  }

  return new Error(fallback);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface VideoJobRow {
  status: string;
  step?: string | null;
  video_url: string | null;
  error_message: string | null;
  hd_status?: string | null;
  hd_video_url?: string | null;
  hd_task_id?: string | null;
}

const STEP_LABELS: Record<string, string> = {
  idle: '대기 중',
  analyzing: '다각도 컷 분석 중',
  hooking: '훅 문구 추출 중',
  planning: '편집 플랜 구성 중',
  submitting: 'AI 렌더링 요청 중',
  rendering: '영상 렌더링 중',
  finalizing: '최종 자막 합성 중',
  pending: '대기 중',
  processing: '영상 렌더링 중',
  running: '영상 렌더링 중',
  throttled: '렌더링 대기 중 (서버 혼잡)',
  queued: '큐 대기 중',
};

/**
 * Subscribe to the video_jobs table via Supabase Realtime and resolve when the
 * job transitions to SUCCESS or FAILED. A low-frequency DB poll runs in parallel
 * as a safety net in case the realtime event is missed.
 */
function waitForVideoCompletion(
  submitData: { taskId: string; motionPrompt: string; durationSec: number; aspectRatio: string; variationSeed: number },
  scanId: string | undefined,
  startTime: number,
  report: (phase: VideoGenPhase, progress: number, message: string) => void,
): Promise<VideoGenResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let elapsedTick = 0;
    let channelHealth: ChannelHealth = ChannelHealth.DISCONNECTED;
    let reconnectAttempts = 0;
    let pollBackoffAttempt = 0;

    const cleanup = () => {
      if (channel) supabase.removeChannel(channel);
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (softWarnTimer) clearTimeout(softWarnTimer);
      if (runwayPollTimer) clearTimeout(runwayPollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const handleRow = (row: VideoJobRow) => {
      if (row.status === 'SUCCESS' && row.video_url) {
        report('completed', 1.0, 'AI 비디오 생성 완료');
        finish(() => resolve({
          videoUrl: row.video_url!,
          jobId: submitData.taskId,
          motionPrompt: submitData.motionPrompt,
          durationSec: submitData.durationSec,
          aspectRatio: submitData.aspectRatio,
          variationSeed: submitData.variationSeed,
          persisted: true,
          provider: 'runway',
        }));
        return true;
      }
      if (row.status === 'FAILED') {
        const msg = row.error_message ?? 'Runway 비디오 생성에 실패했습니다.';
        report('error', 0, msg);
        finish(() => reject(new Error(msg)));
        return true;
      }
      // Non-terminal row: map the backend step to a progress value
      // so the UI reflects actual pipeline progress instead of a timer.
      const mapped = stepToProgress(row.step);
      if (mapped != null && mapped > 0) {
        const phase: VideoGenPhase = mapped >= 1.0 ? 'completed' : mapped >= 0.35 ? 'generating' : 'submitting';
        const stepLabel = row.step
          ? STEP_LABELS[row.step.toLowerCase()] ?? row.step
          : '처리 중';
        report(phase, mapped, `${stepLabel}...`);
      }
      return false;
    };

    // Check video_jobs table directly (used for initial check + fallback polling)
    const checkDb = async () => {
      if (settled || !scanId) return;
      try {
        const { data, error } = await supabase
          .from('video_jobs')
          .select('status, step, video_url, error_message')
          .eq('scan_id', scanId)
          .eq('task_id', submitData.taskId)
          .maybeSingle();
        if (error || !data) return;
        handleRow(data as VideoJobRow);
      } catch {
        // ignore — realtime subscription is the primary path
      }
    };

    // Also check scans.video_url for the persisted URL (webhook writes here too)
    const checkScanVideoUrl = async () => {
      if (settled || !scanId) return;
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('video_url')
          .eq('id', scanId)
          .maybeSingle();
        if (error || !data?.video_url) return;
        report('completed', 1.0, 'AI 비디오 생성 완료');
        finish(() => resolve({
          videoUrl: data.video_url!,
          jobId: submitData.taskId,
          motionPrompt: submitData.motionPrompt,
          durationSec: submitData.durationSec,
          aspectRatio: submitData.aspectRatio,
          variationSeed: submitData.variationSeed,
          persisted: true,
          provider: 'runway',
        }));
      } catch {
        // ignore
      }
    };

    // Primary path: Realtime subscription on video_jobs with health monitoring
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const setupChannel = () => {
      if (settled || !scanId) return;
      channel = supabase
        .channel(`video-job:${scanId}:${submitData.taskId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
          (payload) => {
            if (!payload.new) return;
            // Realtime event received — channel is healthy, reset backoff
            channelHealth = ChannelHealth.HEALTHY;
            pollBackoffAttempt = 0;
            reconnectAttempts = 0;
            handleRow(payload.new as VideoJobRow);
          },
        )
        .subscribe((status: string) => {
          if (settled) return;
          if (status === 'SUBSCRIBED') {
            channelHealth = ChannelHealth.HEALTHY;
            reconnectAttempts = 0;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            channelHealth = ChannelHealth.DEGRADED;
            // Exponentially increase poll frequency when channel is unhealthy
            pollBackoffAttempt = 0;
            scheduleReconnect();
          } else if (status === 'CLOSED') {
            channelHealth = ChannelHealth.DISCONNECTED;
            pollBackoffAttempt = 0;
            scheduleReconnect();
          }
        });
    };

    const scheduleReconnect = () => {
      if (settled || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts);
      reconnectAttempts++;
      report('generating', 0.12, `실시간 연결이 불안정합니다. 재연결 시도 중 (${reconnectAttempts}/${CHANNEL_MAX_RECONNECT_ATTEMPTS})...`);
      reconnectTimer = setTimeout(() => {
        if (settled) return;
        if (channel) {
          try { supabase.removeChannel(channel); } catch { /* ignore */ }
          channel = null;
        }
        setupChannel();
      }, delayMs);
    };

    setupChannel();

    // Safety-net: adaptive DB poll with exponential backoff.
    // When the realtime channel is healthy, back off to reduce unnecessary
    // DB queries. When the channel degrades, reset to fast polling.
    const scheduleNextPoll = () => {
      if (settled) return;
      const interval = channelHealth === ChannelHealth.HEALTHY
        ? computeBackoffDelay(pollBackoffAttempt)
        : POLL_MIN_INTERVAL_MS; // Fast poll when channel is degraded
      pollTimer = setTimeout(async () => {
        if (settled) return;
        elapsedTick++;
        await Promise.all([checkDb(), checkScanVideoUrl()]);
        if (!settled) {
          const elapsedSec = Math.round((Date.now() - startTime) / 1000);
          const timeProgress = Math.min(0.1 + (elapsedSec / 180) * 0.8, 0.95);
          const healthHint = channelHealth === ChannelHealth.HEALTHY
            ? ''
            : ' (실시간 연결 불안정 — 폴링으로 대체 중)';
          report('generating', timeProgress, `AI가 영상을 렌더링하고 있어요 (${elapsedSec}초)${healthHint}...`);
          if (channelHealth === ChannelHealth.HEALTHY) {
            pollBackoffAttempt++;
          }
          scheduleNextPoll();
        }
      }, interval);
    };
    scheduleNextPoll();

    // Runway API direct-poll fallback: after 30s, if DB still shows no result,
    // poll the Runway API directly every 15s as a second safety net.
    // This catches cases where the webhook fails but Runway has the video ready.
    let runwayPollTimer: ReturnType<typeof setTimeout> | null = null;
    const startRunwayPollFallback = () => {
      if (settled || runwayPollTimer) return;
      const runwayPoll = async () => {
        if (settled) return;
        try {
          const { data, error } = await supabase.functions.invoke('generate-video', {
            body: { mode: 'poll', taskId: submitData.taskId, scanId },
          });
          if (error) { scheduleNext(); return; }
          const resp = data as { status?: string; videoUrl?: string; error?: string };
          if (resp.status === 'SUCCESS' && resp.videoUrl) {
            report('completed', 1.0, 'AI 비디오 생성 완료');
            finish(() => resolve({
              videoUrl: resp.videoUrl!,
              jobId: submitData.taskId,
              motionPrompt: submitData.motionPrompt,
              durationSec: submitData.durationSec,
              aspectRatio: submitData.aspectRatio,
              variationSeed: submitData.variationSeed,
              persisted: true,
              provider: 'runway',
            }));
            return;
          }
          if (resp.status === 'FAILED') {
            const msg = resp.error ?? 'Runway 비디오 생성에 실패했습니다.';
            report('error', 0, msg);
            finish(() => reject(new Error(msg)));
            return;
          }
        } catch {
          // ignore — DB poll and realtime are still running
        }
        scheduleNext();
      };
      const scheduleNext = () => {
        if (settled) return;
        runwayPollTimer = setTimeout(runwayPoll, RUNWAY_POLL_FALLBACK_INTERVAL_MS);
      };
      runwayPoll();
    };
    setTimeout(startRunwayPollFallback, RUNWAY_POLL_FALLBACK_START_MS);

    // Soft warning at 120s — don't reject, just inform the user
    let softWarnTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (settled) return;
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      report('generating', 0.85, `렌더링이 조금 오래 걸리고 있어요 (${elapsedSec}초). 백그라운드에서 계속 진행 중입니다...`);
    }, REALTIME_SOFT_WARN_MS);

    // Overall timeout — 5 minutes. Don't orphan the job; inform the user.
    timeoutTimer = setTimeout(() => {
      const msg = `비디오 생성이 5분을 초과했습니다. 서버에서는 계속 렌더링 중일 수 있어요. 잠시 후 이 페이지를 다시 방문하면 완성된 영상을 확인할 수 있습니다.`;
      report('error', 0, msg);
      finish(() => reject(new Error(msg)));
    }, REALTIME_TIMEOUT_MS);

    // Initial DB check in case the webhook already completed before we subscribed
    checkDb();
    checkScanVideoUrl();
  });
}

/**
 * Stage 1: Submit a fast draft video (low-res, 3sec) and wait for it via Realtime.
 * Returns as soon as the draft is ready so the user can preview it immediately.
 */
export async function submitVideoDraft(
  prompt: string,
  options: GenerateAiVideoOptions,
  onProgress?: (progress: VideoGenProgress) => void,
): Promise<VideoGenResult> {
  return generateAiVideo(prompt, { ...options, draft: true }, onProgress);
}

export interface SubmitOnlyResult {
  taskId: string;
  motionPrompt: string;
  durationSec: number;
  aspectRatio: string;
  variationSeed: number;
}

/**
 * Submit a video generation job to the edge function and return immediately
 * with the task ID. Does NOT wait for completion — the caller should use
 * subscribeVideoJob to listen for the result via Realtime.
 */
export async function submitVideoJobAsync(
  prompt: string,
  options: GenerateAiVideoOptions,
): Promise<SubmitOnlyResult> {
  const { data, error } = await supabase.functions.invoke('generate-video', {
    body: {
      mode: 'submit',
      prompt,
      durationSec: options.durationSec ?? 5,
      aspectRatio: options.aspectRatio ?? '9:16',
      productName: options.productName,
      scanId: options.scanId,
      variationSeed: options.variationSeed ?? 0,
      bgmMood: options.bgmMood,
      captionText: options.captionText,
      platform: options.platform ?? 'shorts',
      hookCategory: options.hookCategory ?? 'curiosity',
      cutCount: options.cutCount,
      productVision: options.productVision ?? null,
      draft: options.draft ?? false,
      isCleanVideoMode: options.isCleanVideoMode ?? false,
      promptStrength: options.promptStrength,
      negativePrompt: options.negativePrompt,
      bgStyle: options.bgStyle,
      outfitIntensity: options.outfitIntensity,
      zoomSpeed: options.zoomSpeed,
      cameraRotation: options.cameraRotation,
      transitionEffect: options.transitionEffect,
      stylePreset: options.stylePreset,
      detailRestoration: options.detailRestoration,
      hdUpscale: options.hdUpscale,
      qualityTier: options.hdUpscale ? 'pro' : (options.qualityTier ?? 'standard'),
      resolution: options.resolution ?? (options.hdUpscale ? '1080p' : '720p'),
      fps: options.fps ?? (options.hdUpscale ? 30 : 24),
      selectedMode: options.selectedMode,
      enableOrbit360: options.enableOrbit360,
      orbitSpeed: options.orbitSpeed,
      enableCaustics: options.enableCaustics,
      enableVirtualFitting: options.enableVirtualFitting,
      enableFabricPhysics: options.enableFabricPhysics,
    },
  });

  if (error) throw await buildVideoFunctionError(error);
  if (!data || typeof data.taskId !== 'string') {
    throw new Error('서버가 작업 ID를 반환하지 않았습니다.');
  }

  return {
    taskId: data.taskId,
    motionPrompt: data.motionPrompt as string,
    durationSec: data.durationSec as number,
    aspectRatio: data.aspectRatio as string,
    variationSeed: data.variationSeed as number,
  };
}

export type VideoJobCallback = (result: { status: 'SUCCESS' | 'FAILED'; videoUrl?: string; error?: string }) => void;

/**
 * Subscribe to a video job via Supabase Realtime on the video_jobs table.
 * Calls the callback when the job transitions to SUCCESS or FAILED.
 * Returns an unsubscribe function. Includes adaptive DB polling as a
 * safety net, same strategy as subscribeHdUpgrade.
 */
export function subscribeVideoJob(
  scanId: string,
  taskId: string,
  callback: VideoJobCallback,
): () => void {
  let settled = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let channelHealth: ChannelHealth = ChannelHealth.DISCONNECTED;
  let reconnectAttempts = 0;
  let pollBackoffAttempt = 0;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const checkAndNotify = async () => {
    if (settled) return;
    try {
      const { data, error } = await supabase
        .from('video_jobs')
        .select('status, video_url, error_message')
        .eq('scan_id', scanId)
        .eq('task_id', taskId)
        .maybeSingle();
      if (error || !data) return;
      const row = data as VideoJobRow;
      if (row.status === 'SUCCESS' && row.video_url) {
        settled = true;
        cleanup();
        callback({ status: 'SUCCESS', videoUrl: row.video_url });
      } else if (row.status === 'FAILED') {
        settled = true;
        cleanup();
        callback({ status: 'FAILED', error: row.error_message ?? '비디오 생성에 실패했습니다.' });
      }
    } catch {
      // ignore
    }
  };

  const cleanup = () => {
    if (channel) supabase.removeChannel(channel);
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };

  const scheduleReconnect = () => {
    if (settled || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts);
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      if (settled) return;
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      setupChannel();
    }, delayMs);
  };

  const setupChannel = () => {
    if (settled) return;
    channel = supabase
      .channel(`video-job:${scanId}:${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
        (payload) => {
          if (!payload.new) return;
          channelHealth = ChannelHealth.HEALTHY;
          pollBackoffAttempt = 0;
          reconnectAttempts = 0;
          const row = payload.new as VideoJobRow;
          if (row.status === 'SUCCESS' && row.video_url) {
            if (settled) return;
            settled = true;
            cleanup();
            callback({ status: 'SUCCESS', videoUrl: row.video_url });
          } else if (row.status === 'FAILED') {
            if (settled) return;
            settled = true;
            cleanup();
            callback({ status: 'FAILED', error: row.error_message ?? '비디오 생성에 실패했습니다.' });
          }
        },
      )
      .subscribe((status: string) => {
        if (settled) return;
        if (status === 'SUBSCRIBED') {
          channelHealth = ChannelHealth.HEALTHY;
          reconnectAttempts = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelHealth = ChannelHealth.DEGRADED;
          pollBackoffAttempt = 0;
          scheduleReconnect();
        }
      });
  };

  const scheduleNextPoll = () => {
    if (settled) return;
    const interval = channelHealth === ChannelHealth.HEALTHY
      ? computeBackoffDelay(pollBackoffAttempt)
      : POLL_MIN_INTERVAL_MS;
    pollTimer = setTimeout(async () => {
      if (settled) return;
      await checkAndNotify();
      if (!settled) {
        if (channelHealth === ChannelHealth.HEALTHY) {
          pollBackoffAttempt++;
        }
        scheduleNextPoll();
      }
    }, interval);
  };

  setupChannel();
  scheduleNextPoll();
  checkAndNotify();

  return () => {
    settled = true;
    cleanup();
  };
}

/**
 * Stage 2: Submit an HD upgrade job for an existing draft and return immediately
 * with the HD task ID. The caller should then call subscribeHdUpgrade to listen
 * for completion and swap the video URL when ready.
 */
export async function upgradeVideoToHd(
  scanId: string,
  draftJobId: string,
  prompt: string,
  options: GenerateAiVideoOptions,
): Promise<{ hdTaskId: string; hdJobId: string }> {
  const { data, error } = await supabase.functions.invoke('generate-video', {
    body: {
      mode: 'submit',
      prompt,
      durationSec: options.durationSec ?? 5,
      aspectRatio: options.aspectRatio ?? '9:16',
      productName: options.productName,
      scanId,
      variationSeed: options.variationSeed ?? 0,
      bgmMood: options.bgmMood,
      captionText: options.captionText,
      platform: options.platform ?? 'shorts',
      hookCategory: options.hookCategory ?? 'curiosity',
      cutCount: options.cutCount,
      productVision: options.productVision ?? null,
      draft: false,
      isCleanVideoMode: options.isCleanVideoMode ?? false,
      promptStrength: options.promptStrength,
      negativePrompt: options.negativePrompt,
      bgStyle: options.bgStyle,
      outfitIntensity: options.outfitIntensity,
      zoomSpeed: options.zoomSpeed,
      cameraRotation: options.cameraRotation,
      transitionEffect: options.transitionEffect,
      stylePreset: options.stylePreset,
      detailRestoration: options.detailRestoration,
      hdUpscale: true,
      qualityTier: 'pro',
      resolution: options.resolution ?? '1080p',
      fps: options.fps ?? 30,
      selectedMode: options.selectedMode,
      enableOrbit360: options.enableOrbit360,
      orbitSpeed: options.orbitSpeed,
      enableCaustics: options.enableCaustics,
      enableVirtualFitting: options.enableVirtualFitting,
      enableFabricPhysics: options.enableFabricPhysics,
    },
  });

  if (error) throw await buildVideoFunctionError(error);
  if (!data || typeof data.taskId !== 'string') {
    throw new Error('서버가 HD 작업 ID를 반환하지 않았습니다.');
  }

  const hdTaskId = data.taskId as string;

  // Record the HD task on the existing video_jobs row
  try {
    await supabase
      .from('video_jobs')
      .update({ hd_task_id: hdTaskId, hd_status: 'PENDING' })
      .eq('scan_id', scanId)
      .eq('task_id', draftJobId);
  } catch {
    // non-fatal — the HD job still runs on Runway's side
  }

  return { hdTaskId, hdJobId: hdTaskId };
}

export type HdUpgradeCallback = (result: { status: 'SUCCESS' | 'FAILED'; videoUrl?: string; error?: string }) => void;

/**
 * Subscribe to the HD upgrade job via Supabase Realtime. Calls the callback
 * when the hd_status column transitions to SUCCESS or FAILED. Returns an
 * unsubscribe function.
 */
export function subscribeHdUpgrade(
  scanId: string,
  draftJobId: string,
  callback: HdUpgradeCallback,
): () => void {
  let settled = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let channelHealth: ChannelHealth = ChannelHealth.DISCONNECTED;
  let reconnectAttempts = 0;
  let pollBackoffAttempt = 0;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const checkAndNotify = async () => {
    if (settled) return;
    try {
      const { data, error } = await supabase
        .from('video_jobs')
        .select('hd_status, hd_video_url, error_message')
        .eq('scan_id', scanId)
        .eq('task_id', draftJobId)
        .maybeSingle();
      if (error || !data) return;
      const row = data as VideoJobRow;
      if (row.hd_status === 'SUCCESS' && row.hd_video_url) {
        settled = true;
        cleanup();
        callback({ status: 'SUCCESS', videoUrl: row.hd_video_url });
      } else if (row.hd_status === 'FAILED') {
        settled = true;
        cleanup();
        callback({ status: 'FAILED', error: row.error_message ?? 'HD 업그레이드에 실패했습니다.' });
      }
    } catch {
      // ignore
    }
  };

  const cleanup = () => {
    if (channel) supabase.removeChannel(channel);
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };

  const scheduleReconnect = () => {
    if (settled || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts);
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      if (settled) return;
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      setupChannel();
    }, delayMs);
  };

  const setupChannel = () => {
    if (settled) return;
    channel = supabase
      .channel(`hd-upgrade:${scanId}:${draftJobId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
        (payload) => {
          if (!payload.new) return;
          channelHealth = ChannelHealth.HEALTHY;
          pollBackoffAttempt = 0;
          reconnectAttempts = 0;
          const row = payload.new as VideoJobRow;
          if (row.hd_status === 'SUCCESS' && row.hd_video_url) {
            if (settled) return;
            settled = true;
            cleanup();
            callback({ status: 'SUCCESS', videoUrl: row.hd_video_url });
          } else if (row.hd_status === 'FAILED') {
            if (settled) return;
            settled = true;
            cleanup();
            callback({ status: 'FAILED', error: row.error_message ?? 'HD 업그레이드에 실패했습니다.' });
          }
        },
      )
      .subscribe((status: string) => {
        if (settled) return;
        if (status === 'SUBSCRIBED') {
          channelHealth = ChannelHealth.HEALTHY;
          reconnectAttempts = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelHealth = ChannelHealth.DEGRADED;
          pollBackoffAttempt = 0;
          scheduleReconnect();
        }
      });
  };

  // Adaptive DB poll with exponential backoff — same strategy as waitForVideoCompletion
  const scheduleNextPoll = () => {
    if (settled) return;
    const interval = channelHealth === ChannelHealth.HEALTHY
      ? computeBackoffDelay(pollBackoffAttempt)
      : POLL_MIN_INTERVAL_MS;
    pollTimer = setTimeout(async () => {
      if (settled) return;
      await checkAndNotify();
      if (!settled) {
        if (channelHealth === ChannelHealth.HEALTHY) {
          pollBackoffAttempt++;
        }
        scheduleNextPoll();
      }
    }, interval);
  };

  setupChannel();
  scheduleNextPoll();
  checkAndNotify();

  return () => {
    settled = true;
    cleanup();
  };
}

/**
 * Check the database for a previously-submitted video job that may have
 * completed after the client timed out or the user navigated away.
 * Returns the video URL if the job is already done, or null if it's still
 * pending or was never submitted. Also checks scans.video_url as a fallback
 * since the webhook writes there too.
 */
export async function recoverVideoJob(
  scanId: string,
): Promise<{ videoUrl: string; isHd: boolean; status: string } | null> {
  try {
    const { data, error } = await supabase
      .from('video_jobs')
      .select('status, step, video_url, error_message, is_hd, hd_status, hd_video_url')
      .eq('scan_id', scanId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // Fallback: check scans.video_url directly
      const { data: scanData } = await supabase
        .from('scans')
        .select('video_url')
        .eq('id', scanId)
        .maybeSingle();
      if (scanData?.video_url) {
        return { videoUrl: scanData.video_url, isHd: false, status: 'SUCCESS' };
      }
      return null;
    }

    const row = data as VideoJobRow & { is_hd?: boolean };

    // Check HD result first (if HD was requested)
    if (row.hd_status === 'SUCCESS' && row.hd_video_url) {
      return { videoUrl: row.hd_video_url, isHd: true, status: 'SUCCESS' };
    }

    // Check standard result
    if (row.status === 'SUCCESS' && row.video_url) {
      return { videoUrl: row.video_url, isHd: row.is_hd ?? false, status: 'SUCCESS' };
    }

    if (row.status === 'FAILED') {
      return { videoUrl: '', isHd: false, status: 'FAILED' };
    }

    return null;
  } catch {
    return null;
  }
}

