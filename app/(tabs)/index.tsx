import { useRef, useState, useCallback, useEffect, lazy, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  Image,
  Modal,
  ScrollView,
  Animated as RNAnimated,
  Easing,
  AppState,
  AppStateStatus,
  InteractionManager,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { CameraView as CameraViewType } from 'expo-camera';
const CameraView = lazy(() => import('expo-camera').then((m) => ({ default: m.CameraView })));
import { useCameraPermissionsSafe } from '@/hooks/useCameraPermissionsSafe';
import { useNativeBridgeReady } from '@/hooks/useNativeBridgeReady';
let _ImagePicker: typeof import('expo-image-picker') | null = null;
async function getImagePicker() {
  if (!_ImagePicker) _ImagePicker = await import('expo-image-picker');
  return _ImagePicker;
}
import { useSafeTop } from '@/hooks/useSafeTop';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';
import { Camera, RotateCcw, X, Check, Sparkles, Image as ImageIcon, AlertCircle, ArrowRight, Flame, Gem, Orbit, Layers, Diamond, Zap, Video } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '@/lib/theme';
import { startAsyncAnalysis } from '@/lib/asyncAnalysis';
import { saveManualScan, uploadImage } from '@/lib/analysis';
import { supabase } from '@/lib/supabase';
import { isOnline } from '@/hooks/useNetworkStatus';
import { buildDataUrl, cleanBase64, getMimeTypeFromDataUrl } from '@/lib/base64';
import { prepareImageForApi, compressImageToBase64, compressImageToBase64WithUri, compressCaptureUriToBlob, extractVideoFrameBase64, waitForUriFlush, nativeHeapCooldownGuard } from '@/lib/imageEdit';
import type { MoodFilterType } from '@/lib/imageEdit';
import { getDeviceCaptureMaxDim } from '@/lib/captureConstraints';
import { isLowEndDevice } from '@/lib/devicePerformance';
import { friendlyError } from '@/lib/errors';
import { logError } from '@/lib/errorLogger';
import { useBeforeUnloadGuard } from '@/hooks/useBeforeUnloadGuard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getItem, setItem } from '@/lib/storage';
const CreditPurchaseModal = lazy(() =>
  import('@/components/CreditPurchaseModal').then((m) => ({ default: m.CreditPurchaseModal })),
);
import { pickImageWeb, isWebPlatform } from '@/lib/webImagePicker';
import { checkVideoAssetSpecs } from '@/lib/smartResize';
import type { WebCameraHandle } from '@/components/WebCameraView';
const WebCameraView = lazy(() =>
  import('@/components/WebCameraView').then((m) => ({ default: m.WebCameraView })),
);
import type { AngleShot, AngleGuide } from '@/components/MultiAngleCaptureGuide';
const MultiAngleCaptureGuide = lazy(() =>
  import('@/components/MultiAngleCaptureGuide').then((m) => ({ default: m.MultiAngleCaptureGuide })),
);
import { TriggerBanner } from '@/components/TriggerBanner';
import type { StudioSliderValues } from '@/components/StudioPremiumPanel';
const StudioPremiumAccordion = lazy(() =>
  import('@/components/StudioPremiumPanel').then((m) => ({ default: m.StudioPremiumAccordion })),
);
const PostCaptureWorkflow = lazy(() =>
  import('@/components/PostCaptureWorkflow').then((m) => ({ default: m.PostCaptureWorkflow })),
);
import type { ShortFormEditPlan } from '@/lib/shortFormEditEngine';
import type { StereoPipelineProgress } from '@/lib/stereoPipeline';
let _stereoMod: typeof import('@/lib/stereoPipeline') | null = null;
async function getStereoMod() {
  if (!_stereoMod) _stereoMod = await import('@/lib/stereoPipeline');
  return _stereoMod;
}
import { acquirePipelineLock, releasePipelineLock, isPipelineLocked } from '@/lib/pipelineLock';
import { SafeLazyLoad } from '@/components/ErrorBoundary';
import { ProcessingBarrier } from '@/components/ProcessingBarrier';

async function runFittingPipeline(
  shots: AngleShot[],
  scanId: string,
  customPrompt?: string,
  cleanMode = false,
  studioSliders?: StudioSliderValues,
  signal?: AbortSignal,
): Promise<void> {
  const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  if (sorted.length === 0) return;
  const productShot = sorted.find((s) => s.id.startsWith('product')) ?? sorted[0];
  const bgShot = sorted.find((s) => !s.id.startsWith('product')) ?? sorted[sorted.length - 1];
  if (!productShot?.base64 || !productShot?.mimeType || !bgShot?.base64 || !bgShot?.mimeType) return;

  let productBase64 = productShot.base64;
  const productMime = productShot.mimeType || 'image/jpeg';
  let bgBase64 = bgShot.base64;
  const bgMime = bgShot.mimeType || 'image/jpeg';
  for (const s of sorted) { s.base64 = undefined; }

  try {
    if (signal?.aborted) return;

    // Upload images to Storage first, then pass public URLs to the edge
    // function. Sending multi-MB base64 strings through supabase.functions
    // .invoke() buffers the entire JSON payload in native heap, causing
    // OOM kills on Android.
    if (signal?.aborted) return;

    const [productUrl, modelUrl] = await Promise.all([
      uploadImage(productBase64, productMime, signal),
      uploadImage(bgBase64, bgMime, signal),
    ]);
    // Release input base64 strings immediately after upload so GC can
    // reclaim them before the AI response adds another multi-MB base64.
    productBase64 = '';
    bgBase64 = '';
    if (signal?.aborted) return;

    const { data, error } = await supabase.functions.invoke('virtual-fitting', {
      body: {
        productImage: productUrl,
        modelImage: modelUrl,
        customPrompt: customPrompt?.trim() || undefined,
        facetSparkle: studioSliders?.facetSparkle,
        fabricDetail: studioSliders?.fabricDetail,
        blendStrength: studioSliders?.blendStrength,
        smartFit: studioSliders?.smartFit,
      },
      signal,
    });
    if (signal?.aborted) return;
    if (error || !data?.image) {
      console.warn('[runFittingPipeline] virtual-fitting returned no image', error ? String(error) : 'no image field');
      return;
    }

    const imageData = data.image as string;
    const imageUrl = await uploadImage(imageData, 'image/png', signal);
    if (signal?.aborted) return;
    const updatePayload: Record<string, unknown> = { edited_image_url: imageUrl };
    if (cleanMode) {
      updatePayload.template_data = {
        priceLabel: '',
        oneLiner: '',
        category: '',
        accentColor: '#2f9dff',
        hook: '',
        hashtags: [],
        productAdvantages: [],
        caption: '',
        psychologyInsight: null,
        cleanMode: true,
      };
      updatePayload.one_liner = '';
      updatePayload.summary = '';
    }
    await supabase.from('scans').update(updatePayload).eq('id', scanId);
  } catch {
    // Background pipeline — errors are silently ignored; user already has the scan
  } finally {
    nativeHeapCooldownGuard().catch(() => {});
  }
}

const CAPTURE_TIMEOUT_MS = 15000;
const PICK_TIMEOUT_MS = 20000;
const ANALYSIS_TIMEOUT_MS = 45000;
const VIDEO_FRAME_TIMEOUT_MS = 120000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string, controller?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error(`${label} (시간 초과)`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type ScreenPhase = 'mode_select' | 'camera' | 'fitting_capture';
type CaptureMode = 'single' | 'fitting';
type ContentTone = 'studio' | 'raw';

const FITTING_GUIDES: AngleGuide[] = [
  { id: 'product_front', label: '제품 정면', hint: '합성할 제품의 정면 사진을 촬영하거나 선택하세요', emoji: '📸' },
  { id: 'product_side', label: '제품 측면/디테일', hint: '제품의 측면이나 디테일이 잘 보이는 사진을 추가하세요', emoji: '🔍' },
  { id: 'bg_model', label: '배경/모델', hint: '제품을 배치할 공간 또는 착용할 모델의 사진을 촬영하세요', emoji: '🎯' },
  { id: 'bg_alt', label: '추가 배경각도', hint: '배경의 다른 각도나 조명이 다른 사진을 추가하면 더 자연스럽습니다', emoji: '💡' },
  { id: 'detail', label: '추가 디테일', hint: '제품의 클로즈업이나 텍스처 사진으로 합성 품질을 높이세요', emoji: '✨' },
];

type PanelMode = 'auto-3d' | 'ai-blend' | null;

export default function CameraScreen() {
  return (
    <SafeLazyLoad>
      <CameraScreenInner />
    </SafeLazyLoad>
  );
}

function CameraScreenInner() {
  const router = useRouter();
  const safeTop = useSafeTop();
  const tabBarHeight = useTabBarHeight();
  const safeInsets = useSafeAreaInsets();
  const bottomInset = Math.max(safeInsets.bottom, 0);
  const isMountedRef = useRef(true);
  const cameraRef = useRef<CameraViewType>(null);
  const webCameraRef = useRef<WebCameraHandle>(null);
  const autoSaveStepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSavePulse = useRef(new RNAnimated.Value(1)).current;
  const [permission, requestPermission] = useCameraPermissionsSafe();
  const bridgeReady = useNativeBridgeReady();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const cameraReadyRef = useRef(false);
  const permissionGrantedRef = useRef(false);

  useEffect(() => {
    permissionGrantedRef.current = permission?.granted === true;
  }, [permission]);
  const updateCameraReady = useCallback((ready: boolean) => {
    cameraReadyRef.current = ready;
    setCameraReady(ready);
  }, []);
  const handleNativeCameraReady = useCallback(() => {
    updateCameraReady(true);
  }, [updateCameraReady]);
  const [isActive, setIsActive] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditModalVisible, setCreditModalVisible] = useState(false);
  const [multiAngleVisible, setMultiAngleVisible] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaveToast, setAutoSaveToast] = useState<string | null>(null);
  const [autoSaveStep, setAutoSaveStep] = useState(1);
  const bufferReleasedRef = useRef(true);
  const bufferReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRemountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genIdRef = useRef(0);
  const autoSavingRef = useRef(false);
  const stereoOverlayRef = useRef(false);
  const processingRef = useRef(false);
  const captureActiveRef = useRef(false);
  const captureBtnLockRef = useRef(false);
  const stereoAbortRef = useRef<AbortController | null>(null);
  const autoAnalysisAbortRef = useRef<AbortController | null>(null);
  const [postCaptureVisible, setPostCaptureVisible] = useState(false);
  const [postCaptureVideoUri, setPostCaptureVideoUri] = useState<string | null>(null);
  const [postCaptureBase64, setPostCaptureBase64] = useState<string | null>(null);
  const [postCaptureMime, setPostCaptureMime] = useState<string>('video/webm');
  const [workflowMountKey, setWorkflowMountKey] = useState(0);
  const [stereoProgress, setStereoProgress] = useState<StereoPipelineProgress>({ overallProgress: 0, currentStep: -1, steps: [], result: null, error: null });
  const [stereoOverlayVisible, setStereoOverlayVisible] = useState(false);

  useBeforeUnloadGuard(processing || autoSaving || stereoOverlayVisible);

  useEffect(() => {
    const tag = 'camera-processing';
    if (processing || autoSaving || stereoOverlayVisible) {
      activateKeepAwakeAsync(tag).catch(() => {});
    } else {
      deactivateKeepAwake(tag).catch(() => {});
    }
    return () => { deactivateKeepAwake(tag).catch(() => {}); };
  }, [processing, autoSaving, stereoOverlayVisible]);
  const [screenPhase, setScreenPhase] = useState<ScreenPhase>('mode_select');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('single');
  const [contentTone, setContentTone] = useState<ContentTone>('raw');
  const [cleanMode, setCleanMode] = useState(false);
  const [studioMode, setStudioMode] = useState<PanelMode>(null);
  const [studioSliders, setStudioSliders] = useState<StudioSliderValues>({ facetSparkle: 60, fabricDetail: 45, blendStrength: 70, smartFit: true });

  // Virtual fitting state
  const [fittingGuideVisible, setFittingGuideVisible] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(() => Date.now());

  const postCaptureBase64Ref = useRef<string | null>(null);
  const postCaptureMimeRef = useRef<string>('video/webm');
  const postCaptureVideoUriRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getItem('content_tone').then((saved) => {
      if (!mounted) return;
      if (saved === 'studio' || saved === 'raw') setContentTone(saved as ContentTone);
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleContentToneChange = useCallback((tone: ContentTone) => {
    setContentTone(tone);
    setItem('content_tone', tone);
    if (tone !== 'studio') setStudioMode(null);
  }, []);

  const pulseAnimationRef = useRef<ReturnType<typeof RNAnimated.loop> | null>(null);
  const startAutoSaveAnimation = useCallback(() => {
    setAutoSaveStep(1);
    if (pulseAnimationRef.current && typeof pulseAnimationRef.current.stop === 'function') {
      pulseAnimationRef.current.stop();
    }
    if (typeof RNAnimated?.loop !== 'function' || typeof RNAnimated?.timing !== 'function') return;
    try {
      pulseAnimationRef.current = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(autoSavePulse, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          RNAnimated.timing(autoSavePulse, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ]),
      );
      if (pulseAnimationRef.current && typeof pulseAnimationRef.current.start === 'function') {
        pulseAnimationRef.current.start();
      }
    } catch {
      pulseAnimationRef.current = null;
    }
    if (autoSaveStepTimer.current) clearInterval(autoSaveStepTimer.current);
    autoSaveStepTimer.current = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(autoSaveStepTimer.current!);
        autoSaveStepTimer.current = null;
        return;
      }
      setAutoSaveStep((s) => (s >= 3 ? 3 : s + 1));
    }, 800);
  }, [autoSavePulse]);
  const stopAutoSaveAnimation = useCallback(() => {
    if (autoSaveStepTimer.current) {
      clearInterval(autoSaveStepTimer.current);
      autoSaveStepTimer.current = null;
    }
    if (pulseAnimationRef.current && typeof pulseAnimationRef.current.stop === 'function') {
      try {
        pulseAnimationRef.current.stop();
      } catch {
        // animation may already be stopped or invalid
      }
      pulseAnimationRef.current = null;
    }
    if (autoSavePulse && typeof autoSavePulse.setValue === 'function') {
      try {
        autoSavePulse.setValue(1);
      } catch {
        // animation value may not be ready on web/Hermes
      }
    }
  }, [autoSavePulse]);

  // Camera HAL FD leak defense: when the app goes to background or loses tab
  // focus, expo-camera may not release the Android Camera HAL file descriptor
  // promptly. Repeated background→foreground cycles accumulate leaked FDs until
  // the OS media.camera daemon permanently blocks camera access for the app.
  // The fix is a forced remount cycle: unmount the CameraView, wait 300ms for
  // the HAL to release the FD, then remount with a fresh key so React creates
  // a completely new native camera session instead of reusing the leaked one.
  const CAM_HAL_FD_RELEASE_MS = 300;

  const deactivateCamera = useCallback(() => {
    if (cameraRemountTimerRef.current) {
      clearTimeout(cameraRemountTimerRef.current);
      cameraRemountTimerRef.current = null;
    }
    try {
      if (cameraRef.current) {
        const p = cameraRef.current.pausePreview?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      // session may already be dead
    }
    setCameraReady(false);
    cameraReadyRef.current = false;
    setIsActive(false);
  }, []);

  const scheduleCameraReactivation = useCallback(() => {
    if (cameraRemountTimerRef.current) {
      clearTimeout(cameraRemountTimerRef.current);
    }
    // Immediately unmount to begin HAL FD release, then remount after cooldown
    setIsActive(false);
    setCameraReady(false);
    cameraReadyRef.current = false;
    cameraRemountTimerRef.current = setTimeout(() => {
      cameraRemountTimerRef.current = null;
      if (!isMountedRef.current) return;
      // Rotate key to force a completely new native CameraView instance
      setCameraSessionKey(Date.now());
      setIsActive(true);
    }, CAM_HAL_FD_RELEASE_MS);
  }, []);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      // Delayed camera reactivation with key rotation to prevent Camera HAL
      // FD leak from rapid tab switching.
      if (Platform.OS !== 'web') {
        scheduleCameraReactivation();
      } else {
        setIsActive(true);
      }
      return () => {
        isMountedRef.current = false;
        if (Platform.OS !== 'web') {
          deactivateCamera();
        } else {
          setIsActive(false);
        }
        setProcessing(false);
        setAutoSaving(false);
        autoSavingRef.current = false;
        setStereoOverlayVisible(false);
        stereoOverlayRef.current = false;
        setPostCaptureVisible(false);
        setPostCaptureVideoUri(null);
        postCaptureVideoUriRef.current = null;
        setPostCaptureBase64(null);
        postCaptureBase64Ref.current = null;
        captureActiveRef.current = false;
        captureBtnLockRef.current = false;
        genIdRef.current += 1;
        if (stereoAbortRef.current) { stereoAbortRef.current.abort(); stereoAbortRef.current = null; }
        if (autoAnalysisAbortRef.current) { autoAnalysisAbortRef.current.abort(); autoAnalysisAbortRef.current = null; }
        releasePipelineLock();
        if (typeof stopAutoSaveAnimation === 'function') {
          stopAutoSaveAnimation();
        }
      };
    }, [stopAutoSaveAnimation, autoSavePulse, scheduleCameraReactivation, deactivateCamera]),
  );

  useEffect(() => {
    if (Platform.OS === 'web') return () => {};
    const handleChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        if (isMountedRef.current) {
          // Forced remount cycle prevents Camera HAL FD leak on background→foreground
          scheduleCameraReactivation();
        }
      } else {
        deactivateCamera();
        if (bufferReleaseTimerRef.current) {
          clearTimeout(bufferReleaseTimerRef.current);
          bufferReleaseTimerRef.current = null;
        }
        bufferReleasedRef.current = true;
      }
    };
    const sub = AppState.addEventListener('change', handleChange);
    return () => {
      sub.remove();
      if (cameraRemountTimerRef.current) {
        clearTimeout(cameraRemountTimerRef.current);
        cameraRemountTimerRef.current = null;
      }
    };
  }, [scheduleCameraReactivation, deactivateCamera]);

  const runAutoAnalysis = useCallback(async (base64: string, mimeType: string, additionalB64s: string[] = []) => {
    if (autoSavingRef.current || isPipelineLocked() || captureActiveRef.current) return;
    if (!isOnline()) {
      setError('네트워크 연결을 확인해주세요. 인터넷이 연결되지 않아 AI 분석을 시작할 수 없습니다.');
      return;
    }
    autoSavingRef.current = true;
    if (!acquirePipelineLock()) { autoSavingRef.current = false; return; }
    const controller = new AbortController();
    autoAnalysisAbortRef.current = controller;
    const genId = genIdRef.current;
    setAutoSaving(true);
    setAutoSaveToast(null);
    setError(null);
    startAutoSaveAnimation();
    try {
      // Native heap cooldown before entering AI analysis: photo capture leaves
      // large bitmap buffers on the C++ native heap that ART GC hasn't reclaimed.
      // Without this guard, the analysis payload allocation triggers a native heap
      // double-burst → LMK SIGKILL on low-end Android devices.
      await nativeHeapCooldownGuard();
      if (genIdRef.current !== genId || !isMountedRef.current) return;
      const { scanId } = await withTimeout(
        startAsyncAnalysis(base64, mimeType, additionalB64s.length > 0 ? 'multi' : 'single', additionalB64s, contentTone, controller.signal),
        ANALYSIS_TIMEOUT_MS,
        'AI 자동 분석',
        controller,
      );
      if (genIdRef.current !== genId || !isMountedRef.current) return;
      setAutoSaveToast('숏폼 영상이 보관함에 자동 저장되었습니다!');
      setTimeout(() => { if (isMountedRef.current) setAutoSaveToast(null); }, 3500);
      router.push({ pathname: '/result/[id]', params: { id: scanId } });
    } catch (err) {
      if (!isMountedRef.current || genIdRef.current !== genId) return;
      const isTimeout = err instanceof Error && (err.message.includes('시간 초과') || err.message.includes('timeout'));
      if (isTimeout) {
        try {
          await setItem('pending_retry_image', base64);
          await setItem('pending_retry_mime', mimeType);
        } catch { /* ignore */ }
        setError('네트워크 연결이 원활하지 않습니다. 사진을 임시 저장했습니다. 연결이 복구되면 다시 시도해 주세요.');
      } else {
        setError(friendlyError(err, 'AI 자동 분석 중 오류가 발생했습니다. 다시 시도해주세요.'));
      }
    } finally {
      if (autoAnalysisAbortRef.current === controller) autoAnalysisAbortRef.current = null;
      autoSavingRef.current = false;
      releasePipelineLock();
      if (genIdRef.current === genId && isMountedRef.current) {
        stopAutoSaveAnimation();
        setAutoSaving(false);
      }
    }
  }, [router, startAutoSaveAnimation, stopAutoSaveAnimation]);

  const handlePostCaptureProceed = useCallback(async (customPrompt: string, _platform: string, _editPlan: ShortFormEditPlan) => {
    if (autoSavingRef.current || stereoOverlayRef.current || isPipelineLocked() || captureActiveRef.current) return;
    setPostCaptureVisible(false);

    const base64 = postCaptureBase64Ref.current;
    const mimeType = postCaptureMimeRef.current;
    const videoUri = postCaptureVideoUriRef.current;

    autoSavingRef.current = true;
    if (!acquirePipelineLock('postCapture')) { autoSavingRef.current = false; return; }
    const controller = new AbortController();
    autoAnalysisAbortRef.current = controller;
    try {
      // Native heap cooldown before heavy upload/frame extraction: prevents
      // native heap double-burst → LMK SIGKILL after photo capture.
      await nativeHeapCooldownGuard();
      if (!isMountedRef.current || controller.signal.aborted) return;
      if (!base64) {
        if (!videoUri) return;
        const frame = await withTimeout(
          extractVideoFrameBase64(videoUri, 1080, 0.7),
          VIDEO_FRAME_TIMEOUT_MS,
          '동영상 프레임 추출',
        );
        if (!isMountedRef.current || controller.signal.aborted) return;
        const imageUrl = await uploadImage(frame.base64, frame.mimeType, controller.signal);
        if (!isMountedRef.current || controller.signal.aborted) return;
        const scanId = await saveManualScan(imageUrl);
        if (!isMountedRef.current || controller.signal.aborted) return;
        router.push({ pathname: '/editor', params: { id: scanId, customPrompt: customPrompt || undefined } });
        return;
      }
      const imageUrl = await uploadImage(base64, mimeType, controller.signal);
      if (!isMountedRef.current || controller.signal.aborted) return;
      const scanId = await saveManualScan(imageUrl);
      if (!isMountedRef.current || controller.signal.aborted) return;
      router.push({ pathname: '/editor', params: { id: scanId, customPrompt: customPrompt || undefined } });
    } catch (err) {
      if (!isMountedRef.current || controller.signal.aborted) return;
      setError(friendlyError(err, '편집 화면을 여는 중 오류가 발생했습니다. 다시 시도해주세요.'));
    } finally {
      if (autoAnalysisAbortRef.current === controller) autoAnalysisAbortRef.current = null;
      autoSavingRef.current = false;
      releasePipelineLock('postCapture');
      nativeHeapCooldownGuard().catch(() => {});
    }
  }, [router]);

  const handlePostCaptureClose = useCallback(() => {
    setPostCaptureVisible(false);
    setPostCaptureVideoUri(null);
    postCaptureVideoUriRef.current = null;
    setPostCaptureBase64(null);
    postCaptureBase64Ref.current = null;
  }, []);

  const prepareCameraForProcessing = useCallback(async () => {
    if (Platform.OS === 'web') return;
    updateCameraReady(false);
    try {
      await cameraRef.current?.pausePreview?.();
    } catch {
      // camera session may already be closing
    }
    setIsActive(false);
    await nativeHeapCooldownGuard();
  }, [updateCameraReady]);

  const handlePickVideo = useCallback(async () => {
    if (processingRef.current || processing || autoSaving || autoSavingRef.current || stereoOverlayRef.current || isPipelineLocked()) return;
    processingRef.current = true;
    setProcessing(true);
    setError(null);
    try {
      const ImagePicker = await getImagePicker();
      const result = await withTimeout(
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Videos,
          allowsEditing: false,
          videoMaxDuration: 30,
          quality: 1,
        }),
        PICK_TIMEOUT_MS,
        '동영상 선택',
      );
      if (!isMountedRef.current || result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const specCheck = checkVideoAssetSpecs({
        duration: asset.duration ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        fileSize: asset.fileSize ?? null,
      });
      if (specCheck.action === 'reject') {
        if (isMountedRef.current) setError(specCheck.message);
        return;
      }
      if (specCheck.action === 'warn') {
        const shouldProceed = await new Promise<boolean>((resolve) => {
          if (Platform.OS === 'web') {
            resolve(window.confirm(specCheck.message));
          } else {
            Alert.alert('권장 사양 초과', specCheck.message, [
              { text: '취소', style: 'cancel', onPress: () => resolve(false) },
              { text: '그래도 진행', style: 'destructive', onPress: () => resolve(true) },
            ]);
          }
        });
        if (!shouldProceed) return;
      }
      const mimeType = asset.mimeType?.startsWith('video/') ? asset.mimeType : 'video/mp4';
      setPostCaptureBase64(null);
      postCaptureBase64Ref.current = null;
      setPostCaptureMime(mimeType);
      postCaptureMimeRef.current = mimeType;
      setPostCaptureVideoUri(asset.uri);
      postCaptureVideoUriRef.current = asset.uri;
      setWorkflowMountKey((key) => key + 1);
      setPostCaptureVisible(true);
    } catch (err) {
      if (isMountedRef.current) setError(friendlyError(err, '동영상 선택에 실패했습니다. 다시 시도해주세요.'));
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [processing, autoSaving]);

  const handlePickImage = async () => {
    if (processingRef.current || processing || autoSaving || autoSavingRef.current || stereoOverlayRef.current || isPipelineLocked()) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      if (isWebPlatform()) {
        try {
          const images = await withTimeout(pickImageWeb(false, 1), PICK_TIMEOUT_MS, '사진 선택');
          if (images.length === 0) return;
          if (!isMountedRef.current) return;
          const compressed = await withTimeout(
            new Promise<string>((resolve, reject) => {
              InteractionManager.runAfterInteractions(async () => {
                try {
                  const r = await prepareImageForApi(buildDataUrl(cleanBase64(images[0].base64), images[0].mimeType), getDeviceCaptureMaxDim(), isLowEndDevice() ? 0.6 : 0.7, 'none' as MoodFilterType);
                  resolve(r);
                } catch (err) { reject(err); }
              });
            }),
            PICK_TIMEOUT_MS,
            '이미지 압축',
          );
          if (!isMountedRef.current) return;
          setPostCaptureBase64(cleanBase64(compressed));
          postCaptureBase64Ref.current = cleanBase64(compressed);
          setPostCaptureMime(getMimeTypeFromDataUrl(compressed));
          postCaptureMimeRef.current = getMimeTypeFromDataUrl(compressed);
          setPostCaptureVideoUri(null);
          postCaptureVideoUriRef.current = null;
          setWorkflowMountKey((k) => k + 1); setPostCaptureVisible(true);
        } catch (err) {
          if (!isMountedRef.current) return;
          setError(friendlyError(err, '사진 선택에 실패했습니다. 다시 시도해주세요.'));
        }
        return;
      }

      const ImagePicker = await getImagePicker();
      const result = await withTimeout(
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          base64: false,
          quality: 0.7,
        }),
        PICK_TIMEOUT_MS,
        '사진 선택',
      );
      if (!isMountedRef.current) return;
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      if (!asset.uri) return;
      const { base64, mimeType } = await withTimeout(
        new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
          InteractionManager.runAfterInteractions(async () => {
            try {
              const r = await compressImageToBase64(asset.uri, getDeviceCaptureMaxDim(), isLowEndDevice() ? 0.6 : 0.7);
              resolve(r);
            } catch (err) { reject(err); }
          });
        }),
        PICK_TIMEOUT_MS,
        '이미지 압축',
      );
      if (!isMountedRef.current) return;
      setPostCaptureBase64(base64);
      postCaptureBase64Ref.current = base64;
      setPostCaptureMime(mimeType);
      postCaptureMimeRef.current = mimeType;
      setPostCaptureVideoUri(null);
      postCaptureVideoUriRef.current = null;
      setWorkflowMountKey((k) => k + 1); setPostCaptureVisible(true);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(friendlyError(err, '사진 선택에 실패했습니다. 다시 시도해주세요.'));
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const handleMultiAngleComplete = async (shots: AngleShot[]) => {
    if (stereoOverlayRef.current || autoSavingRef.current || isPipelineLocked() || captureActiveRef.current) return;
    stereoOverlayRef.current = true;
    const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
    const validShots = sorted.filter((s) => s.base64);
    setMultiAngleVisible(false);
    captureActiveRef.current = false;
    captureBtnLockRef.current = false;
    if (validShots.length === 0) {
      stereoOverlayRef.current = false;
      return;
    }

    stereoOverlayRef.current = true;
    if (!acquirePipelineLock('stereo')) {
      stereoOverlayRef.current = false;
      return;
    }
    await prepareCameraForProcessing();
    const controller = new AbortController();
    stereoAbortRef.current = controller;
    let stereoMod;
    try {
      stereoMod = await getStereoMod();
    } catch (err) {
      if (!isMountedRef.current) return;
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
      releasePipelineLock();
      setError(friendlyError(err, '모듈을 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.'));
      return;
    }
    setStereoProgress(stereoMod.makeInitialProgress());
    setStereoOverlayVisible(true);

    let scanId: string;
    let uploadedUrls: string[];
    try {
      const result = await stereoMod.createScanFromAngleShots(sorted, controller.signal);
      scanId = result.scanId;
      uploadedUrls = result.uploadedUrls;
    } catch (err) {
      if (!isMountedRef.current) return;
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
      releasePipelineLock();
      setError(friendlyError(err, '이미지 업로드에 실패했습니다. 다시 시도해주세요.'));
      return;
    }

    if (isMountedRef.current) {
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      router.replace({ pathname: '/result/[id]', params: { id: scanId } });
    }

    const pipelineShots = [...sorted];
    nativeHeapCooldownGuard().finally(() => {
      if (controller.signal.aborted) { releasePipelineLock(); return; }
      stereoMod.runStereoPipeline(pipelineShots, () => {}, cleanMode, scanId, contentTone, studioSliders, uploadedUrls, controller.signal).catch(() => {}).finally(() => {
        if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
        releasePipelineLock();
      });
    });
    sorted.length = 0;
    validShots.length = 0;
    shots.length = 0;
  };

  const multiAngleCaptureInProgressRef = useRef(false);
  const handleMultiAngleCapture = async (_angleId: string): Promise<{ base64: string; mimeType: string; uri?: string } | null> => {
    if (multiAngleCaptureInProgressRef.current) return null;
    multiAngleCaptureInProgressRef.current = true;
    if (isWebPlatform()) {
      const webCam = webCameraRef.current;
      if (webCam?.isReady()) {
        try {
          const result = await withTimeout(
            webCam.captureFrame(),
            CAPTURE_TIMEOUT_MS,
            '카메라 캡처',
          );
          if (!isMountedRef.current) { multiAngleCaptureInProgressRef.current = false; return null; }
          if (result?.base64) { multiAngleCaptureInProgressRef.current = false; return result; }
        } catch {
          // Fall through to file picker
        }
      }
      try {
        const images = await withTimeout(pickImageWeb(false, 1, true), PICK_TIMEOUT_MS, '카메라 캡처');
        if (images.length === 0) { multiAngleCaptureInProgressRef.current = false; return null; }
        multiAngleCaptureInProgressRef.current = false;
        return { base64: images[0].base64, mimeType: images[0].mimeType };
      } catch {
        multiAngleCaptureInProgressRef.current = false;
        return null;
      }
    }
    const cam = cameraRef.current;
    if (!cam || !cameraReadyRef.current || !permissionGrantedRef.current || !bridgeReady || !isMountedRef.current || isPipelineLocked()) { multiAngleCaptureInProgressRef.current = false; return null; }
    if (bufferReleaseTimerRef.current) clearTimeout(bufferReleaseTimerRef.current);
    bufferReleasedRef.current = false;
    try {
      const attemptCapture = async () => {
        await new Promise((r) => setTimeout(r, 150));
        // Force-sync the camera sensor stream before capture to clear any
        // stale hardware lock from a prior interrupted capture cycle.
        try { await cam.resumePreview(); } catch { /* non-fatal */ }
        return await withTimeout(
          cam.takePictureAsync({
            quality: isLowEndDevice() ? 0.5 : 0.7,
            shutterSound: false,
            ...({ mute: true } as Record<string, unknown>),
          }) as Promise<{ base64?: string; uri: string }>,
          CAPTURE_TIMEOUT_MS,
          '다각도 촬영',
        );
      };
      let photo: { base64?: string; uri: string } | null = null;
      try {
        photo = await attemptCapture();
      } catch {
        if (!isMountedRef.current || !cameraRef.current) {
          console.warn('Camera session destroyed before capture completed.');
          multiAngleCaptureInProgressRef.current = false;
          return null;
        }
        await new Promise((r) => setTimeout(r, 400));
        if (!isMountedRef.current || !cameraRef.current) {
          console.warn('Camera session destroyed before capture completed.');
          multiAngleCaptureInProgressRef.current = false;
          return null;
        }
        photo = await attemptCapture();
      }
      if (!isMountedRef.current || !cameraRef.current) {
        console.warn('Camera session destroyed before capture completed.');
        if (photo?.uri) {
          import('expo-file-system/legacy').then((fs) => fs.deleteAsync(photo!.uri, { idempotent: true })).catch(() => {});
        }
        multiAngleCaptureInProgressRef.current = false;
        return null;
      }
      if (!photo?.uri) {
        if (photo?.base64) {
          const cleanB64 = cleanBase64(photo.base64);
          photo = null;
          multiAngleCaptureInProgressRef.current = false;
          return { base64: cleanB64, mimeType: 'image/jpeg' };
        }
        multiAngleCaptureInProgressRef.current = false;
        return null;
      }
      if (!isMountedRef.current) {
        import('expo-file-system/legacy').then((fs) => fs.deleteAsync(photo!.uri, { idempotent: true })).catch(() => {});
        multiAngleCaptureInProgressRef.current = false;
        return null;
      }
      const capturedUri = photo.uri;
      photo = null;
      const flushed = await waitForUriFlush(capturedUri);
      if (!flushed || !isMountedRef.current) {
        import('expo-file-system/legacy').then((fs) => fs.deleteAsync(capturedUri, { idempotent: true })).catch(() => {});
        multiAngleCaptureInProgressRef.current = false;
        return null;
      }
      // Defer heavy FileSystem I/O + base64 decode until after the camera
      // surface flushes its next frame, preventing black-frame captures on
      // high-refresh-rate displays where the surface texture drops while
      // the JS thread is blocked by large buffer processing.
      const { base64, mimeType, compressedUri } = await withTimeout(
        new Promise<{ base64: string; mimeType: string; compressedUri: string | null }>((resolve, reject) => {
          InteractionManager.runAfterInteractions(async () => {
            let lastErr: unknown;
            for (let attempt = 0; attempt < 2; attempt++) {
              if (!isMountedRef.current) { reject(new Error('unmounted')); return; }
              try {
                const r = await compressImageToBase64WithUri(capturedUri, getDeviceCaptureMaxDim(), isLowEndDevice() ? 0.6 : 0.7);
                resolve(r);
                return;
              } catch (err) {
                lastErr = err;
                if (attempt === 0) { await new Promise((rr) => setTimeout(rr, 300)); }
              }
            }
            reject(lastErr ?? new Error('이미지 압축 실패'));
          });
        }),
        PICK_TIMEOUT_MS,
        '이미지 압축',
      );
      if (!isMountedRef.current) { multiAngleCaptureInProgressRef.current = false; return null; }
      multiAngleCaptureInProgressRef.current = false;
      return { base64, mimeType, ...(compressedUri ? { uri: compressedUri } : {}) };
    } catch (err) {
      logError(err, { component: 'CameraScreen', action: 'handleMultiAngleCapture' });
      multiAngleCaptureInProgressRef.current = false;
      return null;
    } finally {
      if (bufferReleaseTimerRef.current) clearTimeout(bufferReleaseTimerRef.current);
      bufferReleaseTimerRef.current = setTimeout(() => {
        bufferReleasedRef.current = true;
        bufferReleaseTimerRef.current = null;
      }, 300);
    }
  };

  const handleMultiAnglePick = async (_angleId: string): Promise<{ base64: string; mimeType: string; uri?: string } | null> => {
    if (isWebPlatform()) {
      try {
        const images = await withTimeout(pickImageWeb(false, 1), PICK_TIMEOUT_MS, '사진 선택');
        if (images.length === 0) return null;
        return { base64: images[0].base64, mimeType: images[0].mimeType };
      } catch {
        return null;
      }
    }
    try {
      const ImagePicker = await getImagePicker();
      const result = await withTimeout(
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          base64: false,
          quality: 0.7,
        }),
        PICK_TIMEOUT_MS,
        '사진 선택',
      );
      if (!isMountedRef.current) return null;
      if (result.canceled || !result.assets?.[0]?.uri) return null;
      const assetUri = result.assets[0].uri;
      const { base64, mimeType, compressedUri } = await withTimeout(
        new Promise<{ base64: string; mimeType: string; compressedUri: string | null }>((resolve, reject) => {
          InteractionManager.runAfterInteractions(async () => {
            try {
              const r = await compressImageToBase64WithUri(assetUri, getDeviceCaptureMaxDim(), isLowEndDevice() ? 0.6 : 0.7);
              resolve(r);
            } catch (err) { reject(err); }
          });
        }),
        PICK_TIMEOUT_MS,
        '이미지 압축',
      );
      if (!isMountedRef.current) return null;
      return { base64, mimeType, ...(compressedUri ? { uri: compressedUri } : {}) };
    } catch {
      return null;
    }
  };

  const handleWebCapture = useCallback(async (payload: string, mimeType: string) => {
    if (processingRef.current || autoSavingRef.current || stereoOverlayRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
    const isVideo = mimeType.startsWith('video/');
    if (isVideo) {
      setPostCaptureBase64(null);
      postCaptureBase64Ref.current = null;
      setPostCaptureMime(mimeType);
      postCaptureMimeRef.current = mimeType;
      setPostCaptureVideoUri(payload);
      postCaptureVideoUriRef.current = payload;
    } else {
      try {
        const compressed = await new Promise<string>((resolve, reject) => {
          InteractionManager.runAfterInteractions(async () => {
            try {
              const r = await prepareImageForApi(
                buildDataUrl(cleanBase64(payload), mimeType),
                getDeviceCaptureMaxDim(),
                isLowEndDevice() ? 0.6 : 0.7,
                'none' as MoodFilterType,
              );
              resolve(r);
            } catch (err) { reject(err); }
          });
        });
        if (!isMountedRef.current) return;
        const b64 = cleanBase64(compressed);
        const mime = getMimeTypeFromDataUrl(compressed);
        setPostCaptureBase64(b64);
        postCaptureBase64Ref.current = b64;
        setPostCaptureMime(mime);
        postCaptureMimeRef.current = mime;
      } catch {
        if (!isMountedRef.current) return;
        setPostCaptureBase64(cleanBase64(payload));
        postCaptureBase64Ref.current = cleanBase64(payload);
        setPostCaptureMime(mimeType);
        postCaptureMimeRef.current = mimeType;
      }
      setPostCaptureVideoUri(null);
      postCaptureVideoUriRef.current = null;
    }
    if (!isMountedRef.current) return;
    setWorkflowMountKey((k) => k + 1); setPostCaptureVisible(true);
    } catch (err) {
      if (isMountedRef.current) setError(friendlyError(err, '캡처 처리 중 오류가 발생했습니다. 다시 시도해주세요.'));
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, []);

  // ─── Fitting multi-angle capture (reuses stereo-cut handlers) ───
  const handleFittingPickImage = async () => {
    if (stereoOverlayRef.current || autoSavingRef.current || isPipelineLocked()) return;
    setFittingGuideVisible(true);
  };

  const handleFittingWebCapture = useCallback(async (payload: string, mimeType: string) => {
    if (mimeType.startsWith('video/')) return;
    if (stereoOverlayRef.current || autoSavingRef.current || isPipelineLocked()) return;
    if (isMountedRef.current) setFittingGuideVisible(true);
  }, []);

  // ─── Virtual fitting: complete multi-angle guide (async, same pattern as 입체컷 오토) ───
  const handleFittingGuideComplete = useCallback(async (shots: AngleShot[]) => {
    if (stereoOverlayRef.current || autoSavingRef.current || isPipelineLocked() || captureActiveRef.current) return;
    stereoOverlayRef.current = true;
    const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
    const validShots = sorted.filter((s) => s.base64);
    setFittingGuideVisible(false);
    captureActiveRef.current = false;
    captureBtnLockRef.current = false;
    if (validShots.length < 2) {
      stereoOverlayRef.current = false;
      return;
    }

    stereoOverlayRef.current = true;
    if (!acquirePipelineLock('fitting')) {
      stereoOverlayRef.current = false;
      return;
    }
    await prepareCameraForProcessing();
    const controller = new AbortController();
    stereoAbortRef.current = controller;
    let stereoMod;
    try {
      stereoMod = await getStereoMod();
    } catch (err) {
      if (!isMountedRef.current) return;
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
      releasePipelineLock();
      setError(friendlyError(err, '모듈을 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.'));
      return;
    }
    setStereoProgress(stereoMod.makeInitialProgress());
    setStereoOverlayVisible(true);
    setError(null);

    let scanId: string;
    try {
      const result = await stereoMod.createScanFromAngleShots(sorted, controller.signal);
      scanId = result.scanId;
    } catch (err) {
      if (!isMountedRef.current) return;
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
      releasePipelineLock();
      setError(friendlyError(err, '이미지 업로드에 실패했습니다. 다시 시도해주세요.'));
      return;
    }

    if (isMountedRef.current) {
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      router.replace({ pathname: '/result/[id]', params: { id: scanId } });
    }

    const pipelineShots = [...sorted];
    nativeHeapCooldownGuard().finally(() => {
      if (controller.signal.aborted) { releasePipelineLock(); return; }
      runFittingPipeline(pipelineShots, scanId, undefined, cleanMode, studioSliders, controller.signal).catch(() => {}).finally(() => {
        if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
        releasePipelineLock();
      });
    });
    sorted.length = 0;
    validShots.length = 0;
    shots.length = 0;
  }, [router, cleanMode, studioSliders, prepareCameraForProcessing]);

  const handleShutterPress = useCallback((target: 'multiAngle' | 'fitting') => {
    if (captureBtnLockRef.current || processingRef.current || autoSavingRef.current || stereoOverlayRef.current) return;
    captureBtnLockRef.current = true;
    if (target === 'multiAngle') {
      setMultiAngleVisible(true);
    } else {
      setFittingGuideVisible(true);
    }
  }, []);

  const handleModeSelect = useCallback((mode: CaptureMode) => {
    setCaptureMode(mode);
    setError(null);
    setStudioMode(null);
    if (mode === 'single') {
      setScreenPhase('camera');
    } else if (mode === 'fitting') {
      setCameraReady(false); cameraReadyRef.current = false;
      cameraReadyRef.current = false;
      setScreenPhase('fitting_capture');
    }
  }, []);

  const handleModeCardPress = useCallback((mode: CaptureMode) => {
    if (contentTone === 'studio') {
      const panelMode: PanelMode = mode === 'single' ? 'auto-3d' : 'ai-blend';
      setStudioMode((prev) => (prev === panelMode ? null : panelMode));
    } else {
      handleModeSelect(mode);
    }
  }, [contentTone, handleModeSelect]);

  const handleModeConfirm = useCallback(() => {
    if (studioMode === 'auto-3d') {
      handleModeSelect('single');
    } else if (studioMode === 'ai-blend') {
      handleModeSelect('fitting');
    }
  }, [studioMode, handleModeSelect]);

  // ─── Mode Selection Screen ───
  if (screenPhase === 'mode_select') {
    return (
      <ScrollView style={styles.modeSelectContainer} contentContainerStyle={[styles.modeSelectContent, { paddingBottom: tabBarHeight + theme.spacing.lg }]} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: safeTop + theme.spacing.lg }} />

        <TriggerBanner />

        <View style={styles.modeCardsWrap}>
          <ModeCard
            icon={<Orbit size={28} color="#040B1B" strokeWidth={2.2} />}
            title="입체컷 오토"
            desc="정면·좌측·우측·후면·상부를 순차 촬영해 AI 입체적인 숏폼 완성"
            gradientColors={['rgba(252, 211, 77, 0.9)', '#D4AF37']}
            glowColor="rgba(212, 175, 55, 0.25)"
            rippleColor="rgba(212, 175, 55, 0.15)"
            onPress={() => handleModeCardPress('single')}
          />
          <ModeCard
            icon={<Layers size={28} color="#FFFFFF" strokeWidth={2.2} />}
            title="AI 범용 합성"
            desc="최소 3컷부터 최대 5컷까지 다각도 촬영으로 제품을 배경·모델에 자연스럽게 합성"
            gradientColors={['#5A8AFF', '#3A66E8']}
            glowColor="rgba(76, 125, 255, 0.25)"
            rippleColor="rgba(76, 125, 255, 0.15)"
            onPress={() => handleModeCardPress('fitting')}
          />
        </View>

        <Suspense fallback={null}>
          <StudioPremiumAccordion
            visible={contentTone === 'studio' && studioMode !== null}
            mode={studioMode === 'ai-blend' ? 'ai-blend' : 'auto-3d'}
            onValuesChange={(values) => setStudioSliders((prev) => ({ ...prev, ...values }))}
          />
        </Suspense>

        {contentTone === 'studio' && studioMode !== null && (
          <View style={styles.modeConfirmWrap}>
            <TouchableOpacity
              style={styles.modeConfirmBtn}
              onPress={handleModeConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.modeConfirmText}>
                {studioMode === 'auto-3d' ? '입체컷 오토 시작' : 'AI 범용 합성 시작'}
              </Text>
              <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.toneSelectorWrap}>
          <Text style={styles.toneSelectorLabel}>콘텐츠 톤앤매너</Text>
          <View style={styles.toneSegmented}>
            <TouchableOpacity
              style={[styles.toneSegment, contentTone === 'studio' && styles.toneSegmentActive]}
              onPress={() => handleContentToneChange('studio')}
              activeOpacity={0.8}
            >
              <View style={styles.toneSegmentHeader}>
                <View style={[
                  styles.toneIconBadge,
                  contentTone === 'studio' && styles.toneIconBadgeActive,
                  contentTone === 'studio' && styles.toneIconBadgeGoldGlow,
                ]}>
                  <Diamond size={18} color={contentTone === 'studio' ? '#FCD33C' : theme.colors.primary[400]} strokeWidth={2.2} />
                  {contentTone === 'studio' && (
                    <View style={styles.toneSparkleOverlay}>
                      <Sparkles size={8} color="#FCD33C" strokeWidth={2.5} />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.toneSegmentText,
                    contentTone === 'studio' && styles.toneSegmentTextActive,
                  ]}
                >
                  스튜디오 프리미엄
                </Text>
              </View>
              <Text style={[styles.toneHintText, contentTone === 'studio' && styles.toneHintTextActive]}>
                고급스러운 스튜디오 감도 · 디테일 강조 · 영화적 조명
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toneSegment, contentTone === 'raw' && styles.toneSegmentActiveRaw]}
              onPress={() => handleContentToneChange('raw')}
              activeOpacity={0.8}
            >
              <View style={styles.toneSegmentHeader}>
                <View style={[
                  styles.toneIconBadge,
                  contentTone === 'raw' && styles.toneIconBadgeActiveRaw,
                  contentTone === 'raw' && styles.toneIconBadgeBlueGlow,
                ]}>
                  <Zap size={18} color={contentTone === 'raw' ? '#2DD4BF' : theme.colors.accent[400]} strokeWidth={2.2} />
                </View>
                <Text
                  style={[
                    styles.toneSegmentText,
                    contentTone === 'raw' && styles.toneSegmentTextActive,
                  ]}
                >
                  날것의 심리자극
                </Text>
              </View>
              <Text style={[styles.toneHintText, contentTone === 'raw' && styles.toneHintTextActive]}>
                리얼 후기 느낌 · 자극적 훅 · 즉각적 시선 끌기
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cleanModeWrap}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cleanModeLabel}>✨ 클린 모드 (자막·문구 제외)</Text>
            <Text style={styles.cleanModeSub}>체크 시 자막·훅 없이 순수 영상/이미지만 추출합니다</Text>
          </View>
          <TouchableOpacity
            onPress={() => setCleanMode((v) => !v)}
            activeOpacity={0.7}
            hitSlop={12}
          >
            <View style={[styles.cleanModeSwitch, cleanMode && styles.cleanModeSwitchActive]}>
              <View style={[styles.cleanModeKnob, cleanMode && styles.cleanModeKnobActive]} />
            </View>
          </TouchableOpacity>
        </View>

        <CreditPurchaseModal
          visible={creditModalVisible}
          onClose={() => setCreditModalVisible(false)}
        />

        {error && (
          <View style={styles.modeSelectErrorInline}>
            <Text style={styles.modeSelectErrorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── Virtual Fitting: Multi-Angle Capture Screen ───
  if (screenPhase === 'fitting_capture') {
    if (isWebPlatform()) {
      return (
        <View style={styles.container}>
          <View style={[styles.topBar, { top: safeTop + 8 }]}>
            <TouchableOpacity
              style={styles.topBarBtn}
              onPress={() => { setScreenPhase('mode_select'); setError(null); }}
              activeOpacity={0.7}
            >
              <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topBarBtn}
              onPress={() => { updateCameraReady(false); setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
              activeOpacity={0.7}
            >
              <RotateCcw size={20} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={styles.cameraPreviewWrap}>
            <WebCameraView
              ref={webCameraRef}
              onCapture={handleFittingWebCapture}
              onPickImage={handleFittingPickImage}
              isActive={isActive}
              safeTop={safeTop}
              tabBarHeight={tabBarHeight}
              bottomInset={bottomInset}
              captureMode="single"
              onCaptureModeChange={() => {}}
              autoSaving={stereoOverlayVisible}
              autoSaveToast={null}
              autoSaveStep={1}
              onMultiAnglePress={() => setFittingGuideVisible(true)}
              onCameraReady={updateCameraReady}
              simplified
            />
          </View>

          <View style={[styles.bottomBar, { paddingBottom: bottomInset + theme.spacing.sm }]}>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <View style={styles.shutterRow}>
              <TouchableOpacity
                style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, stereoOverlayVisible && styles.shutterBtnCapturing]}
                onPress={() => handleShutterPress('fitting')}
                disabled={stereoOverlayVisible || !cameraReady}
                activeOpacity={0.85}
              >
                <Camera size={28} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <Text style={styles.shutterHintText}>
              {stereoOverlayVisible ? '이미지 업로드 중...' : '정면·좌측·우측·후면·상부 순차 촬영'}
            </Text>
          </View>

          <MultiAngleCaptureGuide
            visible={fittingGuideVisible}
            onClose={() => { setFittingGuideVisible(false); captureActiveRef.current = false; captureBtnLockRef.current = false; }}
            onComplete={handleFittingGuideComplete}
            onPickImage={handleMultiAnglePick}
            onCaptureImage={handleMultiAngleCapture}
            guides={FITTING_GUIDES}
            minShots={3}
            headerTitle="AI 범용 합성 · 다각도 가이드"
            introTitle="3~5컷 다각도 촬영으로 자연스러운 AI 합성"
            introDesc="제품 사진(정면·측면)과 배경/모델 사진을 순서대로 촬영하면 AI가 제품을 배경에 자연스럽게 합성합니다. 최소 3컷부터 합성할 수 있으며, 최대 5컷까지 촬영하면 더 정밀한 결과를 얻을 수 있습니다."
            accentColor={theme.colors.accent[400]}
            completeLabelAll="5장으로 AI 합성하기"
            completeLabelEarly="여기까지 완료 (합성하기)"
          />

          <StereoProgressLightweight
            visible={stereoOverlayVisible}
            progress={stereoProgress}
            onDismiss={() => setStereoOverlayVisible(false)}
          />

          <CreditPurchaseModal
            visible={creditModalVisible}
            onClose={() => setCreditModalVisible(false)}
          />
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>카메라 로딩 중...</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>카메라 권한이 필요합니다</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={styles.permissionBtnText}>권한 허용</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backToModeBtn}
            onPress={() => handleShutterPress('fitting')}
            activeOpacity={0.7}
          >
            <Text style={styles.backToModeText}>갤러리에서 선택</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={[styles.topBar, { top: safeTop + 8 }]}>
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => { setScreenPhase('mode_select'); setError(null); setCameraReady(false); cameraReadyRef.current = false; }}
            activeOpacity={0.7}
          >
            <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => { setCameraReady(false); cameraReadyRef.current = false; setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
            activeOpacity={0.7}
          >
            <RotateCcw size={20} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.cameraPreviewWrap}>
          {isActive && bridgeReady ? (
            <CameraView
              key={`fitting-cam-${cameraSessionKey}`}
              ref={cameraRef}
              style={styles.cameraPreview}
              facing={facing}
              onCameraReady={handleNativeCameraReady}
              onMountError={(event) => {
                cameraReadyRef.current = false;
                setCameraReady(false);
                setError(event.message || '카메라를 시작할 수 없습니다. 권한과 다른 앱의 카메라 사용 여부를 확인해주세요.');
              }}
              mode="video"
            />
          ) : (
            <View style={[styles.cameraPreview, styles.cameraPlaceholder]}>
              <Camera size={36} color={theme.colors.dark.textDim} strokeWidth={1.5} />
            </View>
          )}
        </View>

        <View style={[styles.bottomBar, { paddingBottom: bottomInset + theme.spacing.sm }]}>
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.shutterRow}>
            <TouchableOpacity
              style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, stereoOverlayVisible && styles.shutterBtnCapturing]}
              onPress={() => handleShutterPress('fitting')}
              disabled={stereoOverlayVisible || !cameraReady || !bridgeReady}
              activeOpacity={0.85}
            >
              <Camera size={28} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <Text style={styles.shutterHintText}>
            {stereoOverlayVisible ? '이미지 업로드 중...' : '정면·좌측·우측·후면·상부 순차 촬영'}
          </Text>
        </View>

        <MultiAngleCaptureGuide
          visible={fittingGuideVisible}
          onClose={() => { setFittingGuideVisible(false); captureActiveRef.current = false; captureBtnLockRef.current = false; }}
          onComplete={handleFittingGuideComplete}
          onPickImage={handleMultiAnglePick}
          onCaptureImage={handleMultiAngleCapture}
          guides={FITTING_GUIDES}
          minShots={3}
          headerTitle="AI 범용 합성 · 다각도 가이드"
          introTitle="3~5컷 다각도 촬영으로 자연스러운 AI 합성"
          introDesc="제품 사진(정면·측면)과 배경/모델 사진을 순서대로 촬영하면 AI가 제품을 배경에 자연스럽게 합성합니다. 최소 3컷부터 합성할 수 있으며, 최대 5컷까지 촬영하면 더 정밀한 결과를 얻을 수 있습니다."
          accentColor={theme.colors.accent[400]}
          completeLabelAll="5장으로 AI 합성하기"
          completeLabelEarly="여기까지 완료 (합성하기)"
        />

        <StereoProgressLightweight
          visible={stereoOverlayVisible}
          progress={stereoProgress}
          onDismiss={() => setStereoOverlayVisible(false)}
        />

        <CreditPurchaseModal
          visible={creditModalVisible}
          onClose={() => setCreditModalVisible(false)}
        />
      </View>
    );
  }

  // ─── Web Camera Screen ───
  if (isWebPlatform()) {
    return (
      <View style={styles.container}>
        <View style={[styles.topBar, { top: safeTop + 8 }]}>
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => { setScreenPhase('mode_select'); setError(null); }}
            activeOpacity={0.7}
          >
            <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => { setCameraReady(false); cameraReadyRef.current = false; setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
            activeOpacity={0.7}
          >
            <RotateCcw size={20} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.cameraPreviewWrap}>
          <WebCameraView
            ref={webCameraRef}
            onCapture={handleWebCapture}
            onPickImage={handlePickImage}
            isActive={isActive}
            safeTop={safeTop}
            tabBarHeight={tabBarHeight}
            bottomInset={bottomInset}
            captureMode="single"
            onCaptureModeChange={() => {}}
            autoSaving={autoSaving}
            autoSaveToast={autoSaveToast}
            autoSaveStep={autoSaveStep}
            onMultiAnglePress={() => handleShutterPress('multiAngle')}
            onCameraReady={updateCameraReady}
            simplified
          />
        </View>

        <View style={[styles.bottomBar, { paddingBottom: bottomInset + theme.spacing.sm }]}>
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.shutterRow}>
            <TouchableOpacity
              style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, (processing || autoSaving) && styles.shutterBtnCapturing]}
              onPress={() => handleShutterPress('multiAngle')}
              disabled={processing || autoSaving || !cameraReady}
              activeOpacity={0.85}
            >
              <Camera size={28} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <Text style={styles.shutterHintText}>
            {autoSaving ? 'AI 자동 분석 중...' : '정면·좌측·우측·후면·상부 순차 촬영'}
          </Text>
        </View>

        <MultiAngleCaptureGuide
          visible={multiAngleVisible}
          onClose={() => { setMultiAngleVisible(false); captureActiveRef.current = false; captureBtnLockRef.current = false; }}
          onComplete={handleMultiAngleComplete}
          onPickImage={handleMultiAnglePick}
          onCaptureImage={handleMultiAngleCapture}
        />

        <PostCaptureWorkflow
          key={`pcw-web-${workflowMountKey}`}
          visible={postCaptureVisible}
          videoUri={postCaptureVideoUri}
          imageUri={postCaptureBase64 ? buildDataUrl(postCaptureBase64, postCaptureMime) : null}
          onProceedToAnalysis={handlePostCaptureProceed}
          onClose={handlePostCaptureClose}
        />

        <CreditPurchaseModal
          visible={creditModalVisible}
          onClose={() => setCreditModalVisible(false)}
        />

        <StereoProgressLightweight
          visible={stereoOverlayVisible}
          progress={stereoProgress}
          onDismiss={() => setStereoOverlayVisible(false)}
        />

        <ProcessingBarrier
          visible={processing && !autoSaving && !stereoOverlayVisible}
          label="사진 분석 중..."
          sublabel="완료될 때까지 화면이 잠겨 있어요"
        />
      </View>
    );
  }

  // ─── Native Camera Screen ───
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라 로딩 중...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
          <Text style={styles.permissionBtnText}>권한 허용</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backToModeBtn} onPress={() => setScreenPhase('mode_select')} activeOpacity={0.7}>
          <Text style={styles.backToModeText}>뒤로 가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar: back + flip camera */}
      <View style={[styles.topBar, { top: safeTop + 8 }]}>
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => { setScreenPhase('mode_select'); setError(null); setCameraReady(false); cameraReadyRef.current = false; }}
          activeOpacity={0.7}
        >
          <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => { setCameraReady(false); cameraReadyRef.current = false; setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
          activeOpacity={0.7}
        >
          <RotateCcw size={20} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Camera Preview */}
      <View style={styles.cameraPreviewWrap}>
        {isActive && bridgeReady ? (
          <CameraView
            key={`native-cam-${cameraSessionKey}`}
            ref={cameraRef}
            style={styles.cameraPreview}
            facing={facing}
            onCameraReady={handleNativeCameraReady}
            onMountError={(event) => {
                cameraReadyRef.current = false;
                setCameraReady(false);
                setError(event.message || '카메라를 시작할 수 없습니다. 권한과 다른 앱의 카메라 사용 여부를 확인해주세요.');
              }}
            mode="video"
          />
        ) : (
          <View style={[styles.cameraPreview, styles.cameraPlaceholder]}>
            <Camera size={36} color={theme.colors.dark.textDim} strokeWidth={1.5} />
          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + theme.spacing.sm }]}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <View style={styles.shutterRow}>
          <TouchableOpacity
            style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, (processing || autoSaving) && styles.shutterBtnCapturing]}
            onPress={() => handleShutterPress('multiAngle')}
            disabled={processing || autoSaving || !cameraReady || !bridgeReady}
          >
            <Camera size={28} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.videoPickBtn}
            onPress={handlePickVideo}
            disabled={processing || autoSaving}
            activeOpacity={0.8}
          >
            <Video size={18} color={theme.colors.dark.text} strokeWidth={2} />
            <Text style={styles.videoPickText}>영상 불러오기</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.shutterHintText}>
          {autoSaving ? 'AI 자동 분석 중...' : '사진 촬영 또는 기기 영상 선택'}
        </Text>
      </View>

      {/* Multi-Angle Capture Guide */}
      <MultiAngleCaptureGuide
        visible={multiAngleVisible}
        onClose={() => { setMultiAngleVisible(false); captureActiveRef.current = false; captureBtnLockRef.current = false; }}
        onComplete={handleMultiAngleComplete}
        onPickImage={handleMultiAnglePick}
        onCaptureImage={handleMultiAngleCapture}
      />

      {/* Auto-save toast */}
      <Modal visible={!!autoSaveToast} transparent animationType="fade">
        <View style={styles.autoSaveToastWrap}>
          <View style={styles.autoSaveToastInner}>
            <Check size={18} color={theme.colors.success[400]} strokeWidth={2.5} />
            <Text style={styles.autoSaveToastText}>{autoSaveToast}</Text>
          </View>
        </View>
      </Modal>

      {/* Auto-saving overlay */}
      <Modal visible={autoSaving} transparent animationType="fade">
        <View style={styles.autoSavingOverlay}>
          <View style={styles.autoSavingCard}>
            <RNAnimated.View style={{ transform: [{ scale: autoSavePulse }] }}>
              <Sparkles size={28} color={theme.colors.primary[400]} strokeWidth={2} />
            </RNAnimated.View>
            <Text style={styles.autoSavingTitle}>AI가 메뉴를 분석 중입니다</Text>
            <View style={styles.autoSavingStepRow}>
              <View style={[styles.autoSavingStepDot, autoSaveStep >= 1 && styles.autoSavingStepDotActive]} />
              <View style={[styles.autoSavingStepDot, autoSaveStep >= 2 && styles.autoSavingStepDotActive]} />
              <View style={[styles.autoSavingStepDot, autoSaveStep >= 3 && styles.autoSavingStepDotActive]} />
            </View>
            <Text style={styles.autoSavingSub}>
              {autoSaveStep === 1 ? '사진 촬영 완료! 메뉴 인식 중...' :
               autoSaveStep === 2 ? 'AI 비전 분석 중, 숏폼 생성 준비 중...' :
               '보관함에 자동 저장 중, 거의 다 됐어요!'}
            </Text>
          </View>
        </View>
      </Modal>

      <PostCaptureWorkflow
        key={`pcw-native-${workflowMountKey}`}
        visible={postCaptureVisible}
        videoUri={postCaptureVideoUri}
        imageUri={postCaptureBase64 ? buildDataUrl(postCaptureBase64, postCaptureMime) : null}
        onProceedToAnalysis={handlePostCaptureProceed}
        onClose={handlePostCaptureClose}
      />

      <CreditPurchaseModal
        visible={creditModalVisible}
        onClose={() => setCreditModalVisible(false)}
      />

      <StereoProgressLightweight
        visible={stereoOverlayVisible}
        progress={stereoProgress}
        onDismiss={() => setStereoOverlayVisible(false)}
      />

      <ProcessingBarrier
        visible={processing && !autoSaving && !stereoOverlayVisible}
        label="사진 분석 중..."
        sublabel="완료될 때까지 화면이 잠겨 있어요"
      />
    </View>
  );
}

// ─── Lightweight Stereo Pipeline Progress ───

function StereoProgressLightweight({
  visible,
  progress,
  onDismiss,
}: {
  visible: boolean;
  progress: StereoPipelineProgress;
  onDismiss: () => void;
}) {
  const hasError = progress.error !== null;
  const pct = Math.round(progress.overallProgress * 100);
  const currentStep = progress.currentStep >= 0 ? progress.steps[progress.currentStep] : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.stereoLightOverlay}>
        <View style={styles.stereoLightCard}>
          {hasError ? (
            <>
              <AlertCircle size={28} color={theme.colors.error[400]} strokeWidth={2} />
              <Text style={styles.stereoLightTitle}>처리 중 오류</Text>
              <Text style={styles.stereoLightError}>{progress.error}</Text>
              <TouchableOpacity style={styles.stereoLightBtn} onPress={onDismiss} activeOpacity={0.7}>
                <Text style={styles.stereoLightBtnText}>확인</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <RNAnimated.View style={{ transform: [{ scale: 1 }] }}>
                <Sparkles size={28} color={theme.colors.primary[400]} strokeWidth={2} />
              </RNAnimated.View>
              <Text style={styles.stereoLightTitle}>AI 입체컷 생성 중</Text>
              {currentStep && <Text style={styles.stereoLightStep}>{currentStep.label}</Text>}
              <View style={styles.stereoLightBarWrap}>
                <View style={styles.stereoLightBarTrack}>
                  <View style={[styles.stereoLightBarFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.stereoLightPct}>{pct}%</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Mode Card Component ───
interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  gradientColors: [string, string];
  glowColor: string;
  rippleColor: string;
  onPress: () => void;
}

function ModeCard({ icon, title, desc, gradientColors, glowColor, rippleColor, onPress }: ModeCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.modeCard,
        pressed && styles.modeCardPressed,
      ]}
      onPress={onPress}
      android_ripple={{ color: rippleColor, radius: 200 }}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.modeCardIcon, { shadowColor: glowColor }]}
      >
        {icon}
      </LinearGradient>
      <View style={styles.modeCardTextWrap}>
        <Text style={styles.modeCardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.modeCardDesc} numberOfLines={2}>{desc}</Text>
      </View>
      <ArrowRight size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  // Mode selection screen
  modeSelectContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  modeSelectContent: {
    paddingBottom: theme.spacing.xxl,
  },
  modeCardsWrap: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  cleanModeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  cleanModeLabel: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  cleanModeSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
    marginTop: 2,
  },
  cleanModeSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cleanModeSwitchActive: {
    backgroundColor: theme.colors.accent[500],
  },
  cleanModeKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  cleanModeKnobActive: {
    transform: [{ translateX: 18 }],
  },
  toneSelectorWrap: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  toneSelectorLabel: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: theme.spacing.md,
    letterSpacing: -0.4,
  },
  toneSegmented: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  toneSegment: {
    flex: 1,
    minHeight: 106,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  toneSegmentHeader: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  toneIconBadge: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary[600] + '22',
  },
  toneIconBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  toneIconBadgeGoldGlow: {
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 0,
  },
  toneIconBadgeBlueGlow: {
    shadowColor: '#4C7DFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 0,
  },
  toneSparkleOverlay: {
    position: 'absolute',
    top: -2,
    right: -3,
  },
  toneIconBadgeActiveRaw: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  toneSegmentActive: {
    backgroundColor: theme.colors.primary[600],
  },
  toneSegmentActiveRaw: {
    backgroundColor: theme.colors.accent[500],
  },
  toneSegmentText: {
    width: '100%',
    fontSize: 14,
    lineHeight: 19,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
  toneSegmentTextActive: {
    color: '#fff',
  },
  toneHintText: {
    width: '100%',
    fontSize: 10,
    lineHeight: 15,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  toneHintTextActive: {
    color: 'rgba(255, 255, 255, 0.78)',
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md + 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  modeCardPressed: {
    borderColor: 'rgba(76, 125, 255, 0.5)',
  },
  modeCardIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 0,
  },
  modeCardTextWrap: {
    flex: 1,
    flexShrink: 1,
    gap: 4,
  },
  modeCardTitle: {
    fontSize: 17,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  modeCardDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: '#A6B0CF',
    lineHeight: 17,
  },
  modeSelectErrorInline: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.error[500] + '18',
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modeConfirmWrap: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  modeConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary[600],
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    ...theme.shadows.glowPrimary,
  },
  modeConfirmText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  modeSelectErrorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
  },
  // Permission
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.bg,
    gap: theme.spacing.md,
  },
  permissionText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  permissionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary[600],
    borderRadius: theme.radius.lg,
  },
  permissionBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  backToModeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backToModeText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  // Camera screen
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    zIndex: 20,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(10, 15, 30, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPreviewWrap: {
    flex: 2,
    position: 'relative',
  },
  cameraPreview: {
    flex: 1,
  },
  cameraPlaceholder: {
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  errorBanner: {
    backgroundColor: theme.colors.error[500] + '18',
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
  },
  shutterRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  videoPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  videoPickText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  shutterBtnDisabled: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  shutterBtnCapturing: {
    opacity: 0.6,
  },
  shutterHintText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  // Auto-save toast
  autoSaveToastWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoSaveToastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  autoSaveToastText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  // Auto-saving overlay
  autoSavingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 18, 0.7)',
  },
  autoSavingCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
    maxWidth: 320,
  },
  autoSavingTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  autoSavingSub: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 18,
  },
  autoSavingStepRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 6,
  },
  autoSavingStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  autoSavingStepDotActive: {
    backgroundColor: theme.colors.primary[400],
  },
  // Stereo progress
  stereoLightOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 15, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stereoLightCard: {
    width: 280,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    ...theme.shadows.elevated,
  },
  stereoLightTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  stereoLightStep: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300],
  },
  stereoLightError: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
    lineHeight: 18,
  },
  stereoLightBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  stereoLightBarTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
  },
  stereoLightBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.primary[500],
  },
  stereoLightPct: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
    minWidth: 36,
    textAlign: 'right',
  },
  stereoLightBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
  },
  stereoLightBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
});
