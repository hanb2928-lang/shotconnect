import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { isInFlushWindow, onFlushComplete } from '@/lib/foregroundFlushGuard';
import { supabase, ensureFreshSession, withQueryTimeout } from './supabase';
import { createChannel, safeRemoveChannel } from './channelManager';
import { safeSetTimeout, type SafeTimerSet, createSafeTimerSet, clearAllSafeTimers } from './safeTimer';
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
  isDraft?: boolean;
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
  modelImageUrl?: string;
  signal?: AbortSignal;
}


const SUBMIT_MAX_RETRIES = 2;
const SUBMIT_RETRY_DELAY_MS = 500;
const HARD_CIRCUIT_BREAKER_MS = 360_000; // 6 min — aligned with server ZOMBIE_JOB_TIMEOUT_MS
const REALTIME_TIMEOUT_MS = HARD_CIRCUIT_BREAKER_MS;
const REALTIME_SOFT_WARN_MS = 120_000;
const RUNWAY_POLL_FALLBACK_INTERVAL_MS = 6000;
const RUNWAY_POLL_FALLBACK_START_MS = 12_000;
const FIRST_POLL_DELAY_MS = 3000;
const POLL_MIN_INTERVAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 8000;
const POLL_BACKOFF_FACTOR = 1.3;
const POLL_FAST_PHASE_MS = 15_000;
const POLL_NORMAL_PHASE_MS = 30_000;
const CHANNEL_RECONNECT_DELAY_MS = 3000;
const JITTER = () => 0.8 + Math.random() * 0.4;
const CHANNEL_MAX_RECONNECT_ATTEMPTS = 5;

const BG_MAX_WAIT_MS = 360_000; // aligned with circuit breaker
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
  let bgEnterTime: number | null = null;

  // Pause MUST run in the 'immediate' phase (synchronous, before the OS
  // locks the native bridge). If registered as 'deferred', the coordinator
  // schedules it via setTimeout(0) — but on iOS the JS thread suspends
  // before that macrotask fires, so pause() NEVER runs. Timers and Realtime
  // channels stay alive in the background. On foreground return, the
  // coordinator's deferredQueue = [] wipes the stale pause queue, then
  // resume() stacks NEW timers/channels on top of the still-alive old ones
  // → bridge flood → watchdog kill.
  //
  // Resume stays 'deferred' because it touches the bridge (setupChannel,
  // DB queries) and must wait for the flush window.
  const handlePauseImmediate = (nextState: string) => {
    if (nextState !== 'background') return;
    if (isBackgrounded || opts.isSettled()) return;
    isBackgrounded = true;
    bgEnterTime = Date.now();
    opts.pause();
    bgTimer = setTimeout(() => {
      if (opts.isSettled()) return;
      opts.onBackgroundTimeout();
    }, BG_MAX_WAIT_MS);
  };

  const handleResumeDeferred = (nextState: string) => {
    if (nextState !== 'active') return;
    if (!isBackgrounded || opts.isSettled()) return;
    isBackgrounded = false;
    if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
    // On iOS, setTimeout is paused while backgrounded, so bgTimer may
    // never have fired even if BG_MAX_WAIT_MS has elapsed. Check the
    // actual elapsed time and fire the timeout if exceeded.
    if (bgEnterTime !== null) {
      const bgDuration = Date.now() - bgEnterTime;
      bgEnterTime = null;
      if (bgDuration >= BG_MAX_WAIT_MS) {
        if (!opts.isSettled()) {
          opts.onBackgroundTimeout();
          return;
        }
      }
    }
    try {
      opts.resume();
    } catch {
      // resume() can throw if channel setup fails on foreground return.
    }
  };

  const unsubImmediate = registerAppStateHandler('immediate', handlePauseImmediate);
  const unsubDeferred = registerAppStateHandler('deferred', handleResumeDeferred);
  return () => {
    if (bgTimer) clearTimeout(bgTimer);
    unsubImmediate();
    unsubDeferred();
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
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (isOnline() || Date.now() >= deadline) {
        resolve(isOnline());
        return;
      }
      timerId = setTimeout(check, OFFLINE_POLL_MS);
    };
    check();
    // Safety: if the promise is not resolved within the deadline,
    // clear the timer to prevent orphaned recursive setTimeout chains.
    const safetyTimer = setTimeout(() => {
      if (timerId) clearTimeout(timerId);
      resolve(false);
    }, OFFLINE_WAIT_MAX_MS + 1000);
    // Allow callers to cancel via the returned promise's resolution
    const originalResolve = resolve;
    resolve = ((val: boolean) => {
      clearTimeout(safetyTimer);
      if (timerId) clearTimeout(timerId);
      originalResolve(val);
    }) as typeof resolve;
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

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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


const DRAFT_PROGRESS_K = 25;
const FULL_PROGRESS_K = 120;

function computeTimeProgress(elapsedSec: number, isDraft: boolean): number {
  const k = isDraft ? DRAFT_PROGRESS_K : FULL_PROGRESS_K;
  const eased = 1 - Math.exp(-elapsedSec / k);
  return Math.min(0.15 + eased * 0.84, 0.99);
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
        ? findSimilarMultiAngleCache(motionTemplateHash, options.contentTone, options.productVision?.productCategory, options.imageHash)
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
        ).catch(() => {}).finally(() => { /* release ref */ });
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
  const idempotencyKey = generateIdempotencyKey();
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
          idempotencyKey,
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
          isDraft,
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
          modelImageUrl: options.modelImageUrl,
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
  const result = await waitForVideoCompletion(submitData, options.scanId, startTime, report, options.signal, isDraft);

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
    ).catch(() => {}).finally(() => { /* release ref */ });
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
    } catch (parseErr) {
      console.error('[aiVideoPipeline] buildVideoFunctionError: failed to parse error response:', parseErr);
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
  isDraft: boolean = false,
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
    const _dbg = (stage: string, extra?: unknown) => {
      if (!__DEV__) return;
      const elapsed = monotonicElapsedSec(startTime);
      console.log(`[aiVideoPipeline:waitForVideoCompletion] t=${elapsed}s stage=${stage}`, extra ?? '');
      addBreadcrumb('video', `waitForVideoCompletion: ${stage}`, 'warning', { elapsedSec: elapsed, ...(extra && typeof extra === 'object' ? extra as Record<string, unknown> : {}) });
    };
    _dbg('init', { taskId: submitData.taskId, scanId });

    // All timers declared early so cleanup/fullCleanup/finish can reference them
    // without hitting a temporal dead zone (TDZ).
    let softWarnTimer: ReturnType<typeof setTimeout> | null = null;
    let runwayPollTimer: ReturnType<typeof setTimeout> | null = null;
    let resumeBurstTimer: ReturnType<typeof setTimeout> | null = null;
    let bgTimer: ReturnType<typeof setTimeout> | null = null;
    let runwayFallbackStartTimer: ReturnType<typeof setTimeout> | null = null;
    let isBackgrounded = false;
    let appSub: (() => void) | null = null;
    let appSubImmediate: (() => void) | null = null;
    const pendingRemovals: SafeTimerSet = createSafeTimerSet();

    // TDZ-safe: declare all timers/flags referenced by cleanup/fullCleanup
    // BEFORE those functions. If an early abort fires finish() before these
    // would have been declared, accessing them in the TDZ throws.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let dbCheckInFlight = false;
    let dbCheckWatchdog: ReturnType<typeof setTimeout> | null = null;
    let scanCheckInFlight = false;
    let scanCheckWatchdog: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (channel) {
        const ch = channel;
        channel = null;
        try { safeRemoveChannel(ch); } catch { /* non-fatal */ }
      }
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
      if (dbCheckWatchdog) { clearTimeout(dbCheckWatchdog); dbCheckWatchdog = null; }
      if (scanCheckWatchdog) { clearTimeout(scanCheckWatchdog); scanCheckWatchdog = null; }
      dbCheckInFlight = false;
      scanCheckInFlight = false;
      clearAllSafeTimers(pendingRemovals);
      appSub?.();
      appSubImmediate?.();
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
      _dbg('handleRow', { status: row.status, step: row.step, hasVideoUrl: !!row.video_url });
      if (row.status === 'SUCCESS' && row.video_url) {
        const videoUrl = row.video_url;
        // Resolve immediately — muxing is a separate post-generation step
        // handled by the result page, not this pipeline.
        report('completed', 1.0, 'AI 비디오 생성 완료');
        finish(() => resolve({
          videoUrl,
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
        _dbg('FAILED — rejecting', { msg });
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
    const LOCK_TIMEOUT_MS = 5000;
    const checkDb = async () => {
      if (settled || !scanId || dbCheckInFlight) return;
      dbCheckInFlight = true;
      if (dbCheckWatchdog) clearTimeout(dbCheckWatchdog);
      dbCheckWatchdog = setTimeout(() => { dbCheckInFlight = false; }, LOCK_TIMEOUT_MS);
      try {
        _dbg('checkDb:start');
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
        const { data, error } = await withQueryTimeout(
          query.order('created_at', { ascending: false }).limit(1).maybeSingle(),
          5000,
          'checkDb',
        );
        if (error) throw new Error(error.message);
        if (!data) { _dbg('checkDb:no-data'); return; }
        consecutivePollFailures = 0;
        handleRow(data as VideoJobRow);
      } catch (err) {
        consecutivePollFailures++;
        _dbg('checkDb:error', { consecutivePollFailures, err: err instanceof Error ? err.message : String(err) });
        logError(err, { component: 'aiVideoPipeline', action: 'checkDb', extra: { consecutivePollFailures } });
        if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          const msg = POLL_FAIL_MESSAGE;
          report('error', 0, msg);
          finish(() => reject(new Error(msg)));
        }
      } finally {
        if (dbCheckWatchdog) { clearTimeout(dbCheckWatchdog); dbCheckWatchdog = null; }
        dbCheckInFlight = false;
      }
    };

    // Check scans for the persisted URL (webhook writes here too).
    // Prefers video_url (server writes this on generation completion) and
    // falls back to muxed_video_url (post-processing audio mux). Checking
    // video_url first prevents the 97% stall — muxed_video_url is a separate
    // post-generation step that may never arrive during generation.
    const checkScanVideoUrl = async () => {
      if (settled || !scanId || scanCheckInFlight) return;
      scanCheckInFlight = true;
      if (scanCheckWatchdog) clearTimeout(scanCheckWatchdog);
      scanCheckWatchdog = setTimeout(() => { scanCheckInFlight = false; }, LOCK_TIMEOUT_MS);
      try {
        _dbg('checkScanVideoUrl:start');
        const { data, error } = await withQueryTimeout(
          supabase
            .from('scans')
            .select('video_url, muxed_video_url')
            .eq('id', scanId)
            .maybeSingle(),
          5000,
          'checkScanVideoUrl',
        );
        if (error || !data) { _dbg('checkScanVideoUrl:no-data'); return; }
        const finalUrl = data.video_url ?? data.muxed_video_url;
        if (finalUrl) {
          _dbg('checkScanVideoUrl:FOUND', { url: finalUrl.slice(0, 80) });
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
        }
      } catch (err) {
        _dbg('checkScanVideoUrl:error', { err: err instanceof Error ? err.message : String(err) });
        logError(err, { component: 'aiVideoPipeline', action: 'checkScanVideoUrl' });
      } finally {
        if (scanCheckWatchdog) { clearTimeout(scanCheckWatchdog); scanCheckWatchdog = null; }
        scanCheckInFlight = false;
      }
    };

    // Primary path: Realtime subscription on video_jobs with health monitoring

    const setupChannel = async () => {
      if (settled || !scanId) return;
      _dbg('setupChannel');
      if (channel) {
        const ch = channel;
        channel = null;
        safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
      }
      channel = await createChannel(`video-job:${scanId}:${submitData.taskId}`);
      if (settled) { safeRemoveChannel(channel); channel = null; return; }
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
          (payload) => {
            if (!payload.new) return;
            const isTerminal = (payload.new as { status?: string }).status === 'SUCCESS'
              || (payload.new as { status?: string }).status === 'FAILED';
            if (isInFlushWindow() && !isTerminal) return;
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
          _dbg('channel:subscribe', { status });
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
      if (settled || isBackgrounded || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) {
        _dbg('scheduleReconnect:exhausted', { reconnectAttempts });
        return;
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts) * JITTER();
      reconnectAttempts++;
      _dbg('scheduleReconnect', { attempt: reconnectAttempts, delayMs: Math.round(delayMs) });
      report('generating', 0.12, `실시간 연결이 불안정합니다. 재연결 시도 중 (${reconnectAttempts}/${CHANNEL_MAX_RECONNECT_ATTEMPTS})...`);
      reconnectTimer = setTimeout(() => {
        if (settled) return;
        if (channel) {
          const ch = channel;
          channel = null;
          safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
        }
        setupChannel().catch(() => { /* non-fatal */ });
      }, delayMs);
    };

    _dbg('setupChannel:initial');
    setupChannel().catch(() => { /* non-fatal */ });

    // Safety-net: adaptive DB poll with exponential backoff.
    // When the realtime channel is healthy, back off to reduce unnecessary
    // DB queries. When the channel degrades, reset to fast polling.
    const scheduleNextPoll = () => {
      if (settled || isBackgrounded) return;
      const elapsed = monotonicElapsedMs(startTime);
      const interval = channelHealth === ChannelHealth.HEALTHY
        ? computeBackoffDelay(pollBackoffAttempt, elapsed)
        : POLL_MIN_INTERVAL_MS;
      pollTimer = setTimeout(async () => {
        if (settled || isBackgrounded) return;
        elapsedTick++;
        await Promise.all([checkDb(), checkScanVideoUrl()]);
        if (!settled) {
          const elapsedSec = monotonicElapsedSec(startTime);
          const timeProgress = computeTimeProgress(elapsedSec, isDraft);
          const healthHint = channelHealth === ChannelHealth.HEALTHY
            ? ''
            : ' (실시간 연결 불안정 — 폴링으로 대체 중)';
          report('generating', timeProgress, `AI가 영상을 렌더링하고 있어요 (${elapsedSec}초)${healthHint}...`);
          if (channelHealth === ChannelHealth.HEALTHY) {
            pollBackoffAttempt++;
          }
          if (!isBackgrounded) scheduleNextPoll();
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
      if (settled || isBackgrounded || runwayPollTimer) return;
      _dbg('startRunwayPollFallback');
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
          const resp = (data ?? {}) as { status?: string; videoUrl?: string; error?: string };
          _dbg('runwayPoll:resp', { status: resp.status, hasVideoUrl: !!resp.videoUrl });
          if (resp.status === 'SUCCESS') {
            if (resp.videoUrl) {
              _dbg('runwayPoll:SUCCESS');
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
            // SUCCESS without URL — immediately DB force-sync to grab it
            // instead of polling again and risking a 240s timeout.
            _dbg('runwayPoll:SUCCESS-no-url, forcing DB sync');
            await Promise.all([checkDb(), checkScanVideoUrl()]);
            if (settled) return;
            scheduleNext();
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
          _dbg('runwayPoll:error', { consecutivePollFailures, err: err instanceof Error ? err.message : String(err) });
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
        if (settled || isBackgrounded) return;
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
      _dbg('softWarn', { elapsedSec });
      report('generating', 0.85, `렌더링이 조금 오래 걸리고 있어요 (${elapsedSec}초). 백그라운드에서 계속 진행 중입니다...`);
    }, REALTIME_SOFT_WARN_MS);

    // Overall timeout — 10 minutes. Don't orphan the job; inform the user.
    timeoutTimer = setTimeout(() => {
      _dbg('HARD_TIMEOUT', { elapsedSec: monotonicElapsedSec(startTime) });
      const msg = `비디오 생성이 6분(360초)을 초과했습니다. 서버 오류일 수 있습니다. 다시 시도해주세요.`;
      report('error', 0, msg);
      // Do NOT write FAILED to the DB here — the server may still complete the
      // job successfully. Writing FAILED would overwrite the eventual SUCCESS
      // and prevent retryFromDB from picking up the real result. Only reject
      // locally so the caller can retry; the server's final status wins.
      finish(() => reject(new Error(msg)));
    }, REALTIME_TIMEOUT_MS);

    // Background pause: stop all timers/channels when backgrounded to avoid
    // CPU drain and battery consumption. After BG_MAX_WAIT_MS in background,
    // fully stop polling — the job continues server-side and the user can
    // check the result page when they return.
    const pauseBackground = () => {
      if (isBackgrounded || settled) return;
      isBackgrounded = true;
      _dbg('pauseBackground');
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (runwayPollTimer) { clearTimeout(runwayPollTimer); runwayPollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (runwayFallbackStartTimer) { clearTimeout(runwayFallbackStartTimer); runwayFallbackStartTimer = null; }
      // Detach channel without bridge call — see comment below.
      // safeRemoveChannel calls supabase.removeChannel() (WebSocket close),
      // a bridge call forbidden in the immediate phase. Deferring to
      // setTimeout(0) prevents the JS-thread deadlock / watchdog SIGKILL
      // that was killing the app on background.
      const channelToRemove = channel;
      channel = null;
      if (channelToRemove) {
        safeSetTimeout(pendingRemovals, () => {
          try { safeRemoveChannel(channelToRemove); } catch { /* non-fatal */ }
        }, 0);
      }
      bgTimer = setTimeout(() => {
        if (settled) return;
        const msg = '백그라운드 대기 시간이 초과되었습니다. 앱으로 돌아오면 완성된 영상을 확인할 수 있습니다.';
        report('error', 0, msg);
        finish(() => reject(new Error(msg)));
      }, BG_MAX_WAIT_MS);
    };

    // --- Resume burst: run a short sequence of fast polls immediately after
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
      checkDb().catch(() => {}).finally(() => { /* release promise ref */ });
      checkScanVideoUrl().catch(() => {}).finally(() => { /* release promise ref */ });
      resumeBurstTimer = setTimeout(runResumeBurst, RESUME_BURST_INTERVAL_MS);
    };

    const resumeBackground = () => {
      if (!isBackgrounded || settled) return;
      isBackgrounded = false;
      _dbg('resumeBackground');
      if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
      pollBackoffAttempt = 0;
      reconnectAttempts = 0;
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      onFlushComplete(() => {
        if (settled) return;
        setupChannel().catch(() => { /* non-fatal */ });
        runwayFallbackStartTimer = setTimeout(startRunwayPollFallback, RUNWAY_POLL_FALLBACK_START_MS);
        resumeBurstCount = 0;
        runResumeBurst();
      });
    };

    // Pause runs in 'immediate' phase (synchronous) so timers/channels are
    // cleared BEFORE the OS locks the bridge on background. Resume runs in
    // 'deferred' phase so bridge work waits for the flush window.
    const handlePauseImmediate = (nextState: string) => {
      if (nextState === 'background') {
        pauseBackground();
      }
    };
    const handleResumeDeferred = (nextState: string) => {
      if (nextState === 'active') {
        resumeBackground();
      }
    };
    appSubImmediate = registerAppStateHandler('immediate', handlePauseImmediate);
    appSub = registerAppStateHandler('deferred', handleResumeDeferred);

    // Initial DB check in case the webhook already completed before we subscribed
    _dbg('initial-check');
    checkDb().catch(() => {}).finally(() => { /* release promise ref */ });
    checkScanVideoUrl().catch(() => {}).finally(() => { /* release promise ref */ });
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
const inFlightSubmits = new Map<string, Promise<SubmitOnlyResult>>();

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

  const idempotencyKey = generateIdempotencyKey();

  // Deduplicate concurrent submits for the same scanId. If a submit is
  // already in-flight (button double-tap, retry race, network jitter), the
  // second caller receives the same promise instead of firing a duplicate
  // request to the server. This prevents conflicting job rows and the
  // 0%/97% stall seeds caused by duplicate payloads.
  const dedupKey = options.scanId ?? idempotencyKey;
  const existing = inFlightSubmits.get(dedupKey);
  if (existing) return existing;

  const submitPromise = (async (): Promise<SubmitOnlyResult> => {
  // Runway is the provider and billing source for video generation. Do not gate
  // this request with the app's separate internal credit ledger.
  const submitBody = compactBody({
    mode: 'submit',
    prompt,
    durationSec: options.durationSec ?? 5,
    aspectRatio: options.aspectRatio ?? '9:16',
    productName: options.productName,
    scanId: options.scanId,
    idempotencyKey,
    variationSeed: options.variationSeed ?? 0,
    bgmMood: options.bgmMood,
    captionText: options.captionText,
    platform: options.platform ?? 'shorts',
    hookCategory: options.hookCategory ?? 'curiosity',
    memeFormat: options.memeFormat,
    memeText: options.memeText,
    cutCount: options.cutCount,
    productVision: options.productVision,
    contentTone: options.contentTone,
    draft: options.draft,
    isDraft: options.draft === true,
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
    modelImageUrl: options.modelImageUrl,
  });

  await Promise.race([
    ensureFreshSession(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]).catch(() => { /* non-fatal — proceed with existing session */ });

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

  let hardTimeoutCleanup: (() => void) | null = null;
  const hardTimeoutPromise = new Promise<{ data: null; error: Error }>((resolve) => {
    const timer = setTimeout(
      () => { submitController.abort(); resolve({ data: null, error: new Error('영상 생성 요청 시간이 초과되었습니다. 다시 시도해주세요.') }); },
      SUBMIT_TIMEOUT_MS,
    );
    hardTimeoutCleanup = () => clearTimeout(timer);
  });

  const { data, error } = await Promise.race([
    invokePromise,
    softTimeoutPromise,
    hardTimeoutPromise,
  ]).finally(() => {
    clearTimeout(submitTimeoutId);
    if (hardTimeoutCleanup) hardTimeoutCleanup();
  });

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
  })().finally(() => {
    inFlightSubmits.delete(dedupKey);
  });

  inFlightSubmits.set(dedupKey, submitPromise);
  return submitPromise;
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
  isDraft: boolean = false,
): () => void {
  let settled = false;
  let isPaused = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let channelHealth: ChannelHealth = ChannelHealth.DISCONNECTED;
  let reconnectAttempts = 0;
  let pollBackoffAttempt = 0;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let consecutivePollFailures = 0;
  const pendingRemovals: SafeTimerSet = createSafeTimerSet();

  const isSoftTaskId = taskId.startsWith('soft-') || taskId.startsWith('hd-soft-');
  const pollStartTime = Date.now();
  const _dbg = (stage: string, extra?: unknown) => {
    if (!__DEV__) return;
    const elapsedSec = Math.round((Date.now() - pollStartTime) / 1000);
    console.log(`[aiVideoPipeline:subscribeVideoJob] t=${elapsedSec}s stage=${stage}`, extra ?? '');
    addBreadcrumb('video', `subscribeVideoJob: ${stage}`, 'warning', { elapsedSec, ...(extra && typeof extra === 'object' ? extra as Record<string, unknown> : {}) });
  };
  _dbg('init', { scanId, taskId, isSoftTaskId });

  const checkAndNotify = async () => {
    if (settled) return;
    try {
      _dbg('checkAndNotify:start');
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
      const { data, error } = await withQueryTimeout(query.maybeSingle(), 5000, 'subscribeVideoJob.checkAndNotify');
      if (error) throw new Error(error.message);
      if (!data) {
        _dbg('checkAndNotify:no-job-row');
        // No job row found — try scans.video_url as a fallback (webhook may
        // have completed without the video_jobs row being visible yet).
        try {
          const { data: scanData } = await withQueryTimeout(
            supabase
              .from('scans')
              .select('video_url, muxed_video_url')
              .eq('id', scanId)
              .maybeSingle(),
            5000,
            'subscribeVideoJob.checkAndNotify.scans',
          );
          const scanFinalUrl = scanData?.video_url || scanData?.muxed_video_url;
          if (scanFinalUrl) {
            _dbg('checkAndNotify:scan-fallback-SUCCESS');
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
      _dbg('checkAndNotify:row', { status: row.status, step: row.step, hasVideoUrl: !!row.video_url });
      if (row.status === 'SUCCESS' && row.video_url) {
        settled = true;
        cleanup();
        callback({ status: 'SUCCESS', step: row.step, progress: 1, videoUrl: row.video_url });
        return;
      }
      if (row.status === 'FAILED') {
        _dbg('checkAndNotify:FAILED');
        settled = true;
        cleanup();
        callback({ status: 'FAILED', step: row.step, progress: 0, error: row.error_message ?? '비디오 생성에 실패했습니다.' });
        return;
      }
      // Non-terminal: also check scans.video_url — the webhook may have
      // written the result to scans but the video_jobs PATCH hasn't
      // landed yet (race between webhook and server-poll).
      try {
        const { data: scanData } = await withQueryTimeout(
          supabase
            .from('scans')
            .select('video_url, muxed_video_url')
            .eq('id', scanId)
            .maybeSingle(),
          5000,
          'subscribeVideoJob.checkAndNotify.scans2',
        );
        const scanFinalUrl = scanData?.video_url || scanData?.muxed_video_url;
        if (scanFinalUrl) {
          _dbg('checkAndNotify:scan-video-url-SUCCESS');
          settled = true;
          cleanup();
          callback({ status: 'SUCCESS', step: 'completed', progress: 1, videoUrl: scanFinalUrl });
          return;
        }
      } catch (err) { console.error('[aiVideoPipeline] scans fallback lookup failed:', err); }

      // Report progress using the higher of server-step mapping and
      // time-based creep, so the UI never freezes at a stale percentage.
      const stepProgress = stepToProgress(row.step);
      const elapsedSec = Math.round((Date.now() - pollStartTime) / 1000);
      const timeProgress = computeTimeProgress(elapsedSec, isDraft);
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
      _dbg('checkAndNotify:error', { consecutivePollFailures, err: err instanceof Error ? err.message : String(err) });
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
    if (channel) {
      const ch = channel;
      channel = null;
      try { safeRemoveChannel(ch); } catch { /* non-fatal */ }
    }
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (runwayPollTimer) clearTimeout(runwayPollTimer);
    if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
    if (overallTimeoutTimer) clearTimeout(overallTimeoutTimer);
    clearAllSafeTimers(pendingRemovals);
  };

  const scheduleReconnect = () => {
    if (settled || isPaused || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts) * JITTER();
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      if (settled) return;
      if (channel) {
        const ch = channel;
        channel = null;
        safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
      }
      setupChannel().catch(() => { /* non-fatal */ });
    }, delayMs);
  };

  const setupChannel = async () => {
    if (settled) return;
    _dbg('setupChannel');
    if (channel) {
      const ch = channel;
      channel = null;
      safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
    }
    channel = await createChannel(`video-job:${scanId}:${taskId}`);
    if (settled) { safeRemoveChannel(channel); channel = null; return; }
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
        (payload) => {
          if (!payload.new) return;
          const isTerminal = (payload.new as { status?: string }).status === 'SUCCESS'
            || (payload.new as { status?: string }).status === 'FAILED';
          if (isInFlushWindow() && !isTerminal) return;
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
              const timeProgress = computeTimeProgress(elapsedSec, isDraft);
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
          // Do NOT drop scans events during flush window — muxed_video_url
          // is the most reliable terminal completion signal.
          try {
            const row = payload.new as { video_url?: string | null; muxed_video_url?: string | null };
            const finalUrl = row.video_url || row.muxed_video_url;
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
        _dbg('channel:subscribe', { status });
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
    if (settled || isPaused || runwayFallbackStarted) return;
    runwayFallbackStarted = true;
    _dbg('startRunwayPollFallback', { isSoftTaskId });
    const runwayPoll = async () => {
      if (settled) return;
      // For soft-task IDs (submit timed out), there's no real Runway task to
      // poll directly. Use checkAndNotify (DB poll by scanId) instead so we
      // still detect completion via the video_jobs row or scans.video_url.
      if (isSoftTaskId) {
        await checkAndNotify();
        if (settled) return;
        if (!settled && !isPaused) {
          runwayPollTimer = setTimeout(runwayPoll, RUNWAY_POLL_FALLBACK_INTERVAL_MS);
        }
        return;
      }
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
          const resp = (data ?? {}) as { status?: string; videoUrl?: string; error?: string };
          _dbg('runwayPoll:resp', { status: resp.status, hasVideoUrl: !!resp.videoUrl });
          if (resp.status === 'SUCCESS') {
            if (resp.videoUrl) {
              _dbg('runwayPoll:SUCCESS');
              settled = true;
              cleanup();
              callback({ status: 'SUCCESS', step: 'completed', progress: 1, videoUrl: resp.videoUrl });
              return;
            }
            // SUCCESS without URL — DB force-sync to grab it
            _dbg('runwayPoll:SUCCESS-no-url, DB sync');
            await checkAndNotify();
            if (settled) return;
          }
          if (resp.status === 'FAILED') {
            settled = true;
            cleanup();
            callback({ status: 'FAILED', error: resp.error ?? '비디오 생성에 실패했습니다.' });
            return;
          }
        }
      } catch (err) {
        _dbg('runwayPoll:error', { err: err instanceof Error ? err.message : String(err) });
        consecutivePollFailures++;
        if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          settled = true;
          cleanup();
          removeBgPause();
          callback({ status: 'FAILED', error: POLL_FAIL_MESSAGE });
          return;
        }
      }
      if (!settled && !isPaused) {
        runwayPollTimer = setTimeout(runwayPoll, RUNWAY_POLL_FALLBACK_INTERVAL_MS);
      }
    };
    runwayPollTimer = setTimeout(runwayPoll, RUNWAY_POLL_FALLBACK_START_MS);
  };

  const scheduleNextPoll = () => {
    if (settled || isPaused) return;
    const elapsed = Date.now() - pollStartTime;
    const interval = channelHealth === ChannelHealth.HEALTHY
      ? computeBackoffDelay(pollBackoffAttempt, elapsed)
      : POLL_MIN_INTERVAL_MS;
    pollTimer = setTimeout(async () => {
      if (settled || isPaused) return;
      await checkAndNotify();
      if (!settled && !isPaused) {
        if (channelHealth === ChannelHealth.HEALTHY) {
          pollBackoffAttempt++;
        }
        scheduleNextPoll();
      }
    }, interval);
  };

  // Overall timeout — 10 minutes (aligned with useResultPolling's
  // HARD_TIMEOUT_MS). After this, do one final check and if still not
  // complete, force a FAILED with a retry message instead of leaving the
  // user stuck at a frozen progress percentage forever.
  let overallTimeoutTimer = setTimeout(() => {
    if (settled) return;
    _dbg('HARD_TIMEOUT', { elapsedSec: Math.round((Date.now() - pollStartTime) / 1000) });
    checkAndNotify().then(() => {
      if (settled) return;
      settled = true;
      cleanup();
      removeBgPause();
      const msg = '비디오 생성이 6분(360초)을 초과했습니다. 다시 시도해주세요.';
      if (scanId) {
        void supabase.from('video_jobs').update({ status: 'FAILED', step: 'failed', error_message: msg }).eq('scan_id', scanId).eq('task_id', taskId).neq('status', 'SUCCESS').neq('status', 'FAILED').then(() => {}, (e: unknown) => console.error('[aiVideoPipeline] circuit breaker DB update failed:', e));
      }
      callback({ status: 'FAILED', error: msg });
    }).catch(() => {}).finally(() => { /* release promise ref */ });
  }, HARD_CIRCUIT_BREAKER_MS);

  _dbg('initial-setup');
  setupChannel().catch(() => { /* non-fatal */ });
  scheduleNextPoll();
  checkAndNotify().catch(() => {}).finally(() => { /* release promise ref */ });
  startRunwayPollFallback();

  const removeBgPause = installBackgroundPause({
    isSettled: () => settled,
    pause: () => {
      isPaused = true;
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (runwayPollTimer) { clearTimeout(runwayPollTimer); runwayPollTimer = null; }
      if (overallTimeoutTimer) clearTimeout(overallTimeoutTimer);
      if (channel) {
        const ch = channel;
        channel = null;
        safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
      }
      // Reset the Runway fallback flag so it can re-fire on resume.
      // Without this, the Runway direct-poll backup is permanently
      // disabled after the first background cycle.
      runwayFallbackStarted = false;
    },
    resume: () => {
      isPaused = false;
      pollBackoffAttempt = 0;
      reconnectAttempts = 0;
      // Re-arm the overall timeout — it was cleared on pause, and without
      // it the poll loop has no iteration bound, causing the permanent
      // 97-99% stall after a single background→foreground cycle.
      if (overallTimeoutTimer) clearTimeout(overallTimeoutTimer);
      overallTimeoutTimer = setTimeout(() => {
        if (settled) return;
        _dbg('HARD_TIMEOUT_AFTER_RESUME', { elapsedSec: Math.round((Date.now() - pollStartTime) / 1000) });
        checkAndNotify().then(() => {
          if (settled) return;
          settled = true;
          cleanup();
          removeBgPause();
          const msg = '비디오 생성이 6분(360초)을 초과했습니다. 다시 시도해주세요.';
          if (scanId) {
            void supabase.from('video_jobs').update({ status: 'FAILED', step: 'failed', error_message: msg }).eq('scan_id', scanId).eq('task_id', taskId).neq('status', 'SUCCESS').neq('status', 'FAILED').then(() => {}, (e: unknown) => console.error('[aiVideoPipeline] circuit breaker DB update failed:', e));
          }
          callback({ status: 'FAILED', error: msg });
        }).catch(() => {}).finally(() => { /* release promise ref */ });
      }, HARD_CIRCUIT_BREAKER_MS);
      // Clear stale timers before re-arming — rapid inactive↔active
      // oscillations on iOS can stack timers if resume fires before
      // the previous cycle's timers were cleared.
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      // Defer ALL bridge work through onFlushComplete to avoid the
      // reconnect-storm bridge flood on foreground return. This matches
      // waitForVideoCompletion's resumeBackground pattern.
      onFlushComplete(() => {
        if (settled) return;
        setupChannel().catch(() => { /* non-fatal */ });
        scheduleNextPoll();
        checkAndNotify().catch(() => {}).finally(() => { /* release promise ref */ });
        startRunwayPollFallback();
        resumeBurstCount = 0;
        runResumeBurst();
      });
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

  const hdIdempotencyKey = generateIdempotencyKey();

  const hdSubmitBody = compactBody({
    mode: 'submit',
    prompt,
    durationSec: options.durationSec ?? 5,
    aspectRatio: options.aspectRatio ?? '9:16',
    productName: options.productName,
    scanId,
    idempotencyKey: hdIdempotencyKey,
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
    isDraft: false,
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
    modelImageUrl: options.modelImageUrl,
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
  const { error: hdUpdateError } = await supabase
    .from('video_jobs')
    .update({ hd_task_id: hdTaskId, hd_status: 'PENDING' })
    .eq('scan_id', scanId)
    .eq('task_id', draftJobId);
  if (hdUpdateError) {
    console.error('[aiVideoPipeline] upgradeVideoToHd: DB update failed:', hdUpdateError);
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
  let isPaused = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let channelHealth: ChannelHealth = ChannelHealth.DISCONNECTED;
  let reconnectAttempts = 0;
  let pollBackoffAttempt = 0;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let consecutivePollFailures = 0;
  const pendingRemovals: SafeTimerSet = createSafeTimerSet();

  const checkAndNotify = async () => {
    if (settled) return;
    try {
      const { data, error } = await withQueryTimeout(
        supabase
          .from('video_jobs')
          .select('hd_status, hd_video_url, error_message')
          .eq('scan_id', scanId)
          .eq('task_id', draftJobId)
          .maybeSingle(),
        5000,
        'subscribeHdUpgrade.checkAndNotify',
      );
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
      // No scans fallback here — scans.video_url holds the draft URL, not
      // the HD URL. Using it would prematurely resolve the HD upgrade with
      // the draft video, causing the real HD completion to be missed.
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
    if (channel) {
      const ch = channel;
      channel = null;
      try { safeRemoveChannel(ch); } catch { /* non-fatal */ }
    }
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
    if (hdOverallTimeoutTimer) clearTimeout(hdOverallTimeoutTimer);
    clearAllSafeTimers(pendingRemovals);
  };

  const scheduleReconnect = () => {
    if (settled || isPaused || reconnectAttempts >= CHANNEL_MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = CHANNEL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts) * JITTER();
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      if (settled) return;
      if (channel) {
        const ch = channel;
        channel = null;
        safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
      }
      setupChannel().catch(() => { /* non-fatal */ });
    }, delayMs);
  };

  const setupChannel = async () => {
    if (settled) return;
    if (channel) {
      const ch = channel;
      channel = null;
      safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
    }
    channel = await createChannel(`hd-upgrade:${scanId}:${draftJobId}`);
    if (settled) { safeRemoveChannel(channel); channel = null; return; }
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scanId}` },
        (payload) => {
          if (!payload.new) return;
          const isTerminal = (payload.new as { status?: string }).status === 'SUCCESS'
            || (payload.new as { status?: string }).status === 'FAILED';
          if (isInFlushWindow() && !isTerminal) return;
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
    if (settled || isPaused) return;
    const elapsed = Date.now() - hdPollStartTime;
    const interval = channelHealth === ChannelHealth.HEALTHY
      ? computeBackoffDelay(pollBackoffAttempt, elapsed)
      : POLL_MIN_INTERVAL_MS;
    pollTimer = setTimeout(async () => {
      if (settled || isPaused) return;
      await checkAndNotify();
      if (!settled && !isPaused) {
        if (channelHealth === ChannelHealth.HEALTHY) {
          pollBackoffAttempt++;
        }
        scheduleNextPoll();
      }
    }, interval);
  };

  // Overall timeout — 6 minutes (360000ms). Force a final check, then FAILED if still
  // not complete, instead of polling forever.
  let hdOverallTimeoutTimer = setTimeout(() => {
    if (settled) return;
    checkAndNotify().then(() => {
      if (settled) return;
      settled = true;
      cleanup();
      removeBgPause();
      callback({ status: 'FAILED', error: '고화질 업그레이드가 6분(360초)을 초과했습니다. 초안 영상은 그대로 이용할 수 있습니다.' });
    }).catch(() => {}).finally(() => { /* release promise ref */ });
  }, HARD_CIRCUIT_BREAKER_MS);

  setupChannel().catch(() => { /* non-fatal */ });
  scheduleNextPoll();
  checkAndNotify().catch(() => {}).finally(() => { /* release promise ref */ });

  const removeBgPause = installBackgroundPause({
    isSettled: () => settled,
    pause: () => {
      isPaused = true;
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (hdOverallTimeoutTimer) clearTimeout(hdOverallTimeoutTimer);
      if (channel) {
        const ch = channel;
        channel = null;
        safeSetTimeout(pendingRemovals, () => { try { safeRemoveChannel(ch); } catch { /* non-fatal */ } }, 0);
      }
    },
    resume: () => {
      isPaused = false;
      pollBackoffAttempt = 0;
      reconnectAttempts = 0;
      // Re-arm the overall timeout — it was cleared on pause, and without
      // it the poll loop runs indefinitely after a background cycle.
      if (hdOverallTimeoutTimer) clearTimeout(hdOverallTimeoutTimer);
      hdOverallTimeoutTimer = setTimeout(() => {
        if (settled) return;
        checkAndNotify().then(() => {
          if (settled) return;
          settled = true;
          cleanup();
          removeBgPause();
          callback({ status: 'FAILED', error: '고화질 업그레이드가 6분(360초)을 초과했습니다. 초안 영상은 그대로 이용할 수 있습니다.' });
        }).catch(() => {}).finally(() => { /* release promise ref */ });
      }, HARD_CIRCUIT_BREAKER_MS);
      // Clear stale timers before re-arming to prevent timer stacking.
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      // Defer ALL bridge work through onFlushComplete to avoid the
      // reconnect-storm bridge flood on foreground return.
      onFlushComplete(() => {
        if (settled) return;
        setupChannel().catch(() => { /* non-fatal */ });
        scheduleNextPoll();
        checkAndNotify().catch(() => {}).finally(() => { /* release promise ref */ });
        resumeBurstCount = 0;
        runResumeBurst();
      });
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
    const { data, error } = await withQueryTimeout(
      supabase
        .from('video_jobs')
        .select('status, step, video_url, error_message, is_hd, hd_status, hd_video_url')
        .eq('scan_id', scanId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      5000,
      'recoverVideoJob.jobs',
    );

    if (error || !data) {
      // Fallback: check scans.video_url / muxed_video_url directly
      const { data: scanData } = await withQueryTimeout(
        supabase
          .from('scans')
          .select('video_url, muxed_video_url')
          .eq('id', scanId)
          .maybeSingle(),
        5000,
        'recoverVideoJob.scans',
      );
      const scanFinalUrl = scanData?.video_url || scanData?.muxed_video_url;
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

