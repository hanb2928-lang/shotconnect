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
import { supabase } from '@/lib/supabase';
import { submitVideoJobAsync, type VideoGenProgress } from '@/lib/aiVideoPipeline';
import { useResultPolling } from '@/hooks/useResultPolling';
import { getActiveVideoJob, clearActiveVideoJob, saveActiveVideoJob } from '@/lib/videoJobPersistence';
import { notifyVideoCompleted } from '@/lib/pushNotify';
import { friendlyError } from '@/lib/errors';
import { logError } from '@/lib/errorLogger';
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
      if (nextState !== 'active') return;
      (async () => {
        try {
          const { data, error: dbError } = await supabase
            .from('video_jobs')
            .select('status, video_url, error_message')
            .eq('id', jobId)
            .maybeSingle();
          if (dbError || !data) return;
          const row = data as { status: string; video_url: string | null; error_message: string | null };
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
            setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
            notifyVideoCompleted();
          } else if (row.status === 'FAILED') {
            clearActiveVideoJob();
            jobIdRef.current = null;
            setJobId(null);
            setIsGenerating(false);
            setVideoProgress(null);
            setError(row.error_message ?? '영상 생성에 실패했습니다.');
          }
        } catch {
          // ignore — polling will catch up
        }
      })();
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [jobId]);

  // Progress timer — advances progress while generating.
  // Combines: (a) time-based interpolation up to 90%, (b) server-reported
  // progress from polling/Realtime, (c) a 2-second soft-creep guard so the
  // bar never visually stalls even when the server is silent.
  const serverProgRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isGenerating) return;
    const GEN_TIMEOUT_MS = 300_000;
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
      setVideoProgress((prev) => {
        if (!prev) return prev;
        const timeBasedProgress = Math.min(0.9, 0.15 + elapsed * 0.006);
        const serverProg = serverProgRef.current;
        const baseProgress = Math.max(prev.progress, timeBasedProgress);
        const nextProgress = serverProg !== null
          ? Math.max(baseProgress, Math.min(serverProg, 0.95))
          : baseProgress;
        return { ...prev, elapsedSec: elapsed, progress: nextProgress };
      });
    }, 1000);
    // Soft-creep guard: every 2 seconds, nudge progress forward by a small
    // amount (up to 90%) so the bar never freezes at a fixed value.
    const creepTimer = setInterval(() => {
      setVideoProgress((prev) => {
        if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
        if (prev.progress >= 0.9) return prev;
        const serverProg = serverProgRef.current;
        const ceiling = serverProg !== null ? Math.max(serverProg + 0.02, 0.9) : 0.9;
        const nudge = prev.progress + 0.008;
        return { ...prev, progress: Math.min(nudge, ceiling) };
      });
    }, 2000);
    const timeout = setTimeout(() => {
      jobIdRef.current = null;
      setJobId(null);
      setIsGenerating(false);
      setVideoProgress(null);
      setError('영상 생성 시간이 초과되었습니다. 서버에서 계속 렌더링 중일 수 있어요. 잠시 후 작업 목록에서 완성된 영상을 확인할 수 있습니다.');
    }, GEN_TIMEOUT_MS);
    return () => {
      clearInterval(timer);
      clearInterval(creepTimer);
      clearTimeout(timeout);
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
      setVideoProgress((prev) => prev ? { ...prev, phase: 'completed', progress: 1.0, message: '영상 생성 완료' } : null);
      serverProgRef.current = 1.0;
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
    serverProgRef.current = polling.serverProgress;
    if (polling.serverProgress !== null && isGenerating) {
      setVideoProgress((prev) => {
        if (!prev || prev.phase === 'completed' || prev.phase === 'error') return prev;
        const serverProg = Math.min(polling.serverProgress!, 0.95);
        if (serverProg <= prev.progress) return prev;
        return { ...prev, progress: serverProg };
      });
    }
  }, [polling.serverProgress, isGenerating]);

  const startGeneration = useCallback(async (params: StartGenerationParams) => {
    if (generateLockRef.current) return;
    if (isGenerating || jobIdRef.current) return;
    generateLockRef.current = true;
    outputModeRef.current = params.outputMode;

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
      }, (p) => {
        setVideoProgress(p);
      });

      clearInterval(nudgeTimer);
      clearInterval(simTimer);
      nudgeTimer = null;
      jobIdRef.current = submitResult.taskId;
      setJobId(submitResult.taskId);
      await saveActiveVideoJob(submitResult.taskId, 'submitting');
      setVideoProgress({ phase: 'generating', progress: 0.12, message: 'AI가 영상을 렌더링하고 있어요...', elapsedSec: 0 });
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
    jobIdRef.current = null;
    setJobId(null);
    setIsGenerating(false);
    setVideoProgress(null);
    setError(null);
    scanIdRef.current = null;
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
