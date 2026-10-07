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
import { getActiveVideoJob, clearActiveVideoJob, saveActiveVideoJob } from '@/lib/videoJobPersistence';
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
        const { data, error: dbError } = await supabase
          .from('video_jobs')
          .select('status')
          .eq('id', active.jobId)
          .maybeSingle();
        if (cancelled) return;
        if (dbError || !data) {
          clearActiveVideoJob();
          return;
        }
        const status = (data as { status: string }).status;
        if (status === 'SUCCESS' || status === 'FAILED') {
          clearActiveVideoJob();
          return;
        }
        jobIdRef.current = active.jobId;
        setJobId(active.jobId);
        setIsGenerating(true);
        setVideoProgress({ phase: 'generating', progress: 0.5, message: '이전 생성 작업을 복구하는 중...', elapsedSec: 0 });
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
        // Foreground return: resync job status from DB. Use task_id (not id)
        // since jobId is the Runway/internal task identifier.
        (async () => {
          try {
            await ensureFreshSession();
            const { data, error: dbError } = await supabase
              .from('video_jobs')
              .select('status, video_url, error_message, step')
              .eq('task_id', jobId)
              .maybeSingle();
            if (dbError || !data) return;
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
              // Still in progress — nudge progress forward to show the UI is alive
              const stepProg = stepToProgress(row.step);
              if (stepProg !== null && !isNaN(stepProg) && stepProg > 0) {
                serverProgRef.current = stepProg;
              }
              setVideoProgress((prev) => {
                if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
                const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
                const timeProgress = Math.min(0.9, 0.15 + elapsed * 0.006);
                const merged = Math.max(prev.progress, timeProgress, stepProg ?? 0);
                return { ...prev, elapsedSec: elapsed, progress: Math.max(0, Math.min(0.95, merged || 0)) };
              });
            }
          } catch {
            // ignore — polling will catch up
          }
        })();
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
    const GEN_TIMEOUT_MS = 300_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    let creepTimer: ReturnType<typeof setInterval> | null = null;
    let hardGuardTimer: ReturnType<typeof setInterval> | null = null;

    const startTimers = () => {
      if (timer || creepTimer) return;
      timer = setInterval(() => {
        const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
        setVideoProgress((prev) => {
          if (!prev) return prev;
          const timeBasedProgress = Math.min(0.9, 0.15 + elapsed * 0.006);
          const serverProg = serverProgRef.current;
          const safeServer = (serverProg !== null && !isNaN(serverProg) && isFinite(serverProg)) ? serverProg : null;
          const baseProgress = Math.max(prev.progress, timeBasedProgress);
          const nextProgress = safeServer !== null
            ? Math.max(baseProgress, Math.min(safeServer, 0.95))
            : baseProgress;
          return { ...prev, elapsedSec: elapsed, progress: Math.max(0, Math.min(0.95, nextProgress)) };
        });
      }, 1000);
      creepTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
          if (prev.progress >= 0.9) return prev;
          const serverProg = serverProgRef.current;
          const ceiling = serverProg !== null ? Math.max(serverProg + 0.02, 0.9) : 0.9;
          const nudge = prev.progress + 0.015;
          return { ...prev, progress: Math.min(nudge, ceiling) };
        });
      }, 2000);
      // Hard progression guard: every 10 seconds, force progress forward by
      // 10% (up to 90%) so the bar can never freeze at a fixed value even
      // when the server is completely silent.
      hardGuardTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
          if (prev.progress >= 0.9) return prev;
          const forced = Math.min(prev.progress + 0.10, 0.9);
          const serverProg = serverProgRef.current;
          if (serverProg !== null && serverProg > forced) return prev;
          return { ...prev, progress: forced };
        });
      }, 10_000);
    };
    const stopTimers = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (creepTimer) { clearInterval(creepTimer); creepTimer = null; }
      if (hardGuardTimer) { clearInterval(hardGuardTimer); hardGuardTimer = null; }
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
      const clamped = Math.max(0, Math.min(0.95, sp));
      setVideoProgress((prev) => {
        if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
        if (isNaN(clamped) || clamped <= prev.progress) return prev;
        const pctLabel = ` (${Math.round(clamped * 100)}%)`;
        return { ...prev, progress: clamped, message: `AI가 영상을 렌더링하고 있어요${pctLabel}...` };
      });
    }
  }, [polling.serverProgress, isGenerating]);

  // Sync server-reported step from polling into videoProgress so the step
  // tracker can bind its icons to authoritative server state instead of
  // the time-based soft-creep percentage.
  useEffect(() => {
    const ss = polling.serverStep;
    if (ss) {
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
    }, 200);

    let nudgeTimer: ReturnType<typeof setInterval> | null = null;

    try {
      setVideoProgress({ phase: 'submitting', progress: 0.10, message: 'AI 렌더링 요청 전송 중...', elapsedSec: 0 });
      clearInterval(simTimer);

      nudgeTimer = setInterval(() => {
        setVideoProgress((prev) => {
          if (!prev || prev.phase !== 'submitting') return prev;
          const next = Math.min(prev.progress + 0.008, 0.15);
          return { ...prev, progress: next, message: 'AI가 훅 문구를 분석하고 렌더링을 준비하는 중...' };
        });
      }, 1500);

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
      await saveActiveVideoJob(submitResult.taskId, 'submitting');
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
