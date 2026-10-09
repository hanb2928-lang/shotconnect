import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase, ensureFreshSession } from '@/lib/supabase';
import { submitVideoJobAsync, type VideoGenProgress } from '@/lib/aiVideoPipeline';
import { useResultPolling } from '@/hooks/useResultPolling';
import { getActiveVideoJob, clearActiveVideoJob, saveActiveVideoJob, updateActiveVideoJobStep } from '@/lib/videoJobPersistence';
import { notifyVideoCompleted } from '@/lib/pushNotify';
import { friendlyError } from '@/lib/errors';
import { logError } from '@/lib/errorLogger';
import { stepToProgress } from '@/lib/videoGenSteps';
import { autoSelectHook } from '@/lib/autoHookEngine';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export type GenPhase = 'idle' | 'submitting' | 'generating' | 'completed' | 'error';

export interface VideoGenState {
  isGenerating: boolean;
  jobId: string | null;
  videoProgress: VideoGenProgress | null;
  resultVideoUrl: string | null;
  resultImageUrl: string | null;
  error: string | null;
  scanId: string | null;
}

export interface StartGenerationParams {
  promptText: string;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  productName: string;
  captionText: string;
  platform: string;
  genMode: string;
  enableOrbit360: boolean;
  enableCaustics?: boolean;
  orbitSpeed?: number;
  enableVirtualFitting?: boolean;
  enableFabricPhysics: boolean;
  cameraSpeed: number;
  mainUrl: string;
  restUrls: string[];
  modelUrl: string | null;
  outputMode: 'image' | 'video';
}

interface VideoGenContextValue extends VideoGenState {
  startGeneration: (params: StartGenerationParams) => Promise<void>;
  clearGeneration: () => void;
  clearResult: () => void;
  progressMessage: string;
}

const VideoGenContext = createContext<VideoGenContextValue | null>(null);

export function useVideoGen(): VideoGenContextValue {
  const ctx = useContext(VideoGenContext);
  if (!ctx) throw new Error('useVideoGen must be used within VideoGenProvider');
  return ctx;
}

export function VideoGenProvider({ children }: { children: ReactNode }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<VideoGenProgress | null>(null);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scanIdRef = useRef<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const genStartRef = useRef<number>(0);
  const generateLockRef = useRef(false);
  const outputModeRef = useRef<'image' | 'video'>('video');
  const abortRef = useRef<AbortController | null>(null);
  const productNameRef = useRef<string>('');
  const hookTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedHookRef = useRef<ReturnType<typeof autoSelectHook> | null>(null);
  const stepStallRef = useRef<{ step: string; since: number } | null>(null);
  const stepStallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ninetyFivePctSinceRef = useRef<number | null>(null);
  const completionFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateActiveRef = useRef(true);
  const foregroundSyncRef = useRef<Promise<void> | null>(null);

  // Keep-awake during generation
  useEffect(() => {
    const tag = 'videogen-global';
    if (isGenerating) {
      activateKeepAwakeAsync(tag).catch(() => {});
    } else {
      deactivateKeepAwake(tag).catch(() => {});
    }
    return () => { deactivateKeepAwake(tag).catch(() => {}); };
  }, [isGenerating]);

  // Track app active/background state so background-sensitive timers
  // (step-stall DB sync, hook timeout) can skip work while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      appStateActiveRef.current = state === 'active';
    });
    return () => sub.remove();
  }, []);

  // Abort any in-flight submit when the provider unmounts to prevent
  // orphaned fetch callbacks from updating state on an unmounted component.
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  // Restore in-progress job from persistent storage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await getActiveVideoJob();
      if (cancelled || !active || !active.jobId) return;
      try {
        await ensureFreshSession();
        const isSoft = active.jobId.startsWith('soft-') || active.jobId.startsWith('hd-soft-');
        let query = supabase.from('video_jobs').select('status');
        const { data, error: dbError } = isSoft && active.scanId
          ? await query.eq('scan_id', active.scanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
          : await query.eq('task_id', active.jobId).maybeSingle();
        if (cancelled) return;
        if (dbError) return;
        if (!data) {
          clearActiveVideoJob();
          return;
        }
        const status = (data as { status: string }).status;
        if (status === 'SUCCESS' || status === 'FAILED') {
          clearActiveVideoJob();
          return;
        }
        if (active.scanId) scanIdRef.current = active.scanId;
        jobIdRef.current = active.jobId;
        setJobId(active.jobId);
        setIsGenerating(true);
        const restoreProgress = active.progress > 0 ? Math.min(active.progress, 0.9) : 0.5;
        setVideoProgress({ phase: 'generating', progress: restoreProgress, message: '이전 생성 작업을 복구하는 중...', elapsedSec: 0, serverStep: active.step });
      } catch {
        // DB unreachable — don't resume
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Force-sync job status from DB when app returns to foreground
  useEffect(() => {
    if (!jobId) return;
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        if (foregroundSyncRef.current) return;
        // Foreground return: resync job status from DB. Use task_id (not id)
        // since jobId is the Runway/internal task identifier.
        const sync = (async () => {
          try {
            await ensureFreshSession();
            const isSoft = jobId.startsWith('soft-');
            let query = supabase
              .from('video_jobs')
              .select('status, video_url, error_message, step');
            const { data, error: dbError } = isSoft && scanIdRef.current
              ? await query.eq('scan_id', scanIdRef.current).order('created_at', { ascending: false }).limit(1).maybeSingle()
              : await query.eq('task_id', jobId).maybeSingle();
            if (dbError || !data) {
              // video_jobs lookup failed — try scans.video_url / muxed_video_url as fallback.
              if (scanIdRef.current) {
                const { data: scanData } = await supabase
                  .from('scans')
                  .select('video_url, muxed_video_url')
                  .eq('id', scanIdRef.current)
                  .maybeSingle();
                const scanFinalUrl = scanData?.muxed_video_url ?? scanData?.video_url;
                if (scanFinalUrl) {
                  clearActiveVideoJob();
                  jobIdRef.current = null;
                  setJobId(null);
                  setIsGenerating(false);
                  if (outputModeRef.current === 'image') {
                    setResultImageUrl(scanFinalUrl);
                  } else {
                    setResultVideoUrl(scanFinalUrl);
                  }
                  serverProgRef.current = 1.0;
                  setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
                  notifyVideoCompleted();
                  return;
                }
              }
              return;
            }
            const row = data as { status: string; video_url: string | null; error_message: string | null; step: string | null };
            if (row.status === 'SUCCESS' && row.video_url) {
              clearActiveVideoJob();
              jobIdRef.current = null;
              setJobId(null);
              setIsGenerating(false);
              if (outputModeRef.current === 'image') {
                setResultImageUrl(row.video_url);
              } else {
                setResultVideoUrl(row.video_url);
              }
              serverProgRef.current = 1.0;
              setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
              notifyVideoCompleted();
            } else if (row.status === 'FAILED') {
              clearActiveVideoJob();
              jobIdRef.current = null;
              setJobId(null);
              setIsGenerating(false);
              setVideoProgress(null);
              serverProgRef.current = null;
              setError(row.error_message ?? '영상 생성에 실패했습니다.');
            } else {
              // Still in progress — nudge progress forward to show the UI is alive.
              // Monotonic guard: never let a stale DB read regress progress below
              // what the UI already shows (race condition on background→foreground).
              const stepProg = stepToProgress(row.step);
              if (stepProg !== null && !isNaN(stepProg) && stepProg > 0) {
                serverProgRef.current = Math.max(serverProgRef.current ?? 0, stepProg);
              }
              setVideoProgress((prev) => {
                if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
                const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
                const timeProgress = Math.min(0.9, 0.15 + elapsed * 0.006);
                const merged = Math.max(prev.progress, timeProgress, stepProg ?? 0);
                const clampMax = 0.85;
                return { ...prev, elapsedSec: elapsed, progress: Math.max(0, Math.min(clampMax, merged || 0)) };
              });
            }
          } catch {
            // ignore — polling will catch up
          }
        })();
        foregroundSyncRef.current = sync;
        sync.finally(() => {
          if (foregroundSyncRef.current === sync) foregroundSyncRef.current = null;
        });
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [jobId]);

  // Progress timer — advances progress while generating.
  // Combines: (a) time-based interpolation up to 90%, (b) server-reported
  // progress from polling/Realtime, (c) a 2-second soft-creep guard so the
  // bar never visually stalls even when the server is silent.
  // Pauses during background to avoid wasted renders and progress jumps.
  const serverProgRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isGenerating) return;
    const GEN_TIMEOUT_MS = 600_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    let creepTimer: ReturnType<typeof setInterval> | null = null;
    let hardGuardTimer: ReturnType<typeof setInterval> | null = null;
    let completionWatchTimer: ReturnType<typeof setInterval> | null = null;
    const completionRetry = { attempts: 0, max: 6 };

    const startTimers = () => {
      if (timer || creepTimer) return;
      timer = setInterval(() => {
        const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
        setVideoProgress((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
          const clampMax = 0.85;
          const timeBasedProgress = Math.min(0.85, 0.15 + elapsed * 0.006);
          const serverProg = serverProgRef.current;
          const safeServer = (serverProg !== null && !isNaN(serverProg) && isFinite(serverProg)) ? serverProg : null;
          const baseProgress = Math.max(prev.progress, timeBasedProgress);
          const nextProgress = safeServer !== null
            ? Math.max(baseProgress, Math.min(safeServer, clampMax))
            : baseProgress;
          return { ...prev, elapsedSec: elapsed, progress: Math.max(0, Math.min(clampMax, nextProgress)) };
        });
      }, 1500);
      creepTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
          const creepCeiling = 0.85;
          if (prev.progress >= creepCeiling) return prev;
          const serverProg = serverProgRef.current;
          const ceiling = serverProg !== null ? Math.max(serverProg + 0.02, creepCeiling) : creepCeiling;
          const nudge = prev.progress + 0.02;
          return { ...prev, progress: Math.min(nudge, ceiling) };
        });
      }, 3000);
      // Hard progression guard: every 10 seconds, force progress forward by
      // 10% (up to 90%) so the bar can never freeze at a fixed value even
      // when the server is completely silent.
      hardGuardTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
          const guardCeiling = 0.85;
          if (prev.progress >= guardCeiling) return prev;
          const forced = Math.min(prev.progress + 0.10, guardCeiling);
          const serverProg = serverProgRef.current;
          if (serverProg !== null && serverProg > forced) return prev;
          return { ...prev, progress: forced };
        });
      }, 12_000);
      // Completion guard: if progress stays at or above 85% (rendering)
      // for 15 seconds without the server delivering a terminal status, do
      // a DB force-sync. The server goes rendering→completed directly, so
      // 85% means rendering is underway and the result should be in the DB
      // soon. If the DB check finds the job still in progress, retry after
      // a delay instead of bailing out with a timeout error.
      const COMPLETION_FALLBACK_DELAY_MS = 15_000;
      const completionRetryRef = completionRetry;
      const checkCompletionFallback = () => {
        const currentJobId = jobIdRef.current;
        const currentScanId = scanIdRef.current;
        if (!currentJobId) return;
        (async () => {
          try {
            await ensureFreshSession();
            // First check scans.video_url — the webhook writes here directly
            // and it's the most reliable completion signal.
            if (currentScanId) {
              const { data: scanData } = await supabase
                .from('scans')
                .select('video_url, muxed_video_url')
                .eq('id', currentScanId)
                .maybeSingle();
              if (scanData) {
                const scanFinalUrl = scanData.muxed_video_url ?? scanData.video_url;
                if (scanFinalUrl) {
                  clearActiveVideoJob();
                  jobIdRef.current = null;
                  setJobId(null);
                  setIsGenerating(false);
                  serverProgRef.current = 1.0;
                  if (outputModeRef.current === 'image') {
                    setResultImageUrl(scanFinalUrl);
                  } else {
                    setResultVideoUrl(scanFinalUrl);
                  }
                  setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
                  notifyVideoCompleted();
                  return;
                }
              }
            }
            const isSoft = currentJobId.startsWith('soft-');
            let q = supabase.from('video_jobs').select('status, video_url, error_message');
            const { data, error: dbErr } = isSoft && currentScanId
              ? await q.eq('scan_id', currentScanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
              : await q.eq('task_id', currentJobId).maybeSingle();
            if (dbErr || !data) {
              throw new Error('DB lookup failed');
            }
            const row = data as { status: string; video_url: string | null; error_message: string | null };
            if (row.status === 'SUCCESS' && row.video_url) {
              clearActiveVideoJob();
              jobIdRef.current = null;
              setJobId(null);
              setIsGenerating(false);
              serverProgRef.current = 1.0;
              if (outputModeRef.current === 'image') {
                setResultImageUrl(row.video_url);
              } else {
                setResultVideoUrl(row.video_url);
              }
              setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
              notifyVideoCompleted();
            } else if (row.status === 'FAILED') {
              clearActiveVideoJob();
              jobIdRef.current = null;
              setJobId(null);
              setIsGenerating(false);
              setVideoProgress(null);
              serverProgRef.current = null;
              setError(row.error_message ?? '영상 생성에 실패했습니다.');
            } else {
              // Job still in progress — retry after delay instead of bailing
              completionRetryRef.attempts++;
              if (completionRetryRef.attempts < completionRetryRef.max) {
                completionFallbackRef.current = setTimeout(checkCompletionFallback, 10_000);
                return;
              }
              throw new Error('Completion retry limit reached');
            }
          } catch {
            // Only bail out after exhausting retries or on hard DB failure
            if (completionRetryRef.attempts >= completionRetryRef.max) {
              jobIdRef.current = null;
              setJobId(null);
              setIsGenerating(false);
              setVideoProgress(null);
              serverProgRef.current = null;
              setError('영상 생성 시간이 초과되었습니다. 서버에서 계속 렌더링 중일 수 있어요. 잠시 후 작업 목록에서 완성된 영상을 확인할 수 있습니다.');
            } else {
              completionFallbackRef.current = setTimeout(checkCompletionFallback, 10_000);
            }
          }
        })();
      };

      completionWatchTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') {
            ninetyFivePctSinceRef.current = null;
            return prev;
          }
          if (prev.progress >= 0.85) {
            if (ninetyFivePctSinceRef.current === null) {
              ninetyFivePctSinceRef.current = Date.now();
            } else if (Date.now() - ninetyFivePctSinceRef.current >= COMPLETION_FALLBACK_DELAY_MS) {
              if (!completionFallbackRef.current) {
                completionFallbackRef.current = setTimeout(checkCompletionFallback, 0);
              }
              ninetyFivePctSinceRef.current = null;
            }
          } else {
            ninetyFivePctSinceRef.current = null;
          }
          return prev;
        });
      }, 3000);
    };

    const stopTimers = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (creepTimer) { clearInterval(creepTimer); creepTimer = null; }
      if (hardGuardTimer) { clearInterval(hardGuardTimer); hardGuardTimer = null; }
      if (completionWatchTimer) { clearInterval(completionWatchTimer); completionWatchTimer = null; }
      if (completionFallbackRef.current) { clearTimeout(completionFallbackRef.current); completionFallbackRef.current = null; }
      // Do NOT reset ninetyFivePctSinceRef here — backgrounding should
      // pause the countdown, not reset it. Otherwise a brief background
      // transition on native (e.g. notification banner) resets the
      // timer indefinitely and the fallback never fires.
      completionRetry.attempts = 0;
    };

    startTimers();

    const timeout = setTimeout(() => {
      jobIdRef.current = null;
      setJobId(null);
      setIsGenerating(false);
      setVideoProgress(null);
      setError('영상 생성 시간이 초과되었습니다. 서버에서 계속 렌더링 중일 수 있어요. 잠시 후 작업 목록에서 완성된 영상을 확인할 수 있습니다.');
    }, GEN_TIMEOUT_MS);

    // Pause timers when app goes to background to avoid wasted renders and
    // prevent a large progress jump when returning to foreground. Also abort
    // the submit AbortController so no orphaned fetch callbacks fire on a
    // backgrounded native view (OS memory reclaim crash defense).
    const appSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        stopTimers();
        // Abort in-flight submit request — the job continues server-side
        // and will be recovered on foreground return via DB resync.
        if (abortRef.current) {
          abortRef.current.abort();
        }
      } else if (state === 'active') {
        startTimers();
      }
    });

    return () => {
      stopTimers();
      clearTimeout(timeout);
      appSub.remove();
    };
  }, [isGenerating]);

  // Polling — runs globally, survives navigation away from synthesis
  const polling = useResultPolling(jobId, {
    scanId: scanIdRef.current,
    onCompleted: (videoUrl) => {
      jobIdRef.current = null;
      setJobId(null);
      setIsGenerating(false);
      clearActiveVideoJob();
      serverProgRef.current = 1.0;
      setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
      if (outputModeRef.current === 'image') {
        setResultImageUrl(videoUrl);
      } else {
        setResultVideoUrl(videoUrl);
      }
      notifyVideoCompleted();
    },
    onError: (errMsg) => {
      jobIdRef.current = null;
      setJobId(null);
      setIsGenerating(false);
      clearActiveVideoJob();
      setVideoProgress((prev) => prev ? { ...prev, phase: 'error', progress: 0, message: errMsg } : null);
      serverProgRef.current = null;
      logError(new Error(errMsg), { component: 'VideoGenProvider', action: 'polling.onError' });
      setError(friendlyError(new Error(errMsg), errMsg));
    },
  });

  // Sync server-reported progress from polling into a ref + state so the
  // progress timer can merge it into videoProgress.progress.
  useEffect(() => {
    const sp = polling.serverProgress;
    serverProgRef.current = sp;
    if (sp !== null && !isNaN(sp) && isFinite(sp) && sp > 0 && isGenerating) {
      const clamped = Math.max(0, Math.min(0.85, sp));
      setVideoProgress((prev) => {
        if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
        if (isNaN(clamped) || clamped <= prev.progress) return prev;
        const pctLabel = ` (${Math.round(clamped * 100)}%)`;
        const msg = `AI가 영상을 렌더링하고 있어요${pctLabel}...`;
        return { ...prev, progress: clamped, message: msg };
      });
    }
  }, [polling.serverProgress, isGenerating]);

  // Sync server-reported step from polling into videoProgress so the step
  // tracker can bind its icons to authoritative server state instead of
  // the time-based soft-creep percentage. Also persist the step to local
  // storage so an app crash/restart can resume from the last known step.
  useEffect(() => {
    const ss = polling.serverStep;
    if (ss) {
      updateActiveVideoJobStep(ss).catch(() => {});
      setVideoProgress((prev) => {
        if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
        if (prev.serverStep === ss) return prev;
        return { ...prev, serverStep: ss };
      });
    }
  }, [polling.serverStep]);

  // 5-second hook extraction timeout: if the server stays on the "hooking"
  // step for more than 5 seconds, generate a local fallback hook via
  // autoSelectHook and force-advance progress to the planning step so the
  // UI never hangs on the hook icon indefinitely.
  useEffect(() => {
    if (polling.serverStep === 'hooking') {
      if (hookTimeoutRef.current) return;
      hookTimeoutRef.current = setTimeout(() => {
        try {
          autoSelectHook({ productName: productNameRef.current });
        } catch {
          // Fallback hook generation failed — still advance to avoid hang
        }
        serverProgRef.current = 0.25;
        setVideoProgress((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
          return {
            ...prev,
            serverStep: 'planning',
            progress: Math.max(prev.progress, 0.25),
            message: '훅 문구 추출 완료 — 편집 플랜 구성 중...',
          };
        });
      }, 5000);
    } else if (polling.serverStep && polling.serverStep !== 'hooking') {
      if (hookTimeoutRef.current) {
        clearTimeout(hookTimeoutRef.current);
        hookTimeoutRef.current = null;
      }
    }
    return () => {
      if (hookTimeoutRef.current) {
        clearTimeout(hookTimeoutRef.current);
        hookTimeoutRef.current = null;
      }
    };
  }, [polling.serverStep]);

  // General step stall guard: if the serverStep hasn't changed for 30 seconds,
  // force-advance it to the next step so the step icons never freeze when the
  // Realtime websocket drops. This complements the hooking-specific timeout
  // above and covers all pipeline stages.
  useEffect(() => {
    if (!isGenerating) {
      stepStallRef.current = null;
      if (stepStallTimerRef.current) {
        clearInterval(stepStallTimerRef.current);
        stepStallTimerRef.current = null;
      }
      return;
    }
    if (stepStallTimerRef.current) return;

    // Server goes rendering → completed directly; finalizing is never sent.
    // Stop the stall guard at rendering (85%) and do a DB completion check
    // from there, instead of advancing to a fake 95% finalizing step that
    // traps the client.
    const STEP_ORDER = ['analyzing', 'hooking', 'planning', 'submitting', 'rendering'];
    const STEP_STALL_MS = 30_000;
    const STEP_THRESHOLDS: Record<string, number> = {
      analyzing: 0.05,
      hooking: 0.15,
      planning: 0.25,
      submitting: 0.35,
      rendering: 0.85,
    };

    stepStallTimerRef.current = setInterval(() => {
      setVideoProgress((prev) => {
        if (!prev || prev.phase === 'completed' || prev.phase === 'error' || prev.phase === 'submitting') return prev;
        const currentStep = prev.serverStep ?? 'analyzing';
        const now = Date.now();
        if (!stepStallRef.current || stepStallRef.current.step !== currentStep) {
          stepStallRef.current = { step: currentStep, since: now };
          return prev;
        }
        const stalledFor = now - stepStallRef.current.since;
        if (stalledFor < STEP_STALL_MS) return prev;

        // When stuck at "rendering" (the last step the server sends), do a
        // DB force-sync to check if the job already completed but the
        // Realtime/polling missed the update. Skip while backgrounded — the
        // foreground AppState handler already does a full DB resync, so this
        // would be a redundant and wasted call.
        if (currentStep === 'rendering' && appStateActiveRef.current) {
          const currentJobId = jobIdRef.current;
          const currentScanId = scanIdRef.current;
          if (currentJobId) {
            (async () => {
              try {
                await ensureFreshSession();
                // First check scans.video_url — the webhook writes here
                // directly and it's the most reliable completion signal.
                if (currentScanId) {
                  const { data: scanData } = await supabase
                    .from('scans')
                    .select('video_url, muxed_video_url')
                    .eq('id', currentScanId)
                    .maybeSingle();
                  if (scanData) {
                    const scanFinalUrl = scanData.muxed_video_url ?? scanData.video_url;
                    if (scanFinalUrl) {
                      clearActiveVideoJob();
                      jobIdRef.current = null;
                      setJobId(null);
                      setIsGenerating(false);
                      serverProgRef.current = 1.0;
                      if (outputModeRef.current === 'image') {
                        setResultImageUrl(scanFinalUrl);
                      } else {
                        setResultVideoUrl(scanFinalUrl);
                      }
                      setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
                      notifyVideoCompleted();
                      return;
                    }
                  }
                }
                const isSoft = currentJobId.startsWith('soft-');
                let q = supabase.from('video_jobs').select('status, video_url, error_message');
                const { data, error: dbErr } = isSoft && currentScanId
                  ? await q.eq('scan_id', currentScanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
                  : await q.eq('task_id', currentJobId).maybeSingle();
                if (dbErr || !data) return;
                const row = data as { status: string; video_url: string | null; error_message: string | null };
                if (row.status === 'SUCCESS' && row.video_url) {
                  clearActiveVideoJob();
                  jobIdRef.current = null;
                  setJobId(null);
                  setIsGenerating(false);
                  serverProgRef.current = 1.0;
                  if (outputModeRef.current === 'image') {
                    setResultImageUrl(row.video_url);
                  } else {
                    setResultVideoUrl(row.video_url);
                  }
                  setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
                  notifyVideoCompleted();
                } else if (row.status === 'FAILED') {
                  clearActiveVideoJob();
                  jobIdRef.current = null;
                  setJobId(null);
                  setIsGenerating(false);
                  setVideoProgress(null);
                  serverProgRef.current = null;
                  setError(row.error_message ?? '영상 생성에 실패했습니다.');
                }
              } catch {
                // DB unreachable — reset stall timer so we retry on next tick
              }
            })();
          }
          // Reset stall timer so we retry the DB check every 30s
          stepStallRef.current = { step: currentStep, since: now };
          return prev;
        }

        // Skip step force-advance while backgrounded — the foreground
        // AppState handler does a full DB resync that will reconcile
        // the step and progress authoritatively.
        if (!appStateActiveRef.current) {
          stepStallRef.current = { step: currentStep, since: now };
          return prev;
        }

        const idx = STEP_ORDER.indexOf(currentStep);
        if (idx < 0 || idx >= STEP_ORDER.length - 1) return prev;
        const nextStep = STEP_ORDER[idx + 1];
        const nextThreshold = STEP_THRESHOLDS[nextStep] ?? prev.progress;
        stepStallRef.current = { step: nextStep, since: now };
        return {
          ...prev,
          serverStep: nextStep,
          progress: Math.max(prev.progress, nextThreshold),
        };
      });
    }, 2000);

    return () => {
      if (stepStallTimerRef.current) {
        clearInterval(stepStallTimerRef.current);
        stepStallTimerRef.current = null;
      }
    };
  }, [isGenerating]);

  const startGeneration = useCallback(async (params: StartGenerationParams) => {
    if (generateLockRef.current) return;
    if (isGenerating || jobIdRef.current) return;
    generateLockRef.current = true;
    outputModeRef.current = params.outputMode;
    productNameRef.current = params.productName;
    abortRef.current = new AbortController();

    setError(null);
    setIsGenerating(true);
    setResultImageUrl(null);
    setResultVideoUrl(null);
    genStartRef.current = Date.now();
    prefetchedHookRef.current = null;

    let simProgress = 0;
    setVideoProgress({ phase: 'submitting', progress: 0.02, message: '촬영 에셋 준비 중...', elapsedSec: 0 });
    const simTimer = setInterval(() => {
      simProgress = Math.min(simProgress + 0.015, 0.12);
      const stepMsg = simProgress < 0.06
        ? '촬영 에셋 준비 중...'
        : simProgress < 0.10
        ? 'AI 분석 및 훅 추출 중...'
        : '렌더링 준비 중...';
      setVideoProgress((prev) => {
        if (!prev || prev.phase !== 'submitting') return prev;
        return { ...prev, progress: Math.max(prev.progress, simProgress), message: stepMsg };
      });
    }, 300);

    let nudgeTimer: ReturnType<typeof setInterval> | null = null;

    try {
      // Pre-fetch hook analysis during the scan insert wait — this
      // overlaps the local CPU work with the DB round-trip so the hook
      // is ready by the time submitVideoJobAsync needs it, shaving
      // 1-3 seconds off the perceived generation start.
      const hookPrefetchPromise = new Promise<void>((resolve) => {
        try {
          prefetchedHookRef.current = autoSelectHook({ productName: params.productName });
        } catch {
          // non-fatal — server will generate its own hook
        }
        resolve();
      });

      setVideoProgress({ phase: 'submitting', progress: 0.10, message: 'AI 렌더링 요청 전송 중...', elapsedSec: 0 });
      clearInterval(simTimer);

      nudgeTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase !== 'submitting') return prev;
          const next = Math.min(prev.progress + 0.008, 0.15);
          return { ...prev, progress: next, message: 'AI가 훅 문구를 분석하고 렌더링을 준비하는 중...' };
        });
      }, 2000);

      const { data: scanData, error: scanError } = await supabase
        .from('scans')
        .insert({
          image_url: params.mainUrl,
          scan_source: 'multi',
          product_name: params.productName,
          additional_image_urls: params.restUrls,
        })
        .select('id')
        .single();

      if (scanError || !scanData) {
        throw new Error('스캔 레코드 생성에 실패했습니다.');
      }
      scanIdRef.current = scanData.id;

      // Ensure the hook prefetch completed before proceeding.
      await hookPrefetchPromise;

      const submitResult = await submitVideoJobAsync(params.promptText, {
        durationSec: 5,
        aspectRatio: params.aspectRatio,
        productName: params.productName,
        scanId: scanData.id,
        captionText: params.captionText,
        platform: params.platform,
        isCleanVideoMode: params.genMode === 'auto_3d',
        selectedMode: params.genMode as 'auto_3d' | 'universal_synthesis' | 'manual',
        enableOrbit360: params.enableOrbit360,
        enableCaustics: params.genMode === 'auto_3d' ? params.enableCaustics : undefined,
        orbitSpeed: params.enableOrbit360 ? params.orbitSpeed : undefined,
        enableVirtualFitting: params.genMode === 'universal_synthesis' ? params.enableVirtualFitting : undefined,
        enableFabricPhysics: params.enableFabricPhysics,
        draft: true,
        mainImageUrl: params.mainUrl,
        signal: abortRef.current?.signal,
      }, (p) => {
        setVideoProgress(p);
      });

      clearInterval(nudgeTimer);
      clearInterval(simTimer);
      nudgeTimer = null;
      jobIdRef.current = submitResult.taskId;
      setJobId(submitResult.taskId);
      await saveActiveVideoJob(submitResult.taskId, 'submitting', scanIdRef.current);
      setVideoProgress({ phase: 'generating', progress: 0.15, message: 'AI가 영상을 렌더링하고 있어요...', elapsedSec: 0 });
    } catch (err) {
      if (nudgeTimer) { clearInterval(nudgeTimer); nudgeTimer = null; }
      clearInterval(simTimer);
      if (scanIdRef.current && !jobIdRef.current) {
        const orphanedScanId = scanIdRef.current;
        scanIdRef.current = null;
        try { await supabase.from('scans').delete().eq('id', orphanedScanId); } catch {}
      }
      const phase = jobIdRef.current ? 'ai-generation' : 'image-upload';
      jobIdRef.current = null;
      setIsGenerating(false);
      setVideoProgress(null);
      const userMsg = friendlyError(err, phase === 'image-upload'
        ? '이미지 업로드에 실패했습니다. 네트워크 연결을 확인하고 잠시 후 다시 시도해주세요.'
        : 'AI 영상 생성 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
      logError(err, {
        component: 'VideoGenProvider',
        action: 'startGeneration',
        extra: { phase, genMode: params.genMode, platform: params.platform },
      });
      setError(userMsg);
    } finally {
      if (nudgeTimer) clearInterval(nudgeTimer);
      clearInterval(simTimer);
      generateLockRef.current = false;
    }
  }, [isGenerating]);

  const clearGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    jobIdRef.current = null;
    setJobId(null);
    setIsGenerating(false);
    setVideoProgress(null);
    setError(null);
    scanIdRef.current = null;
    if (hookTimeoutRef.current) {
      clearTimeout(hookTimeoutRef.current);
      hookTimeoutRef.current = null;
    }
    stepStallRef.current = null;
    ninetyFivePctSinceRef.current = null;
    if (completionFallbackRef.current) {
      clearTimeout(completionFallbackRef.current);
      completionFallbackRef.current = null;
    }
    clearActiveVideoJob();
  }, []);

  const clearResult = useCallback(() => {
    setResultImageUrl(null);
    setResultVideoUrl(null);
  }, []);

  const value: VideoGenContextValue = {
    isGenerating,
    jobId,
    videoProgress,
    resultVideoUrl,
    resultImageUrl,
    error,
    scanId: scanIdRef.current,
    startGeneration,
    clearGeneration,
    clearResult,
    progressMessage: polling.progressMessage,
  };

  return (
    <VideoGenContext.Provider value={value}>
      {children}
    </VideoGenContext.Provider>
  );
}
