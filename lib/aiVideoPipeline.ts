import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { supabase, ensureFreshSession } from './supabase';
import { monotonicStart, monotonicElapsedSec, monotonicElapsedMs } from './timeUtils';
import type { ProductVisionResult } from './productVision';
import { isOnline } from '@/hooks/useNetworkStatus';
import { getMultiAngleCache, setMultiAngleCache, findSimilarMultiAngleCache } from './aiCache';
import { hashMotionTemplate } from './contentHash';
import { stepToProgress } from './videoGenSteps';
import { autoSelectHook } from './autoHookEngine';
import { logError, addBreadcrumb } from './errorLogger';

export type VideoGenPhase = 'submitting' | 'generating' | 'completed' | 'error' | 'hd_upgrading' | 'hd_completed';

export interface VideoGenProgress {
  phase: VideoGenPhase;
  progress: number;
  message: string;
  elapsedSec: number;
  /** Current server-side step (from video_jobs.step / Realtime push). */
  serverStep?: string | null;
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
  memeFormat?: string;
  memeText?: string;
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
  mainImageUrl?: string;
  signal?: AbortSignal;
}


const SUBMIT_MAX_RETRIES = 2;
const SUBMIT_RETRY_DELAY_MS = 500;
const REALTIME_TIMEOUT_MS = 300_000;
const REALTIME_SOFT_WARN_MS = 120_000;
const RUNWAY_POLL_FALLBACK_INTERVAL_MS = 12000;
const RUNWAY_POLL_FALLBACK_START_MS = 20_000;
const FIRST_POLL_DELAY_MS = 3000;
const POLL_MIN_INTERVAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 15000;
const POLL_BACKOFF_FACTOR = 1.6;
const POLL_FAST_PHASE_MS = 15_000;
const POLL_NORMAL_PHASE_MS = 30_000;
const CHANNEL_RECONNECT_DELAY_MS = 3000;
const JITTER = () => 0.8 + Math.random() * 0.4;
const CHANNEL_MAX_RECONNECT_ATTEMPTS = 5;

const BG_MAX_WAIT_MS = 120_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 10;
const POLL_FAIL_MESSAGE = '서버 응답이 지연되고 있습니다. 작업 목록에서 나중에 결과를 확인해 주세요.';

/**
 * Install an AppState listener that pauses all timers/channels when the app
 * goes to background and resumes them on return. After BG_MAX_WAIT_MS in
 * background, calls onBackgroundTimeout to settle the job and stop polling.
 * Returns a cleanup function that removes the listener.
 */
function installBackgroundPause(opts: {
  isSettled: () => boolean;
  pause: () => void;
  resume: () => void;
  onBackgroundTimeout: () => void;
}): () => void {
  let bgTimer: ReturnType<typeof setTimeout> | null = null;
  let isBackgrounded = false;

  const handleAppState = (nextState: string) => {
    if (nextState === 'background' || nextState === 'inactive') {
      if (isBackgrounded || opts.isSettled()) return;
      isBackgrounded = true;
      opts.pause();
      bgTimer = setTimeout(() => {
        if (opts.isSettled()) return;
        opts.onBackgroundTimeout();
      }, BG_MAX_WAIT_MS);
    } else if (nextState === 'active') {
      if (!isBackgrounded || opts.isSettled()) return;
      isBackgrounded = false;
      if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
      opts.resume();
    }
  };

  const unsubAppState = registerAppStateHandler('deferred', handleAppState);
  return () => {
    if (bgTimer) clearTimeout(bgTimer);
    unsubAppState();
  };
}

enum ChannelHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  DISCONNECTED = 'disconnected',
}

function computeBackoffDelay(attempt: number, elapsedMs?: number): number {
  const base = POLL_MIN_INTERVAL_MS * Math.pow(POLL_BACKOFF_FACTOR, attempt);
  const attemptBased = Math.min(Math.round(base), POLL_MAX_INTERVAL_MS);
  if (elapsedMs == null) return attemptBased;
  if (elapsedMs < POLL_FAST_PHASE_MS) return POLL_MIN_INTERVAL_MS;
  if (elapsedMs < POLL_NORMAL_PHASE_MS) return Math.min(4000, attemptBased);
  return attemptBased;
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

const INVOKE_TIMEOUT_MS = 90_000;

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function compactBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean' && value === false) continue;
    out[key] = value;
  }
  return out;
}

function invokeWithTimeout(
  fnName: string,
  body: Record<string, unknown>,
  timeoutMs = INVOKE_TIMEOUT_MS,
): Promise<{ data: unknown; error: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const invokePromise = supabase.functions.invoke(fnName, { body, signal: controller.signal }) as Promise<{ data: unknown; error: unknown }>;
  return invokePromise
    .finally(() => clearTimeout(timeoutId))
    .catch((err: unknown) => {
      if (err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))) {
        return { data: null, error: new Error('AI 서버 응답 시간이 초과되었습니다. 네트워크 상태를 확인하고 다시 시도해주세요.') };
      }
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    });
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
      const { data, error } = await invokeWithTimeout(fnName, body);
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      lastError = err;
      const errStatus = (err as { status?: number }).status;
      const isAuthError = errStatus === 401 || errStatus === 403;
      const isRateLimited = errStatus === 429;
      const isTimeout = err instanceof Error && (err.message.includes('초과') || err.message.includes('timeout'));
      if (isAuthError && attempt < maxRetries) {
        await ensureFreshSession();
        onRetry?.(attempt + 1, '인증 세션 갱신 중...');
        await delay(SUBMIT_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      if (isRateLimited && attempt < maxRetries) {
        const rateLimitDelay = Math.min(2000 * Math.pow(2, attempt), 16000);
        onRetry?.(attempt + 1, '요청 제한으로 인해 대기 중...');
        await delay(rateLimitDelay);
        continue;
      }
      if (attempt < maxRetries && (isNetworkError(err) || isTimeout)) {
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
  const startTime = monotonicStart();

  const report = (phase: VideoGenPhase, progress: number, message: string, serverStep?: string | null) => {
    onProgress?.({
      phase,
      progress,
      message,
      elapsedSec: monotonicElapsedSec(startTime),
      serverStep: serverStep ?? undefined,
    });
  };

  const isDraft = options.draft === true;

  // Cache hit check: if we have an imageHash + contentTone, look up
  // ai_analysis_cache before submitting to the render queue. On a hit,
  // skip the entire LLM + rendering pipeline and return the cached video.
  // The cache key includes a motion_template_hash so the same images with
  // different style/duration/camera settings produce separate entries.
  const motionTemplateHash = hashMotionTemplate({
    stylePreset: options.stylePreset,
    durationSec: options.durationSec,
    aspectRatio: options.aspectRatio,
    hookCategory: options.hookCategory,
    cameraRotation: options.cameraRotation,
    zoomSpeed: options.zoomSpeed,
    transitionEffect: options.transitionEffect,
    enableOrbit360: options.enableOrbit360,
    orbitSpeed: options.orbitSpeed,
    enableCaustics: options.enableCaustics,
    enableVirtualFitting: options.enableVirtualFitting,
    enableFabricPhysics: options.enableFabricPhysics,
    isCleanVideoMode: options.isCleanVideoMode,
    promptStrength: options.promptStrength,
    negativePrompt: options.negativePrompt,
    bgStyle: options.bgStyle,
    outfitIntensity: options.outfitIntensity,
    detailRestoration: options.detailRestoration,
    qualityTier: options.qualityTier,
    resolution: options.resolution,
    fps: options.fps,
    selectedMode: options.selectedMode,
  });

  if (options.imageHash && options.contentTone && !isDraft) {
    const [cached, similar] = await Promise.all([
      getMultiAngleCache(options.imageHash, options.contentTone, motionTemplateHash),
      options.contentTone
        ? findSimilarMultiAngleCache(motionTemplateHash, options.contentTone, options.productVision?.productCategory)
        : Promise.resolve(null),
    ]);
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
    if (similar) {
      report('completed', 1.0, `유사 템플릿 매칭 — 즉시 완료 (유사도 ${Math.round(similar.similarityScore * 100)}%)`);
      // Store as an exact-match entry for this user's image hash so future
      // requests don't need the similar-cache lookup.
      if (options.imageHash) {
        setMultiAngleCache(
          options.imageHash,
          options.contentTone,
          similar.productContext,
          similar.hookOptions,
          similar.renderedVideoUrl,
          motionTemplateHash,
        ).catch(() => {});
      }
      return {
        videoUrl: similar.renderedVideoUrl,
        jobId: '',
        motionPrompt: '',
        durationSec: options.durationSec ?? 5,
        aspectRatio: options.aspectRatio ?? '9:16',
        variationSeed: options.variationSeed ?? 0,
        persisted: true,
        provider: 'similar-cache',
      };
    }
  }

  report('submitting', 0.05, isDraft ? '빠른 미리보기 생성 요청 중...' : 'AI 비디오 생성 요청 전송 중...');

  // Phase 1: Submit task
  let submitData: { taskId: string; motionPrompt: string; durationSec: number; aspectRatio: string; variationSeed: number } | null = null;
  let lastSubmitErr: Error | null = null;

  for (let attempt = 0; attempt <= SUBMIT_MAX_RETRIES; attempt++) {
    let softNudge: ReturnType<typeof setTimeout> | null = null;
    try {
      if (attempt === 0) {
        await ensureFreshSession();
      }
      // Soft timeout: nudge progress forward after 10s so the UI doesn't
      // appear frozen at 5-8% while the server is still processing.
      softNudge = setTimeout(() => {
        report('submitting', 0.10, 'AI가 훅 문구를 분석하고 렌더링을 준비하는 중...');
      }, 10_000);
      const result = await invokeWithNetworkRetry(
        'generate-video',
        compactBody({
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
          memeFormat: options.memeFormat,
          memeText: options.memeText,
          cutCount: options.cutCount,
          productVision: options.productVision,
          draft: isDraft,
          isCleanVideoMode: options.isCleanVideoMode,
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
          mainImageUrl: options.mainImageUrl,
        }),
        0,
        (retryAttempt) => report('submitting', 0.05 + retryAttempt * 0.02, `네트워크 복구 후 재시도 중 (${retryAttempt}/${SUBMIT_MAX_RETRIES})...`),
      );
      clearTimeout(softNudge);

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
      if (softNudge) clearTimeout(softNudge);
      lastSubmitErr = err instanceof Error ? err : new Error(String(err));
      const errStatus = (err as { status?: number }).status;
      if (errStatus === 401 || errStatus === 403) {
        report('error', 0, '인증 세션이 만료되었습니다. 앱을 새로고침하고 다시 시도해주세요.');
        throw new Error('인증 세션이 만료되었습니다. 앱을 새로고침하고 다시 시도해주세요.');
      }
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
  const result = await waitForVideoCompletion(submitData, options.scanId, startTime, report, options.signal);

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
      motionTemplateHash,
    ).catch(() => {});
  }

  return result;
}

export function createVideoGenProgressTracker(
  onProgress: (progress: VideoGenProgress) => void,
): { update: (progress: number, message: string) => void; error: (message: string) => void; done: (message: string) => void } {
  const startTime = monotonicStart();
  return {
    update: (progress: number, message: string) => {
      const phase: VideoGenPhase = progress < 0.15 ? 'submitting' : progress < 1.0 ? 'generating' : 'completed';
      onProgress({
        phase,
        progress,
        message: `${message} (${Math.round(progress * 100)}%)`,
        elapsedSec: monotonicElapsedSec(startTime),
      });
    },
    error: (message: string) => {
      onProgress({ phase: 'error', progress: 0, message, elapsedSec: monotonicElapsedSec(startTime) });
    },
    done: (message: string) => {
      onProgress({ phase: 'completed', progress: 1.0, message, elapsedSec: monotonicElapsedSec(startTime) });
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
  report: (phase: VideoGenPhase, progress: number, message: string, serverStep?: string | null) => void,
  signal?: AbortSignal,
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

    // All timers declared early so cleanup/fullCleanup/finish can reference them
    // without hitting a temporal dead zone (TDZ).
    let softWarnTimer: ReturnType<typeof setTimeout> | null = null;
    let runwayPollTimer: ReturnType<typeof setTimeout> | null = null;
    let resumeBurstTimer: ReturnType<typeof setTimeout> | null = null;
    let bgTimer: ReturnType<typeof setTimeout> | null = null;
    let runwayFallbackStartTimer: ReturnType<typeof setTimeout> | null = null;
    let isBackgrounded = false;
    let appSub: (() => void) | null = null;

    const cleanup = () => {
      if (channel) supabase.removeChannel(channel);
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (softWarnTimer) clearTimeout(softWarnTimer);
      if (runwayPollTimer) clearTimeout(runwayPollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };

    const fullCleanup = () => {
      cleanup();
      if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
      if (runwayFallbackStartTimer) { clearTimeout(runwayFallbackStartTimer); runwayFallbackStartTimer = null; }
      if (resumeBurstTimer) { clearTimeout(resumeBurstTimer); resumeBurstTimer = null; }
      appSub?.();
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fullCleanup();
      if (abortListener) signal?.removeEventListener('abort', abortListener);
      fn();
    };

    // External abort: user navigated away or cancelled the operation
    const abortError = () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      return err;
    };
    const abortListener = () => {
      finish(() => reject(abortError()));
    };
    if (signal) {
      if (signal.aborted) {
        finish(() => reject(abortError()));
        return;
      }
      signal.addEventListener('abort', abortListener, { once: true });
    }

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
        report(phase, mapped, `${stepLabel}...`, row.step);
      }
      return false;
    };

    // Check video_jobs table directly (used for initial check + fallback polling)
    let consecutivePollFailures = 0;
    const checkDb = async () => {
      if (settled || !scanId) return;
      try {
        let query = supabase
          .from('video_jobs')
          .select('status, step, video_url, error_message')
          .eq('scan_id', scanId);
        // Only filter by task_id when it's a real server-issued ID. Soft
        // fallback IDs (soft-...) don't exist in the DB, so querying by
        // scanId alone finds the real job row the server created.
        if (!submitData.taskId.startsWith('soft-')) {
          query = query.eq('task_id', submitData.taskId);
        }
        const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return;
        consecutivePollFailures = 0;
        handleRow(data as VideoJobRow);
      } catch (err) {
        consecutivePollFailures++;
        logError(err, { component: 'aiVideoPipeline', action: 'checkDb', extra: { consecutivePollFailures } });
        if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          const msg = POLL_FAIL_MESSAGE;
          report('error', 0, msg);
          finish(() => reject(new Error(msg)));
        }
      }
    };

    // Also check scans.video_url for the persisted URL (webhook writes here too)
    const checkScanVideoUrl = async () => {
      if (settled || !scanId) return;
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('video_url, muxed_video_url')
          .eq('id', scanId)
          .maybeSingle();
        if (error || !data) return;
        const finalUrl = data.muxed_video_url ?? data.video_url;
        if (!finalUrl) return;
        report('completed', 1.0, 'AI 비디오 생성 완료');
        finish(() => resolve({
          videoUrl: finalUrl,
          jobId: submitData.taskId,
          motionPrompt: submitData.motionPrompt,
          durationSec: submitData.durationSec,
          aspectRatio: submitData.aspectRatio,
          variationSeed: submitData.variationSeed,
          persisted: true,
          provider: 'runway',
        }));
      } catch (err) {
        logError(err, { component: 'aiVideoPipeline', action: 'checkScanVideoUrl' });
      }
    };

    // Primary path: Realtime subscription on video_jobs with health monitoring
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const setupChannel = () => {
      if (settled || !scanId) return;
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      channel = supabase
        .channel(`video-job:${scanId}:${submitData.taskId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
          (payload) => {
            if (!payload.new) return;
            try {
              channelHealth = ChannelHealth.HEALTHY;
              pollBackoffAttempt = 0;
              reconnectAttempts = 0;
              handleRow(payload.new as VideoJobRow);
            } catch (err) {
              addBreadcrumb('realtime', 'Realtime callback error', 'warning', { channel: `video-job:${scanId}:${submitData.taskId}` });
            }
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
      const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts) * JITTER();
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
      const elapsed = monotonicElapsedMs(startTime);
      const interval = channelHealth === ChannelHealth.HEALTHY
        ? computeBackoffDelay(pollBackoffAttempt, elapsed)
        : POLL_MIN_INTERVAL_MS;
      pollTimer = setTimeout(async () => {
        if (settled) return;
        elapsedTick++;
        await Promise.all([checkDb(), checkScanVideoUrl()]);
        if (!settled) {
          const elapsedSec = monotonicElapsedSec(startTime);
          const timeProgress = Math.min(0.15 + (elapsedSec / 120) * 0.82, 0.97);
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
    // First poll fires at 500ms — near-immediate check after job ID receipt,
    // then scheduleNextPoll takes over with adaptive backoff.
    pollTimer = setTimeout(async () => {
      if (settled) return;
      await Promise.all([checkDb(), checkScanVideoUrl()]);
      if (!settled) scheduleNextPoll();
    }, FIRST_POLL_DELAY_MS);

    // Runway API direct-poll fallback: after 15s, if DB still shows no result,
    // poll the Runway API directly every 15s as a second safety net.
    // This catches cases where the webhook fails but Runway has the video ready.
    // (runwayPollTimer declared early above for TDZ safety)
    const startRunwayPollFallback = () => {
      if (settled || runwayPollTimer) return;
      // Skip Runway API direct poll when the task ID is a soft-fallback
      // placeholder — the real Runway task ID is unknown, so this poll
      // would always fail. The DB poll by scanId will catch the result.
      if (submitData.taskId.startsWith('soft-')) return;
      const runwayPoll = async () => {
        if (settled) return;
        try {
          const pollController = new AbortController();
          const pollTimeoutId = setTimeout(() => pollController.abort(), INVOKE_TIMEOUT_MS);
          const { data, error } = await supabase.functions.invoke('generate-video', {
            body: { mode: 'poll', taskId: submitData.taskId, scanId },
            signal: pollController.signal,
          }).finally(() => clearTimeout(pollTimeoutId));
          if (error) {
            const errStatus = (error as { status?: number }).status;
            if (errStatus === 401 || errStatus === 403) {
              finish(() => reject(new Error('인증 세션이 만료되었습니다. 앱을 새로고침하고 다시 시도해주세요.')));
              return;
            }
            scheduleNext(); return;
          }
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
        } catch (err) {
          consecutivePollFailures++;
          addBreadcrumb('video', 'Runway poll fallback failed', 'warning', { taskId: submitData.taskId, consecutivePollFailures });
          logError(err, { component: 'aiVideoPipeline', action: 'runwayPollFallback' });
          if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            const msg = POLL_FAIL_MESSAGE;
            report('error', 0, msg);
            finish(() => reject(new Error(msg)));
            return;
          }
        }
        scheduleNext();
      };
      const scheduleNext = () => {
        if (settled) return;
        runwayPollTimer = setTimeout(runwayPoll, RUNWAY_POLL_FALLBACK_INTERVAL_MS);
      };
      runwayPoll();
    };
    runwayFallbackStartTimer = setTimeout(startRunwayPollFallback, RUNWAY_POLL_FALLBACK_START_MS);

    // Soft warning at 120s — don't reject, just inform the user
    // (softWarnTimer declared early above for TDZ safety)
    softWarnTimer = setTimeout(() => {
      if (settled) return;
      const elapsedSec = monotonicElapsedSec(startTime);
      report('generating', 0.85, `렌더링이 조금 오래 걸리고 있어요 (${elapsedSec}초). 백그라운드에서 계속 진행 중입니다...`);
    }, REALTIME_SOFT_WARN_MS);

    // Overall timeout — 5 minutes. Don't orphan the job; inform the user.
    timeoutTimer = setTimeout(() => {
      const msg = `비디오 생성이 5분을 초과했습니다. 서버에서는 계속 렌더링 중일 수 있어요. 잠시 후 이 페이지를 다시 방문하면 완성된 영상을 확인할 수 있습니다.`;
      report('error', 0, msg);
      finish(() => reject(new Error(msg)));
    }, REALTIME_TIMEOUT_MS);

    // Background pause: stop all timers/channels when backgrounded to avoid
    // CPU drain and battery consumption. After BG_MAX_WAIT_MS in background,
    // fully stop polling — the job continues server-side and the user can
    // check the result page when they return.
    const pauseBackground = () => {
      if (isBackgrounded || settled) return;
      isBackgrounded = true;
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (runwayPollTimer) { clearTimeout(runwayPollTimer); runwayPollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (runwayFallbackStartTimer) { clearTimeout(runwayFallbackStartTimer); runwayFallbackStartTimer = null; }
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      bgTimer = setTimeout(() => {
        if (settled) return;
        const msg = '백그라운드 대기 시간이 초과되었습니다. 앱으로 돌아오면 완성된 영상을 확인할 수 있습니다.';
        report('error', 0, msg);
        finish(() => reject(new Error(msg)));
      }, BG_MAX_WAIT_MS);
    };

    // Resume burst: run a short sequence of fast polls immediately after
    // resume so the UI catches up on missed server state without waiting
    // for the realtime socket to reconnect (which can take several seconds).
    const RESUME_BURST_INTERVAL_MS = 1500;
    const RESUME_BURST_COUNT = 3;
    let resumeBurstCount = 0;
    // (resumeBurstTimer declared early above for TDZ safety)
    const runResumeBurst = async () => {
      if (settled || resumeBurstCount >= RESUME_BURST_COUNT) {
        resumeBurstTimer = null;
        return;
      }
      resumeBurstCount++;
      if (resumeBurstCount === 1) {
        try { await ensureFreshSession(); } catch { /* non-fatal */ }
      }
      checkDb();
      checkScanVideoUrl();
      resumeBurstTimer = setTimeout(runResumeBurst, RESUME_BURST_INTERVAL_MS);
    };

    const resumeBackground = () => {
      if (!isBackgrounded || settled) return;
      isBackgrounded = false;
      if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
      pollBackoffAttempt = 0;
      reconnectAttempts = 0;
      setupChannel();
      scheduleNextPoll();
      checkDb();
      checkScanVideoUrl();
      runwayFallbackStartTimer = setTimeout(startRunwayPollFallback, RUNWAY_POLL_FALLBACK_START_MS);
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      resumeBurstCount = 0;
      runResumeBurst();
    };

    const handleAppState = (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        pauseBackground();
      } else if (nextState === 'active') {
        resumeBackground();
      }
    };
    appSub = registerAppStateHandler('deferred', handleAppState);

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
  onProgress?: (progress: VideoGenProgress) => void,
): Promise<SubmitOnlyResult> {
  const SUBMIT_TIMEOUT_MS = 90_000;
  const SUBMIT_SOFT_TIMEOUT_MS = 7_000;

  const report = (phase: VideoGenPhase, progress: number, message: string, serverStep?: string | null) => {
    onProgress?.({ phase, progress, message, elapsedSec: 0, serverStep: serverStep ?? undefined });
  };

  const submitBody = compactBody({
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
    memeFormat: options.memeFormat,
    memeText: options.memeText,
    cutCount: options.cutCount,
    productVision: options.productVision,
    draft: options.draft,
    isCleanVideoMode: options.isCleanVideoMode,
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
    mainImageUrl: options.mainImageUrl,
  });

  await ensureFreshSession();

  report('submitting', 0.08, 'AI 렌더링 요청 전송 중...');

  const submitController = new AbortController();
  const submitTimeoutId = setTimeout(() => submitController.abort(), SUBMIT_TIMEOUT_MS);

  // Link external abort signal (e.g. component unmount) to the submit
  // controller so the fetch is cancelled and no orphaned callbacks fire.
  if (options.signal) {
    if (options.signal.aborted) {
      submitController.abort();
    } else {
      options.signal.addEventListener('abort', () => submitController.abort(), { once: true });
    }
  }

  const invokePromise = (supabase.functions.invoke('generate-video', {
    body: submitBody,
    signal: submitController.signal,
  }) as Promise<{ data: { taskId: string; motionPrompt: string; durationSec: number; aspectRatio: string; variationSeed: number } | null; error: unknown }>)
    .catch((err: unknown) => {
      if (err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))) {
        return { data: null, error: null };
      }
      return { data: null, error: err };
    });

  // 10-second soft timeout: if the server hasn't responded yet, proceed to
  // polling using the scanId to find the real job row. The server's submit
  // call may still complete in the background — the job row will be found by
  // scanId during polling. This prevents the UI from blocking at 8% when the
  // edge function is slow to return its 202 response.
  const softTimeoutPromise = new Promise<{ data: { taskId: string; motionPrompt: string; durationSec: number; aspectRatio: string; variationSeed: number } | null; error: null }>((resolve) =>
    setTimeout(
      () => {
        submitController.abort();
        const fallbackId = `soft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const fallbackHook = autoSelectHook({
          productName: options.productName,
          productCategory: options.productVision?.productCategory,
          customPrompt: prompt,
        });
        const fallbackMotionPrompt = fallbackHook.selected.text;
        report('generating', 0.12, 'AI가 훅 문구를 분석하고 렌더링을 준비하는 중...');
        resolve({
          data: {
            taskId: fallbackId,
            motionPrompt: fallbackMotionPrompt,
            durationSec: options.durationSec ?? 5,
            aspectRatio: options.aspectRatio ?? '9:16',
            variationSeed: options.variationSeed ?? 0,
          },
          error: null,
        });
      },
      SUBMIT_SOFT_TIMEOUT_MS,
    ),
  );

  const hardTimeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
    setTimeout(
      () => { submitController.abort(); resolve({ data: null, error: new Error('영상 생성 요청 시간이 초과되었습니다. 다시 시도해주세요.') }); },
      SUBMIT_TIMEOUT_MS,
    ),
  );

  const { data, error } = await Promise.race([
    invokePromise,
    softTimeoutPromise,
    hardTimeoutPromise,
  ]).finally(() => clearTimeout(submitTimeoutId));

  if (error) throw await buildVideoFunctionError(error);
  // If the soft timeout won the race, use the fallback task ID. Polling will
  // find the real job row by scanId — the task ID is only a placeholder.
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

export type VideoJobCallback = (result: {
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  step?: string | null;
  progress?: number | null;
  videoUrl?: string;
  error?: string;
}) => void;

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
  let consecutivePollFailures = 0;

  const isSoftTaskId = taskId.startsWith('soft-') || taskId.startsWith('hd-soft-');
  const pollStartTime = Date.now();

  const checkAndNotify = async () => {
    if (settled) return;
    try {
      let query = supabase
        .from('video_jobs')
        .select('status, step, video_url, error_message')
        .eq('scan_id', scanId);
      // For soft-fallback task IDs, no real DB row has that ID — look up
      // by scan_id only and take the most recent row.
      if (isSoftTaskId) {
        query = query.order('created_at', { ascending: false }).limit(1);
      } else {
        query = query.eq('task_id', taskId);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        // No job row found — try scans.video_url as a fallback (webhook may
        // have completed without the video_jobs row being visible yet).
        try {
          const { data: scanData } = await supabase
            .from('scans')
            .select('video_url, muxed_video_url')
            .eq('id', scanId)
            .maybeSingle();
          const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
          if (scanFinalUrl) {
            settled = true;
            cleanup();
            callback({ status: 'SUCCESS', step: 'completed', progress: 1, videoUrl: scanFinalUrl });
            return;
          }
        } catch { /* ignore — no fallback URL */ }
        return;
      }
      consecutivePollFailures = 0;
      const row = data as VideoJobRow;
      if (row.status === 'SUCCESS' && row.video_url) {
        settled = true;
        cleanup();
        callback({ status: 'SUCCESS', step: row.step, progress: 1, videoUrl: row.video_url });
        return;
      }
      if (row.status === 'FAILED') {
        settled = true;
        cleanup();
        callback({ status: 'FAILED', step: row.step, progress: 0, error: row.error_message ?? '비디오 생성에 실패했습니다.' });
        return;
      }
      // Non-terminal: also check scans.video_url — the webhook may have
      // written the result to scans but the video_jobs PATCH hasn't
      // landed yet (race between webhook and server-poll).
      try {
        const { data: scanData } = await supabase
          .from('scans')
          .select('video_url, muxed_video_url')
          .eq('id', scanId)
          .maybeSingle();
        const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
        if (scanFinalUrl) {
          settled = true;
          cleanup();
          callback({ status: 'SUCCESS', step: 'completed', progress: 1, videoUrl: scanFinalUrl });
          return;
        }
      } catch { /* ignore */ }

      // Report progress using the higher of server-step mapping and
      // time-based creep, so the UI never freezes at a stale percentage.
      const stepProgress = stepToProgress(row.step);
      const elapsedSec = Math.round((Date.now() - pollStartTime) / 1000);
      const timeProgress = Math.min(0.15 + (elapsedSec / 120) * 0.82, 0.97);
      const effectiveProgress = stepProgress != null
        ? Math.max(stepProgress, timeProgress)
        : timeProgress;
      callback({
        status: row.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING',
        step: row.step,
        progress: effectiveProgress,
      });
    } catch (err) {
      consecutivePollFailures++;
      logError(err, { component: 'aiVideoPipeline', action: 'subscribeVideoJob.checkAndNotify', extra: { consecutivePollFailures } });
      if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        settled = true;
        cleanup();
        callback({ status: 'FAILED', error: POLL_FAIL_MESSAGE });
      }
    }
  };

  let resumeBurstTimer: ReturnType<typeof setTimeout> | null = null;
  let resumeBurstCount = 0;
  const RESUME_BURST_INTERVAL_MS = 1500;
  const RESUME_BURST_COUNT = 3;
  const runResumeBurst = async () => {
    if (settled || resumeBurstCount >= RESUME_BURST_COUNT) {
      resumeBurstTimer = null;
      return;
    }
    resumeBurstCount++;
    if (resumeBurstCount === 1) {
      try { await ensureFreshSession(); } catch { /* non-fatal */ }
    }
    checkAndNotify();
    resumeBurstTimer = setTimeout(runResumeBurst, RESUME_BURST_INTERVAL_MS);
  };

  const cleanup = () => {
    if (channel) supabase.removeChannel(channel);
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (runwayPollTimer) clearTimeout(runwayPollTimer);
    if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
    if (overallTimeoutTimer) clearTimeout(overallTimeoutTimer);
  };

  const scheduleReconnect = () => {
    if (settled || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts) * JITTER();
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
    if (channel) {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      channel = null;
    }
    channel = supabase
      .channel(`video-job:${scanId}:${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
        (payload) => {
          if (!payload.new) return;
          try {
            channelHealth = ChannelHealth.HEALTHY;
            pollBackoffAttempt = 0;
            reconnectAttempts = 0;
            const row = payload.new as VideoJobRow;
            if (row.status === 'SUCCESS' && row.video_url) {
              if (settled) return;
              settled = true;
              cleanup();
              callback({ status: 'SUCCESS', step: row.step, progress: 1, videoUrl: row.video_url });
            } else if (row.status === 'FAILED') {
              if (settled) return;
              settled = true;
              cleanup();
              callback({ status: 'FAILED', step: row.step, progress: 0, error: row.error_message ?? '비디오 생성에 실패했습니다.' });
            } else {
              const stepProgress = stepToProgress(row.step);
              const elapsedSec = Math.round((Date.now() - pollStartTime) / 1000);
              const timeProgress = Math.min(0.15 + (elapsedSec / 120) * 0.82, 0.97);
              const effectiveProgress = stepProgress != null
                ? Math.max(stepProgress, timeProgress)
                : timeProgress;
              callback({
                status: row.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING',
                step: row.step,
                progress: effectiveProgress,
              });
            }
          } catch (err) {
            addBreadcrumb('realtime', 'Realtime callback error', 'warning');
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scans', filter: `id=eq.${scanId}` },
        (payload) => {
          if (!payload.new) return;
          try {
            const row = payload.new as { video_url?: string | null; muxed_video_url?: string | null };
            const finalUrl = row.muxed_video_url ?? row.video_url;
            if (finalUrl) {
              if (settled) return;
              settled = true;
              cleanup();
              callback({ status: 'SUCCESS', step: 'completed', progress: 1, videoUrl: finalUrl });
            }
          } catch {
            addBreadcrumb('realtime', 'scans Realtime callback error', 'warning');
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

  let runwayPollTimer: ReturnType<typeof setTimeout> | null = null;
  let runwayFallbackStarted = false;

  const startRunwayPollFallback = () => {
    if (settled || runwayFallbackStarted || isSoftTaskId) return;
    runwayFallbackStarted = true;
    const runwayPoll = async () => {
      if (settled) return;
      try {
        const pollController = new AbortController();
        const pollTimeoutId = setTimeout(() => pollController.abort(), INVOKE_TIMEOUT_MS);
        const { data, error } = await supabase.functions.invoke('generate-video', {
          body: { mode: 'poll', taskId, scanId },
          signal: pollController.signal,
        }).finally(() => clearTimeout(pollTimeoutId));
        if (error) {
          const errStatus = (error as { status?: number }).status;
          if (errStatus === 401 || errStatus === 403) {
            settled = true;
            cleanup();
            callback({ status: 'FAILED', error: '인증 세션이 만료되었습니다. 앱을 새로고침하고 다시 시도해주세요.' });
            return;
          }
        } else {
          const resp = data as { status?: string; videoUrl?: string; error?: string };
          if (resp.status === 'SUCCESS' && resp.videoUrl) {
            settled = true;
            cleanup();
            callback({ status: 'SUCCESS', step: 'completed', progress: 1, videoUrl: resp.videoUrl });
            return;
          }
          if (resp.status === 'FAILED') {
            settled = true;
            cleanup();
            callback({ status: 'FAILED', error: resp.error ?? '비디오 생성에 실패했습니다.' });
            return;
          }
        }
      } catch {
        // non-fatal — DB poll will catch the result
      }
      if (!settled) {
        runwayPollTimer = setTimeout(runwayPoll, RUNWAY_POLL_FALLBACK_INTERVAL_MS);
      }
    };
    runwayPollTimer = setTimeout(runwayPoll, RUNWAY_POLL_FALLBACK_START_MS);
  };

  const scheduleNextPoll = () => {
    if (settled) return;
    const elapsed = Date.now() - pollStartTime;
    const interval = channelHealth === ChannelHealth.HEALTHY
      ? computeBackoffDelay(pollBackoffAttempt, elapsed)
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

  // Overall timeout — 5 minutes. After this, do one final check and if
  // still not complete, force a FAILED with a retry message instead of
  // leaving the user stuck at a frozen progress percentage forever.
  const overallTimeoutTimer = setTimeout(() => {
    if (settled) return;
    checkAndNotify().then(() => {
      if (settled) return;
      settled = true;
      cleanup();
      removeBgPause();
      callback({ status: 'FAILED', error: '비디오 생성이 5분을 초과했습니다. 서버에서는 완료되었을 수 있어요. 잠시 후 결과 페이지를 다시 방문하면 완성된 영상을 확인할 수 있습니다.' });
    });
  }, 300_000);

  setupChannel();
  scheduleNextPoll();
  checkAndNotify();
  startRunwayPollFallback();

  const removeBgPause = installBackgroundPause({
    isSettled: () => settled,
    pause: () => {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (runwayPollTimer) { clearTimeout(runwayPollTimer); runwayPollTimer = null; }
      if (overallTimeoutTimer) clearTimeout(overallTimeoutTimer);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
    },
    resume: () => {
      pollBackoffAttempt = 0;
      reconnectAttempts = 0;
      setupChannel();
      scheduleNextPoll();
      checkAndNotify();
      startRunwayPollFallback();
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      resumeBurstCount = 0;
      runResumeBurst();
    },
    onBackgroundTimeout: () => {
      settled = true;
      cleanup();
      removeBgPause();
      callback({ status: 'FAILED', error: '백그라운드 대기 시간이 초과되었습니다. 앱으로 돌아오면 완성된 영상을 확인할 수 있습니다.' });
    },
  });

  return () => {
    settled = true;
    cleanup();
    removeBgPause();
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
  const HD_SUBMIT_TIMEOUT_MS = 90_000;
  const HD_SUBMIT_SOFT_TIMEOUT_MS = 6_000;

  const hdSubmitBody = compactBody({
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
    memeFormat: options.memeFormat,
    memeText: options.memeText,
    cutCount: options.cutCount,
    productVision: options.productVision,
    draft: false,
    isCleanVideoMode: options.isCleanVideoMode,
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
    mainImageUrl: options.mainImageUrl,
  });

  await ensureFreshSession();

  const hdController = new AbortController();
  const hdTimeoutId = setTimeout(() => hdController.abort(), HD_SUBMIT_TIMEOUT_MS);
  const invokePromise = (supabase.functions.invoke('generate-video', {
    body: hdSubmitBody,
    signal: hdController.signal,
  }) as Promise<{ data: { taskId: string } | null; error: unknown }>)
    .catch((err: unknown) => {
      if (err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))) {
        return { data: null, error: null };
      }
      return { data: null, error: err };
    });

  // 8-second soft timeout: abort the fetch and proceed with a fallback HD
  // task ID so the HD polling can start even if the edge function is slow.
  const hdSoftTimeoutPromise = new Promise<{ data: { taskId: string }; error: null }>((resolve) =>
    setTimeout(
      () => {
        hdController.abort();
        const fallbackId = `hd-soft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        resolve({ data: { taskId: fallbackId }, error: null });
      },
      HD_SUBMIT_SOFT_TIMEOUT_MS,
    ),
  );

  const hdHardTimeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
    setTimeout(
      () => { hdController.abort(); resolve({ data: null, error: new Error('고화질 업그레이드 요청 시간이 초과되었습니다. 다시 시도해주세요.') }); },
      HD_SUBMIT_TIMEOUT_MS,
    ),
  );

  const { data, error } = await Promise.race([
    invokePromise,
    hdSoftTimeoutPromise,
    hdHardTimeoutPromise,
  ]).finally(() => clearTimeout(hdTimeoutId));

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
  let consecutivePollFailures = 0;

  const checkAndNotify = async () => {
    if (settled) return;
    try {
      const { data, error } = await supabase
        .from('video_jobs')
        .select('hd_status, hd_video_url, error_message')
        .eq('scan_id', scanId)
        .eq('task_id', draftJobId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return;
      consecutivePollFailures = 0;
      const row = data as VideoJobRow;
      if (row.hd_status === 'SUCCESS' && row.hd_video_url) {
        settled = true;
        cleanup();
        callback({ status: 'SUCCESS', videoUrl: row.hd_video_url });
        return;
      }
      if (row.hd_status === 'FAILED') {
        settled = true;
        cleanup();
        callback({ status: 'FAILED', error: row.error_message ?? 'HD 업그레이드에 실패했습니다.' });
        return;
      }
      // Fallback: check scans.video_url / muxed_video_url — if the draft
      // or HD result was written to scans but the video_jobs row hasn't
      // updated yet.
      try {
        const { data: scanData } = await supabase
          .from('scans')
          .select('video_url, muxed_video_url')
          .eq('id', scanId)
          .maybeSingle();
        const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
        if (scanFinalUrl) {
          settled = true;
          cleanup();
          callback({ status: 'SUCCESS', videoUrl: scanFinalUrl });
        }
      } catch { /* ignore */ }
    } catch (err) {
      consecutivePollFailures++;
      logError(err, { component: 'aiVideoPipeline', action: 'subscribeHdUpgrade.checkAndNotify', extra: { consecutivePollFailures } });
      if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        settled = true;
        cleanup();
        callback({ status: 'FAILED', error: POLL_FAIL_MESSAGE });
      }
    }
  };

  let resumeBurstTimer: ReturnType<typeof setTimeout> | null = null;
  let resumeBurstCount = 0;
  const runResumeBurst = async () => {
    if (settled || resumeBurstCount >= 3) {
      resumeBurstTimer = null;
      return;
    }
    resumeBurstCount++;
    if (resumeBurstCount === 1) {
      try { await ensureFreshSession(); } catch { /* non-fatal */ }
    }
    checkAndNotify();
    resumeBurstTimer = setTimeout(runResumeBurst, 1500);
  };

  const cleanup = () => {
    if (channel) supabase.removeChannel(channel);
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
    if (hdOverallTimeoutTimer) clearTimeout(hdOverallTimeoutTimer);
  };

  const scheduleReconnect = () => {
    if (settled || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts) * JITTER();
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
    if (channel) {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      channel = null;
    }
    channel = supabase
      .channel(`hd-upgrade:${scanId}:${draftJobId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
        (payload) => {
          if (!payload.new) return;
          try {
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
          } catch (err) {
            addBreadcrumb('realtime', 'Realtime callback error', 'warning');
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
  const hdPollStartTime = Date.now();
  const scheduleNextPoll = () => {
    if (settled) return;
    const elapsed = Date.now() - hdPollStartTime;
    const interval = channelHealth === ChannelHealth.HEALTHY
      ? computeBackoffDelay(pollBackoffAttempt, elapsed)
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

  // Overall timeout — 5 minutes. Force a final check, then FAILED if still
  // not complete, instead of polling forever.
  const hdOverallTimeoutTimer = setTimeout(() => {
    if (settled) return;
    checkAndNotify().then(() => {
      if (settled) return;
      settled = true;
      cleanup();
      removeBgPause();
      callback({ status: 'FAILED', error: '고화질 업그레이드가 5분을 초과했습니다. 초안 영상은 그대로 이용할 수 있습니다.' });
    });
  }, 300_000);

  setupChannel();
  scheduleNextPoll();
  checkAndNotify();

  const removeBgPause = installBackgroundPause({
    isSettled: () => settled,
    pause: () => {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (hdOverallTimeoutTimer) clearTimeout(hdOverallTimeoutTimer);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
    },
    resume: () => {
      pollBackoffAttempt = 0;
      reconnectAttempts = 0;
      setupChannel();
      scheduleNextPoll();
      checkAndNotify();
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      resumeBurstCount = 0;
      runResumeBurst();
    },
    onBackgroundTimeout: () => {
      settled = true;
      cleanup();
      removeBgPause();
      callback({ status: 'FAILED', error: '백그라운드 대기 시간이 초과되었습니다. 앱으로 돌아오면 완성된 영상을 확인할 수 있습니다.' });
    },
  });

  return () => {
    settled = true;
    cleanup();
    removeBgPause();
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
      // Fallback: check scans.video_url / muxed_video_url directly
      const { data: scanData } = await supabase
        .from('scans')
        .select('video_url, muxed_video_url')
        .eq('id', scanId)
        .maybeSingle();
      const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
      if (scanFinalUrl) {
        return { videoUrl: scanFinalUrl, isHd: false, status: 'SUCCESS' };
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

    return { videoUrl: '', isHd: row.is_hd ?? false, status: 'PENDING' };
  } catch (err) {
    logError(err, { component: 'aiVideoPipeline', action: 'recoverVideoJob' });
    return null;
  }
}

