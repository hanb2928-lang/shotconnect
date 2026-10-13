import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { onFlushComplete } from '@/lib/foregroundFlushGuard';
import { supabase, ensureFreshSession, withQueryTimeout } from '@/lib/supabase';
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
  backgroundTransition: boolean;
}

export interface StartGenerationParams {
  promptText: string;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  productName: string;
  captionText: string;
  platform: string;
  genMode: string;
  contentTone?: string;
  bgmMood?: string;
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
  retryFromDB: () => Promise<boolean>;
  progressMessage: string;
  clearBackgroundTransition: () => void;
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
  const [backgroundTransition, setBackgroundTransition] = useState(false);

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
  const renderStallSinceRef = useRef<number | null>(null);
  const completionFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateActiveRef = useRef(true);
  const foregroundSyncRef = useRef<Promise<void> | null>(null);
  const serverProgRef = useRef<number | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const terminalLockRef = useRef(false);
  const pendingProgressRef = useRef<VideoGenProgress | null>(null);
  const progressFrameRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdaterRef = useRef<((prev: VideoGenProgress | null) => VideoGenProgress | null) | null>(null);

  const flushQueuedProgress = useCallback(() => {
    progressFrameRef.current = null;
    if (!mountedRef.current) {
      pendingProgressRef.current = null;
      pendingUpdaterRef.current = null;
      return;
    }
    const updater = pendingUpdaterRef.current;
    if (updater) {
      pendingUpdaterRef.current = null;
      setVideoProgress(updater);
    } else {
      const next = pendingProgressRef.current;
      pendingProgressRef.current = null;
      if (next) setVideoProgress(next);
    }
  }, []);

  const scheduleProgressFrame = useCallback(() => {
    if (progressFrameRef.current !== null) return;
    if (typeof requestAnimationFrame === 'function') {
      progressFrameRef.current = requestAnimationFrame(flushQueuedProgress);
    } else {
      progressFrameRef.current = setTimeout(flushQueuedProgress, 16);
    }
  }, [flushQueuedProgress]);

  const queueProgressUpdate = useCallback((progress: VideoGenProgress) => {
    pendingProgressRef.current = progress;
    pendingUpdaterRef.current = null;
    scheduleProgressFrame();
  }, [scheduleProgressFrame]);

  const queueProgressUpdater = useCallback(
    (updater: (prev: VideoGenProgress | null) => VideoGenProgress | null) => {
      const prevUpdater = pendingUpdaterRef.current;
      pendingUpdaterRef.current = prevUpdater
        ? (prev) => updater(prevUpdater(prev))
        : updater;
      pendingProgressRef.current = null;
      scheduleProgressFrame();
    },
    [scheduleProgressFrame],
  );

  // Single guarded entry point for completion transitions. Prevents
  // double-mutate when concurrent async paths (Realtime, polling, foreground
  // sync, completion fallback, step stall guard) race to deliver a terminal
  // result in the same millisecond — and prevents setState on an unmounted
  // component when a callback fires after the provider unmounts.
  const transitionToCompleted = useCallback((videoUrl: string) => {
    if (!mountedRef.current) return;
    if (terminalLockRef.current) return;
    terminalLockRef.current = true;
    generationTokenRef.current++;
    clearActiveVideoJob();
    jobIdRef.current = null;
    setJobId(null);
    setIsGenerating(false);
    serverProgRef.current = 1.0;
    setError(null);
    if (outputModeRef.current === 'image') {
      setResultImageUrl(videoUrl);
    } else {
      setResultVideoUrl(videoUrl);
    }
    setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
    notifyVideoCompleted();
  }, []);

  // Single guarded entry point for error/failure transitions.
  const transitionToError = useCallback((errMsg: string, opts?: { backgroundTransition?: boolean }) => {
    if (!mountedRef.current) return;
    if (terminalLockRef.current) return;
    terminalLockRef.current = true;
    generationTokenRef.current++;
    clearActiveVideoJob();
    jobIdRef.current = null;
    setJobId(null);
    setIsGenerating(false);
    setVideoProgress(null);
    serverProgRef.current = null;
    setError(errMsg);
    if (opts?.backgroundTransition) {
      setBackgroundTransition(true);
    }
  }, []);

  // Keep-awake during generation
  useEffect(() => {
    const tag = 'videogen-global';
    if (isGenerating) {
      activateKeepAwakeAsync(tag).catch(() => {}).finally(() => { /* release ref */ });
    } else {
      deactivateKeepAwake(tag).catch(() => {}).finally(() => { /* release ref */ });
    }
    return () => { deactivateKeepAwake(tag).catch(() => {}).finally(() => { /* release ref */ }); };
  }, [isGenerating]);

  // Track app active/background state so background-sensitive timers
  // (step-stall DB sync, hook timeout) can skip work while backgrounded.
  useEffect(() => {
    const unsub = registerAppStateHandler('immediate', (state) => {
      appStateActiveRef.current = state === 'active';
    });
    return unsub;
  }, []);

  // Abort any in-flight submit when the provider unmounts to prevent
  // orphaned fetch callbacks from updating state on an unmounted component.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
      if (nudgeTimerRef.current) { clearInterval(nudgeTimerRef.current); nudgeTimerRef.current = null; }
      if (hookTimeoutRef.current) { clearTimeout(hookTimeoutRef.current); hookTimeoutRef.current = null; }
      if (completionFallbackRef.current) { clearTimeout(completionFallbackRef.current); completionFallbackRef.current = null; }
      if (stepStallTimerRef.current) { clearInterval(stepStallTimerRef.current); stepStallTimerRef.current = null; }
      if (progressFrameRef.current !== null) {
        if (typeof progressFrameRef.current === 'number' && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(progressFrameRef.current);
        } else {
          clearTimeout(progressFrameRef.current);
        }
        progressFrameRef.current = null;
      }
      pendingProgressRef.current = null;
    };
  }, []);

  // Restore in-progress job from persistent storage on mount.
  // Force-syncs with the server DB AND scans.video_url to detect jobs that
  // already completed while the app was closed. Terminal jobs are cleared
  // from local storage immediately to prevent phantom generating state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await getActiveVideoJob();
      if (cancelled || !active || !active.jobId) return;
      try {
        await ensureFreshSession();
        const isSoft = active.jobId.startsWith('soft-') || active.jobId.startsWith('hd-soft-');

        // Fire both queries in parallel — saves ~200-400ms of sequential DB round-trips.
        const scanPromise = active.scanId
          ? withQueryTimeout(supabase.from('scans').select('video_url, muxed_video_url').eq('id', active.scanId).maybeSingle(), 5000, 'videoGen.restore.scans')
          : Promise.resolve({ data: null } as any);
        let vjQuery = supabase.from('video_jobs').select('status, video_url, error_message');
        const vjPromise = isSoft && active.scanId
          ? withQueryTimeout(vjQuery.eq('scan_id', active.scanId).order('created_at', { ascending: false }).limit(1).maybeSingle(), 5000, 'videoGen.restore.jobs')
          : withQueryTimeout(vjQuery.eq('task_id', active.jobId).maybeSingle(), 5000, 'videoGen.restore.jobs');
        const [scanResult, vjResult] = await Promise.all([scanPromise, vjPromise]);
        if (cancelled) return;

        // Check scans first — the webhook writes here directly and it's the
        // most reliable completion signal.
        const scanFinalUrl = scanResult.data?.video_url || scanResult.data?.muxed_video_url;
        if (scanFinalUrl) {
          if (active.jobId.startsWith('hd-')) {
            outputModeRef.current = 'video';
          }
          transitionToCompleted(scanFinalUrl);
          return;
        }

        // Then check video_jobs for the authoritative status.
        const { data, error: dbError } = vjResult;
        if (dbError) return;
        if (!data) {
          clearActiveVideoJob();
          return;
        }
        const row = data as { status: string; video_url: string | null; error_message: string | null };
        if (row.status === 'SUCCESS') {
          const finalUrl = row.video_url;
          if (finalUrl) {
            transitionToCompleted(finalUrl);
          } else {
            clearActiveVideoJob();
          }
          return;
        }
        if (row.status === 'FAILED') {
          transitionToError(row.error_message ?? '영상 생성에 실패했습니다.');
          return;
        }
        if (active.scanId) scanIdRef.current = active.scanId;
        jobIdRef.current = active.jobId;
        terminalLockRef.current = false;
        renderStallSinceRef.current = null;
        setJobId(active.jobId);
        setIsGenerating(true);
        genStartRef.current = Date.now();
        if (!active.jobId.startsWith('hd-')) {
          outputModeRef.current = 'video';
        }
        const restoreProgress = active.progress > 0 ? Math.min(active.progress, 0.9) : 0.5;
        setVideoProgress({ phase: 'generating', progress: restoreProgress, message: '이전 생성 작업을 복구하는 중...', elapsedSec: 0, serverStep: active.step });
      } catch {
        // DB unreachable — don't resume, local job stays for next restart
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Force-sync job status from DB when app returns to foreground
  useEffect(() => {
    if (!jobId) return;
    const handleAppState = (nextState: string) => {
      if (nextState === 'active') {
        if (foregroundSyncRef.current) return;
        // Defer DB sync until the flush window closes to avoid bridge
        // backpressure from concurrent websocket/polling events.
        onFlushComplete(() => {
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
                const scanFinalUrl = scanData?.video_url || scanData?.muxed_video_url;
                if (scanFinalUrl) {
                  transitionToCompleted(scanFinalUrl);
                  return;
                }
              }
              return;
            }
            const row = data as { status: string; video_url: string | null; error_message: string | null; step: string | null };
            if (row.status === 'SUCCESS') {
              const finalUrl = row.video_url;
              if (finalUrl) {
                transitionToCompleted(finalUrl);
              } else {
                // SUCCESS but video_url is null/empty — the server wrote the
                // status before the URL. Try scans.video_url / muxed_video_url
                // as a fallback before giving up.
                if (scanIdRef.current) {
                  try {
                    const { data: scanData } = await supabase
                      .from('scans')
                      .select('video_url, muxed_video_url')
                      .eq('id', scanIdRef.current)
                      .maybeSingle();
                    const scanFinalUrl = scanData?.video_url || scanData?.muxed_video_url;
                    if (scanFinalUrl) {
                      transitionToCompleted(scanFinalUrl);
                      return;
                    }
                  } catch {
                    // scans lookup failed — polling will catch the URL on next tick
                  }
                }
                // No URL anywhere yet — nudge progress forward but don't
                // freeze at 97%. Use 0.90 so the creep timer can still
                // advance visually, and the bar doesn't look stuck.
                serverProgRef.current = Math.max(serverProgRef.current ?? 0, 0.90);
              }
            } else if (row.status === 'FAILED') {
              transitionToError(row.error_message ?? '영상 생성에 실패했습니다.');
            } else {
              // Still in progress — nudge progress forward to show the UI is alive.
              // Monotonic guard: never let a stale DB read regress progress below
              // what the UI already shows (race condition on background→foreground).
              if (!mountedRef.current) return;
              const stepProg = stepToProgress(row.step);
              if (stepProg !== null && !isNaN(stepProg) && stepProg > 0) {
                serverProgRef.current = Math.max(serverProgRef.current ?? 0, stepProg);
              }
              queueProgressUpdater((prev) => {
                if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
                const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
                const timeProgress = Math.min(0.9, 0.15 + elapsed * 0.006);
                const merged = Math.max(prev.progress, timeProgress, stepProg ?? 0);
                const clampMax = 0.99;
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
        });
      }
    };
    const unsub = registerAppStateHandler('deferred', handleAppState);
    return unsub;
  }, [jobId]);

  // Progress timer — advances progress while generating.
  // Combines: (a) time-based interpolation up to 90%, (b) server-reported
  // progress from polling/Realtime, (c) a 2-second soft-creep guard so the
  // bar never visually stalls even when the server is silent.
  // Pauses during background to avoid wasted renders and progress jumps.
  useEffect(() => {
    if (!isGenerating) return;
    const GEN_TIMEOUT_MS = 600_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const completionRetry = { attempts: 0, max: 10 };

    const startTimers = () => {
      if (timer) return;
      const TICK_MS = 1500;
      let tickCount = 0;
      timer = setInterval(() => {
        tickCount++;
        const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
        const isCreepTick = tickCount % 2 === 0;
        const isHardGuardTick = tickCount % 8 === 0;
        const isCompletionTick = tickCount % 4 === 0;
        queueProgressUpdater((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
          const clampMax = 0.99;
          const serverProg = serverProgRef.current;
          const safeServer = (serverProg !== null && !isNaN(serverProg) && isFinite(serverProg)) ? serverProg : null;
          const timeBasedProgress = Math.min(0.90, 0.15 + elapsed * 0.006);
          let next = Math.max(prev.progress, timeBasedProgress);
          if (safeServer !== null) next = Math.max(next, Math.min(safeServer, clampMax));
          if (isCreepTick) {
            const creepCeiling = 0.92;
            if (next < creepCeiling) {
              const ceiling = safeServer !== null ? Math.max(safeServer + 0.02, creepCeiling) : creepCeiling;
              next = Math.min(next + 0.02, ceiling);
            }
          }
          if (isHardGuardTick) {
            const guardCeiling = 0.90;
            if (next < guardCeiling) {
              const forced = Math.min(next + 0.10, guardCeiling);
              if (safeServer === null || safeServer <= forced) next = forced;
            }
          }
          next = Math.max(0, Math.min(clampMax, next));
          if (isCompletionTick) {
            if (next >= 0.85) {
              if (renderStallSinceRef.current === null) {
                renderStallSinceRef.current = Date.now();
              } else if (Date.now() - renderStallSinceRef.current >= 5_000) {
                if (!completionFallbackRef.current && jobIdRef.current) {
                  completionFallbackRef.current = setTimeout(checkCompletionFallback, 0);
                }
                renderStallSinceRef.current = null;
              }
            } else {
              renderStallSinceRef.current = null;
            }
          }
          return { ...prev, elapsedSec: elapsed, progress: next };
        });
      }, TICK_MS);
      // Completion guard: if progress stays at or above 85% (rendering)
      // for 15 seconds without the server delivering a terminal status, do
      // a DB force-sync. The server goes rendering→completed directly, so
      // 85% means rendering is underway and the result should be in the DB
      // soon. If the DB check finds the job still in progress, retry after
      // a delay instead of bailing out with a timeout error.
      const COMPLETION_FALLBACK_DELAY_MS = 5_000;
      const completionRetryRef = completionRetry;
      const checkCompletionFallback = () => {
        const currentJobId = jobIdRef.current;
        const currentScanId = scanIdRef.current;
        if (!currentJobId) return;
        const token = generationTokenRef.current;
        (async () => {
          try {
            await ensureFreshSession();
            if (generationTokenRef.current !== token) return;
            // First check scans.video_url — the webhook writes here directly
            // and it's the most reliable completion signal.
            if (currentScanId) {
              const { data: scanData } = await supabase
                .from('scans')
                .select('video_url, muxed_video_url')
                .eq('id', currentScanId)
                .maybeSingle();
              if (generationTokenRef.current !== token) return;
              if (scanData) {
                const scanFinalUrl = scanData.video_url || scanData.muxed_video_url;
                if (scanFinalUrl) {
                  transitionToCompleted(scanFinalUrl);
                  return;
                }
              }
            }
            if (generationTokenRef.current !== token) return;
            const isSoft = currentJobId.startsWith('soft-');
            let q = supabase.from('video_jobs').select('status, video_url, error_message');
            const { data, error: dbErr } = isSoft && currentScanId
              ? await q.eq('scan_id', currentScanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
              : await q.eq('task_id', currentJobId).maybeSingle();
            if (generationTokenRef.current !== token) return;
            if (dbErr || !data) {
              throw new Error('DB lookup failed');
            }
            const row = data as { status: string; video_url: string | null; error_message: string | null };
            if (row.status === 'SUCCESS' && row.video_url) {
              transitionToCompleted(row.video_url);
            } else if (row.status === 'SUCCESS' && !row.video_url) {
              // SUCCESS but video_url is null — the server wrote the status
              // before the URL. Don't classify as "in progress" (which would
              // burn retry budget). Instead, keep retrying at the same
              // interval without incrementing the attempt counter, so we
              // don't hit the 10-retry limit while waiting for the URL.
              completionFallbackRef.current = setTimeout(checkCompletionFallback, 3_000);
              return;
            } else if (row.status === 'FAILED') {
              transitionToError(row.error_message ?? '영상 생성에 실패했습니다.');
            } else {
              // Job still in progress — retry after delay instead of bailing
              completionRetryRef.attempts++;
              if (completionRetryRef.attempts < completionRetryRef.max) {
                completionFallbackRef.current = setTimeout(checkCompletionFallback, 5_000);
                return;
              }
              throw new Error('Completion retry limit reached');
            }
          } catch {
            // Increment attempts on ANY error (including DB lookup failures)
            // so the retry loop terminates instead of looping forever.
            completionRetryRef.attempts++;
            if (completionRetryRef.attempts >= completionRetryRef.max) {
              transitionToError('영상 생성 완료 확인에 실패했습니다. 앱을 재실행 후 결과 탭에서 확인해주세요.', { backgroundTransition: true });
            } else {
              completionFallbackRef.current = setTimeout(checkCompletionFallback, 5_000);
            }
          }
        })();
      };

    };

    const stopTimers = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (completionFallbackRef.current) { clearTimeout(completionFallbackRef.current); completionFallbackRef.current = null; }
      if (stepStallTimerRef.current) { clearInterval(stepStallTimerRef.current); stepStallTimerRef.current = null; }
      // Do NOT reset renderStallSinceRef here — backgrounding should
      // pause the countdown, not reset it. Otherwise a brief background
      // transition on native (e.g. notification banner) resets the
      // timer indefinitely and the fallback never fires.
      // Do NOT reset completionRetry.attempts either — resetting on every
      // background→foreground toggle enables unbounded retries by toggling.
    };

    startTimers();

    // Hard timeout guard. Paused while backgrounded so that background
    // duration does not count toward the user's wait — the server keeps
    // rendering regardless, and the user should not be penalized for
    // switching apps.
    let hardTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimeoutBgEnter: number | null = null;

    const armHardTimeout = (delayMs: number) => {
      if (hardTimeoutTimer) clearTimeout(hardTimeoutTimer);
      hardTimeoutTimer = setTimeout(() => {
        if (!mountedRef.current || terminalLockRef.current) return;
        transitionToError('영상 생성 시간이 초과되었습니다. 다시 시도해주세요.', { backgroundTransition: true });
      }, delayMs);
    };

    armHardTimeout(GEN_TIMEOUT_MS);

    // Pause timers when app goes to background to avoid wasted renders and
    // prevent a large progress jump when returning to foreground. Also abort
    // the submit AbortController so no orphaned fetch callbacks fire on a
    // backgrounded native view (OS memory reclaim crash defense).
    const unsubAppState = registerAppStateHandler('immediate', (state) => {
      if (state === 'background') {
        // Full background only — do NOT treat iOS 'inactive' (notification
        // banner, Control Center) as background. Treating 'inactive' as
        // background destroys the Realtime channel and clears timers for a
        // momentary UI interruption, and the 'active' dispatch that follows
        // can be dropped by the suspending gate, leaving everything dead.
        stopTimers();
        // Pause hard timeout — record entry time so we can re-arm with
        // remaining duration on foreground return.
        hardTimeoutBgEnter = Date.now();
        if (hardTimeoutTimer) { clearTimeout(hardTimeoutTimer); hardTimeoutTimer = null; }
        // Abort in-flight submit request — the job continues server-side
        // and will be recovered on foreground return via DB resync.
        if (abortRef.current) {
          abortRef.current.abort();
        }
      } else if (state === 'active') {
        startTimers();
        // Re-arm hard timeout with remaining time after subtracting
        // background duration.
        if (hardTimeoutBgEnter !== null) {
          const bgDuration = Date.now() - hardTimeoutBgEnter;
          hardTimeoutBgEnter = null;
          const elapsed = Date.now() - genStartRef.current - bgDuration;
          const remaining = GEN_TIMEOUT_MS - elapsed;
          if (remaining > 0) {
            armHardTimeout(remaining);
          }
        }
      }
    });

    return () => {
      stopTimers();
      if (hardTimeoutTimer) clearTimeout(hardTimeoutTimer);
      unsubAppState();
    };
  }, [isGenerating]);

  // Polling — runs globally, survives navigation away from synthesis
  const polling = useResultPolling(jobId, {
    scanId: scanIdRef.current,
    onCompleted: (videoUrl) => {
      transitionToCompleted(videoUrl);
    },
    onError: (errMsg) => {
      logError(new Error(errMsg), { component: 'VideoGenProvider', action: 'polling.onError' });
      transitionToError(friendlyError(new Error(errMsg), errMsg));
    },
  });

  // Sync server-reported progress from polling into a ref + state so the
  // progress timer can merge it into videoProgress.progress.
  useEffect(() => {
    const sp = polling.serverProgress;
    serverProgRef.current = sp;
    if (sp !== null && !isNaN(sp) && isFinite(sp) && sp > 0 && isGenerating) {
      const clamped = Math.max(0, Math.min(0.99, sp));
      queueProgressUpdater((prev) => {
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
      updateActiveVideoJobStep(ss, polling.serverProgress ?? undefined).catch(() => {}).finally(() => { /* release ref */ });
      queueProgressUpdater((prev) => {
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
        queueProgressUpdater((prev) => {
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
    const STEP_ORDER = ['analyzing', 'hooking', 'planning', 'submitting', 'rendering', 'muxing'];
    const STEP_STALL_MS = 30_000;
    const STEP_THRESHOLDS: Record<string, number> = {
      analyzing: 0.05,
      hooking: 0.15,
      planning: 0.25,
      submitting: 0.35,
      rendering: 0.85,
      muxing: 0.97,
    };

    stepStallTimerRef.current = setInterval(() => {
      queueProgressUpdater((prev) => {
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
            const stallToken = generationTokenRef.current;
            (async () => {
              try {
                await ensureFreshSession();
                if (generationTokenRef.current !== stallToken) return;
                // First check scans.video_url — the webhook writes here
                // directly and it's the most reliable completion signal.
                if (currentScanId) {
                  const { data: scanData } = await supabase
                    .from('scans')
                    .select('video_url, muxed_video_url')
                    .eq('id', currentScanId)
                    .maybeSingle();
                  if (generationTokenRef.current !== stallToken) return;
                  if (scanData) {
                    const scanFinalUrl = scanData.video_url || scanData.muxed_video_url;
                    if (scanFinalUrl) {
                      transitionToCompleted(scanFinalUrl);
                      return;
                    }
                  }
                }
                if (generationTokenRef.current !== stallToken) return;
                const isSoft = currentJobId.startsWith('soft-');
                let q = supabase.from('video_jobs').select('status, video_url, error_message');
                const { data, error: dbErr } = isSoft && currentScanId
                  ? await q.eq('scan_id', currentScanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
                  : await q.eq('task_id', currentJobId).maybeSingle();
                if (generationTokenRef.current !== stallToken) return;
                if (dbErr || !data) return;
                const row = data as { status: string; video_url: string | null; error_message: string | null };
                if (row.status === 'SUCCESS' && row.video_url) {
                  transitionToCompleted(row.video_url);
                } else if (row.status === 'FAILED') {
                  transitionToError(row.error_message ?? '영상 생성에 실패했습니다.');
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
    terminalLockRef.current = false;
    outputModeRef.current = params.outputMode;
    productNameRef.current = params.productName;
    abortRef.current = new AbortController();

    setError(null);
    setIsGenerating(true);
    setResultImageUrl(null);
    setResultVideoUrl(null);
    genStartRef.current = Date.now();
    prefetchedHookRef.current = null;
    serverProgRef.current = null;
    renderStallSinceRef.current = null;
    stepStallRef.current = null;

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
    simTimerRef.current = simTimer;

    let nudgeTimer: ReturnType<typeof setInterval> | null = null;

    try {
      // Pre-fetch hook analysis AND refresh the session during the scan
      // insert — both overlap with the DB round-trip so neither adds to
      // the critical path. This saves ~100-500ms of session refresh time
      // that was previously sequential with the submit.
      const hookPrefetchPromise = new Promise<void>((resolve) => {
        try {
          prefetchedHookRef.current = autoSelectHook({ productName: params.productName });
        } catch {
          // non-fatal — server will generate its own hook
        }
        resolve();
      });
      const sessionRefreshPromise = ensureFreshSession().catch(() => { /* non-fatal */ });

      setVideoProgress({ phase: 'submitting', progress: 0.10, message: 'AI 렌더링 요청 전송 중...', elapsedSec: 0 });
      clearInterval(simTimer);
      simTimerRef.current = null;

      nudgeTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase !== 'submitting') return prev;
          const next = Math.min(prev.progress + 0.008, 0.15);
          return { ...prev, progress: next, message: 'AI가 훅 문구를 분석하고 렌더링을 준비하는 중...' };
        });
      }, 2000);
      nudgeTimerRef.current = nudgeTimer;

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

      // Ensure the hook prefetch and session refresh completed before proceeding.
      await hookPrefetchPromise;
      await sessionRefreshPromise;

      const submitResult = await submitVideoJobAsync(params.promptText, {
        durationSec: 5,
        aspectRatio: params.aspectRatio,
        productName: params.productName,
        scanId: scanData.id,
        captionText: params.captionText,
        platform: params.platform,
        contentTone: params.contentTone,
        bgmMood: params.bgmMood,
        isCleanVideoMode: params.genMode === 'auto_3d' || params.genMode === 'universal_synthesis',
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
        queueProgressUpdate(p);
      });

      clearInterval(nudgeTimer);
      clearInterval(simTimer);
      nudgeTimer = null;
      nudgeTimerRef.current = null;
      simTimerRef.current = null;
      jobIdRef.current = submitResult.taskId;
      setJobId(submitResult.taskId);
      saveActiveVideoJob(submitResult.taskId, 'submitting', scanIdRef.current).catch(() => {
        // Persistence failed — job is still submitted and polling works
        // via in-memory jobIdRef. Don't throw; the job isn't lost.
      });
      setVideoProgress({ phase: 'generating', progress: 0.15, message: 'AI가 영상을 렌더링하고 있어요...', elapsedSec: 0 });
    } catch (err) {
      if (nudgeTimer) { clearInterval(nudgeTimer); nudgeTimer = null; }
      if (nudgeTimerRef.current) { clearInterval(nudgeTimerRef.current); nudgeTimerRef.current = null; }
      clearInterval(simTimer);
      if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
      // If the submit was aborted (e.g. app backgrounded) but the scan row
      // was already created, DON'T delete it — the server may have already
      // received the submit and created a video_jobs row. Instead, persist
      // a soft-fallback job so the foreground resync can recover it.
      if (scanIdRef.current && !jobIdRef.current) {
        const abortedScanId = scanIdRef.current;
        const isAbort = err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message));
        if (isAbort) {
          const fallbackId = `soft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          jobIdRef.current = fallbackId;
          setJobId(fallbackId);
          setIsGenerating(true);
          try {
            await saveActiveVideoJob(fallbackId, 'submitting', abortedScanId);
          } catch {
            // Persistence failed — in-memory state still works for this session
          }
          setVideoProgress({ phase: 'generating', progress: 0.12, message: '백그라운드 전환으로 일시 중단됨 — 포그라운드 복귀 시 자동 연결됩니다...', elapsedSec: 0 });
          generateLockRef.current = false;
          return;
        }
        // Non-abort error (e.g. scan insert failure, network error before
        // submit) — safe to delete the scan row since the server never
        // received a submit request.
        const orphanedScanId = scanIdRef.current;
        scanIdRef.current = null;
        try { await supabase.from('scans').delete().eq('id', orphanedScanId); } catch {}
      }
      const phase = jobIdRef.current ? 'ai-generation' : 'image-upload';
      const userMsg = friendlyError(err, phase === 'image-upload'
        ? '이미지 업로드에 실패했습니다. 네트워크 연결을 확인하고 잠시 후 다시 시도해주세요.'
        : 'AI 영상 생성 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
      logError(err, {
        component: 'VideoGenProvider',
        action: 'startGeneration',
        extra: { phase, genMode: params.genMode, platform: params.platform },
      });
      transitionToError(userMsg);
    } finally {
      if (nudgeTimer) clearInterval(nudgeTimer);
      if (nudgeTimerRef.current) { clearInterval(nudgeTimerRef.current); nudgeTimerRef.current = null; }
      clearInterval(simTimer);
      if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
      generateLockRef.current = false;
    }
  }, [isGenerating, queueProgressUpdate, queueProgressUpdater]);

  const clearGeneration = useCallback(() => {
    generationTokenRef.current++;
    terminalLockRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
    if (nudgeTimerRef.current) { clearInterval(nudgeTimerRef.current); nudgeTimerRef.current = null; }
    jobIdRef.current = null;
    setJobId(null);
    setIsGenerating(false);
    setVideoProgress(null);
    setError(null);
    scanIdRef.current = null;
    serverProgRef.current = null;
    genStartRef.current = 0;
    if (hookTimeoutRef.current) {
      clearTimeout(hookTimeoutRef.current);
      hookTimeoutRef.current = null;
    }
    stepStallRef.current = null;
    renderStallSinceRef.current = null;
    if (completionFallbackRef.current) {
      clearTimeout(completionFallbackRef.current);
      completionFallbackRef.current = null;
    }
    clearActiveVideoJob();
    setBackgroundTransition(false);
  }, []);

  const clearBackgroundTransition = useCallback(() => {
    setBackgroundTransition(false);
  }, []);

  const clearResult = useCallback(() => {
    setResultImageUrl(null);
    setResultVideoUrl(null);
  }, []);

  const retryFromDB = useCallback(async (): Promise<boolean> => {
    if (generateLockRef.current || isGenerating) return false;
    const active = await getActiveVideoJob();
    if (!active || !active.jobId || !active.scanId) return false;
    try {
      await ensureFreshSession();
      const { data: scanData } = await supabase
        .from('scans')
        .select('video_url, muxed_video_url')
        .eq('id', active.scanId)
        .maybeSingle();
      const scanFinalUrl = scanData?.video_url || scanData?.muxed_video_url;
      if (scanFinalUrl) {
        transitionToCompleted(scanFinalUrl);
        return true;
      }
      const isSoft = active.jobId.startsWith('soft-') || active.jobId.startsWith('hd-soft-');
      let query = supabase.from('video_jobs').select('status, video_url, error_message, step');
      const { data, error: dbError } = isSoft
        ? await query.eq('scan_id', active.scanId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : await query.eq('task_id', active.jobId).maybeSingle();
      if (dbError || !data) return false;
      const row = data as { status: string; video_url: string | null; error_message: string | null; step: string | null };
      if (row.status === 'SUCCESS' && row.video_url) {
        transitionToCompleted(row.video_url);
        return true;
      }
      if (row.status === 'FAILED') {
        clearActiveVideoJob();
        return false;
      }
      scanIdRef.current = active.scanId;
      jobIdRef.current = active.jobId;
      terminalLockRef.current = false;
      renderStallSinceRef.current = null;
      setJobId(active.jobId);
      setIsGenerating(true);
      genStartRef.current = Date.now();
      if (!active.jobId.startsWith('hd-')) {
        outputModeRef.current = 'video';
      }
      setError(null);
      const restoreProgress = active.progress > 0 ? Math.min(active.progress, 0.9) : 0.3;
      setVideoProgress({ phase: 'generating', progress: restoreProgress, message: '서버에서 진행 중인 작업을 연결하는 중...', elapsedSec: 0, serverStep: row.step ?? active.step });
      return true;
    } catch {
      return false;
    }
  }, []);

  const value: VideoGenContextValue = useMemo(() => ({
    isGenerating,
    jobId,
    videoProgress,
    resultVideoUrl,
    resultImageUrl,
    error,
    scanId: scanIdRef.current,
    backgroundTransition,
    startGeneration,
    clearGeneration,
    clearResult,
    retryFromDB,
    progressMessage: polling.progressMessage,
    clearBackgroundTransition,
  }), [
    isGenerating,
    jobId,
    videoProgress,
    resultVideoUrl,
    resultImageUrl,
    error,
    backgroundTransition,
    startGeneration,
    clearGeneration,
    clearResult,
    retryFromDB,
    polling.progressMessage,
    clearBackgroundTransition,
  ]);

  return (
    <VideoGenContext.Provider value={value}>
      {children}
    </VideoGenContext.Provider>
  );
}
