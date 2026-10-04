import { useRef, useState, useCallback, useEffect, lazy, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  AppState,
  type AppStateStatus,
  InteractionManager,
  Image,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { CameraView as CameraViewType } from 'expo-camera';
import { CameraView } from 'expo-camera';
import { useCameraPermissionsSafe } from '@/hooks/useCameraPermissionsSafe';
import { useNativeBridgeReady } from '@/hooks/useNativeBridgeReady';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';
import { Camera, RotateCcw, X, Check, Sparkles, Image as ImageIcon, AlertCircle, ArrowRight, Flame, Gem, Orbit, Layers, Diamond, Zap, Video } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { startAsyncAnalysis } from '@/lib/asyncAnalysis';
import { saveManualScan, uploadImage } from '@/lib/analysis';
import { supabase } from '@/lib/supabase';
import { isOnline } from '@/hooks/useNetworkStatus';
import { buildDataUrl, cleanBase64, getMimeTypeFromDataUrl } from '@/lib/base64';
import { prepareImageForApi, compressImageToBase64, compressImageToBase64WithUri, compressCaptureUriToBlob, extractVideoFrameBase64, waitForUriFlush, nativeHeapCooldownGuard } from '@/lib/imageEdit';
import type { MoodFilterType } from '@/lib/imageEdit';
import { friendlyError } from '@/lib/errors';
import { logError } from '@/lib/errorLogger';
import { useBeforeUnloadGuard } from '@/hooks/useBeforeUnloadGuard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getItem, setItem } from '@/lib/storage';
import { pickImageWeb, isWebPlatform } from '@/lib/webImagePicker';
import { checkVideoAssetSpecs } from '@/lib/smartResize';
import type { WebCameraHandle } from '@/components/WebCameraView';
import type { AngleShot, AngleGuide } from '@/components/MultiAngleCaptureGuide';
import { TriggerBanner } from '@/components/TriggerBanner';
import type { StudioSliderValues } from '@/components/StudioPremiumPanel';
import type { ShortFormEditPlan } from '@/lib/shortFormEditEngine';
import type { StereoPipelineProgress } from '@/lib/stereoPipeline';
import { acquirePipelineLock, releasePipelineLock, isPipelineLocked, forceResetPipelineLock } from '@/lib/pipelineLock';
import { SafeLazyLoad } from '@/components/ErrorBoundary';
import { ProcessingBarrier } from '@/components/ProcessingBarrier';
import { DraftHistory } from '@/components/DraftHistory';
import { useDraftAutoSave } from '@/hooks/useDraftAutoSave';
import { sweepExpiredDrafts } from '@/lib/draftStorage';

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
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const bottomInset = insets.bottom;

  const [permission, requestPermission] = useCameraPermissionsSafe();
  const bridgeReady = useNativeBridgeReady();

  const [isActive, setIsActive] = useState(true);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraViewType | null>(null);
  const cameraReadyRef = useRef(false);
  const permissionGrantedRef = useRef(false);
  const isMountedRef = useRef(true);
  const webCameraRef = useRef<WebCameraHandle | null>(null);

  const [processing, setProcessing] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaveToast, setAutoSaveToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditModalVisible, setCreditModalVisible] = useState(false);
  const [postCaptureVisible, setPostCaptureVisible] = useState(false);
  const [postCaptureBase64, setPostCaptureBase64] = useState<string | null>(null);
  const [postCaptureMime, setPostCaptureMime] = useState('video/webm');
  const [postCaptureVideoUri, setPostCaptureVideoUri] = useState<string | null>(null);
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

  const [fittingGuideVisible, setFittingGuideVisible] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(() => Date.now());

  const postCaptureBase64Ref = useRef<string | null>(null);
  const postCaptureMimeRef = useRef<string>('video/webm');
  const postCaptureVideoUriRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const autoSavingRef = useRef(false);
  const stereoOverlayRef = useRef(false);
  const stereoAbortRef = useRef<AbortController | null>(null);
  const autoAnalysisAbortRef = useRef<AbortController | null>(null);
  const captureActiveRef = useRef(false);
  const captureBtnLockRef = useRef(false);
  const genIdRef = useRef(0);
  const pipelineLockRef = useRef(false);
  const bufferReleasedRef = useRef(true);
  const bufferReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRemountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const multiAngleVisibleRef = useRef(false);
  const [multiAngleVisible, setMultiAngleVisible] = useState(false);

  const updateCameraReady = useCallback((ready: boolean) => {
    cameraReadyRef.current = ready;
    if (isMountedRef.current) setCameraReady(ready);
  }, []);

  const handleNativeCameraReady = useCallback(() => {
    updateCameraReady(true);
  }, [updateCameraReady]);

  const deactivateCamera = useCallback(() => {
    setIsActive(false);
    updateCameraReady(false);
  }, [updateCameraReady]);

  const scheduleCameraReactivation = useCallback(() => {
    if (cameraRemountTimerRef.current) clearTimeout(cameraRemountTimerRef.current);
    updateCameraReady(false);
    setCameraSessionKey((k) => k + 1);
    cameraRemountTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setIsActive(true);
    }, 300);
  }, [updateCameraReady]);

  // Auto-save animation pulse
  const autoSavePulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoSavePulse, setAutoSavePulse] = useState(0);
  const startAutoSaveAnimation = useCallback(() => {
    if (autoSavePulseRef.current) clearInterval(autoSavePulseRef.current);
    autoSavePulseRef.current = setInterval(() => {
      setAutoSavePulse((p) => (p + 1) % 4);
    }, 600);
  }, []);
  const stopAutoSaveAnimation = useCallback(() => {
    if (autoSavePulseRef.current) {
      clearInterval(autoSavePulseRef.current);
      autoSavePulseRef.current = null;
    }
  }, []);

  // Sweep expired drafts on boot
  useEffect(() => {
    sweepExpiredDrafts().catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
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
        forceResetPipelineLock();
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

  const { saveDraftState } = useDraftAutoSave('camera');

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
      await nativeHeapCooldownGuard();
      if (!isMountedRef.current || controller.signal.aborted) return;
      if (!base64) {
        if (!videoUri) return;
        const frame = await withTimeout(
          extractVideoFrameBase64(videoUri, 720, 0.8),
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
      const ImagePicker = await import('expo-image-picker');
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

  const handlePickImage = useCallback(async () => {
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
                  const r = await prepareImageForApi(buildDataUrl(cleanBase64(images[0].base64), images[0].mimeType), 720, 0.8, 'none' as MoodFilterType);
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

      const ImagePicker = await import('expo-image-picker');
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
      const assetUri = result.assets[0].uri;
      if (!assetUri) return;
      const { base64, mimeType, compressedUri } = await withTimeout(
        new Promise<{ base64: string; mimeType: string; compressedUri: string | null }>((resolve, reject) => {
          InteractionManager.runAfterInteractions(async () => {
            try {
              const r = await compressImageToBase64WithUri(assetUri, 720, 0.8);
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
      setWorkflowMountKey((k) => k + 1);
      setPostCaptureVisible(true);
    } catch (err) {
      if (isMountedRef.current) setError(friendlyError(err, '사진 선택에 실패했습니다. 다시 시도해주세요.'));
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [processing, autoSaving]);

  const getStereoMod = useCallback(async () => {
    return await import('@/lib/stereoPipeline');
  }, []);

  const handleShutterPress = useCallback((mode: CaptureMode) => {
    if (captureBtnLockRef.current || processingRef.current || autoSavingRef.current || stereoOverlayRef.current) return;
    if (mode === 'fitting') {
      if (isWebPlatform()) {
        const webCam = webCameraRef.current;
        if (webCam?.isReady()) {
          webCam.captureFrame().then((result) => {
            if (result?.base64) handleFittingWebCapture(result.base64, result.mimeType);
          }).catch(() => {});
        }
        return;
      }
      setFittingGuideVisible(true);
      captureActiveRef.current = true;
      captureBtnLockRef.current = true;
      return;
    }
    setMultiAngleVisible(true);
    multiAngleVisibleRef.current = true;
    captureActiveRef.current = true;
    captureBtnLockRef.current = true;
  }, []);

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

    const angleLabels = ['정면', '좌측', '우측', '후면', '상부'];

    if (!acquirePipelineLock('stereo')) {
      stereoOverlayRef.current = false;
      return;
    }
    const controller = new AbortController();
    stereoAbortRef.current = controller;
    let stereoMod: typeof import('@/lib/stereoPipeline') | null = null;
    let scanId: string | null = null;
    let uploadedUrls: string[] = [];
    let pipelineStarted = false;
    try {
      await prepareCameraForProcessing();
      stereoMod = await getStereoMod();
      setStereoProgress(stereoMod.makeInitialProgress());
      setStereoOverlayVisible(true);
      const result = await stereoMod.createScanFromAngleShots(sorted, controller.signal);
      scanId = result.scanId;
      uploadedUrls = result.uploadedUrls;
      saveDraftState({
        imageUris: uploadedUrls,
        angleLabels: validShots.map((s, i) => angleLabels[s.orderIndex] || `사진 ${i + 1}`),
        status: 'generating',
        scanId: scanId ?? undefined,
        uploaded: true,
      });
      if (isMountedRef.current) {
        router.replace({ pathname: '/result/[id]', params: { id: scanId } });
      }
      const pipelineShots = [...sorted];
      pipelineStarted = true;
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      nativeHeapCooldownGuard().finally(() => {
        if (controller.signal.aborted) { releasePipelineLock(); return; }
        stereoMod!.runStereoPipeline(pipelineShots, () => {}, cleanMode, scanId!, contentTone, studioSliders, uploadedUrls, controller.signal).catch(() => {}).finally(() => {
          if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
          releasePipelineLock();
        });
      });
    } catch (err) {
      if (isMountedRef.current) {
        setStereoOverlayVisible(false);
        setError(friendlyError(err, stereoMod ? '이미지 업로드에 실패했습니다. 다시 시도해주세요.' : '모듈을 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.'));
      }
    } finally {
      if (!pipelineStarted) {
        stereoOverlayRef.current = false;
        if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
        releasePipelineLock('stereo');
      }
      sorted.length = 0;
      validShots.length = 0;
      shots.length = 0;
    }
  };

  const multiAngleCaptureInProgressRef = useRef(false);
  const CAPTURE_TIMEOUT_MS = 15000;

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
        try { await cam.resumePreview(); } catch { /* non-fatal */ }
        return await withTimeout(
          cam.takePictureAsync({
            quality: 0.6,
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
          multiAngleCaptureInProgressRef.current = false;
          return null;
        }
        await new Promise((r) => setTimeout(r, 400));
        if (!isMountedRef.current || !cameraRef.current) {
          multiAngleCaptureInProgressRef.current = false;
          return null;
        }
        photo = await attemptCapture();
      }
      if (!isMountedRef.current || !cameraRef.current) {
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
      const capturedUri = photo.uri;
      photo = null;
      const flushed = await waitForUriFlush(capturedUri);
      if (!flushed || !isMountedRef.current) {
        import('expo-file-system/legacy').then((fs) => fs.deleteAsync(capturedUri, { idempotent: true })).catch(() => {});
        multiAngleCaptureInProgressRef.current = false;
        return null;
      }
      const { base64, mimeType, compressedUri } = await withTimeout(
        new Promise<{ base64: string; mimeType: string; compressedUri: string | null }>((resolve, reject) => {
          InteractionManager.runAfterInteractions(async () => {
            let lastErr: unknown;
            for (let attempt = 0; attempt < 2; attempt++) {
              if (!isMountedRef.current) { reject(new Error('unmounted')); return; }
              try {
                const r = await compressImageToBase64WithUri(capturedUri, 720, 0.8);
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
      const ImagePicker = await import('expo-image-picker');
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
              const r = await compressImageToBase64WithUri(assetUri, 720, 0.8);
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
                  720,
                  0.8,
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

  const handleFittingWebCapture = useCallback(async (payload: string, mimeType: string) => {
    if (mimeType.startsWith('video/')) return;
    if (stereoOverlayRef.current || autoSavingRef.current || isPipelineLocked()) return;
    if (isMountedRef.current) setFittingGuideVisible(true);
  }, []);

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
    if (!acquirePipelineLock('fitting')) {
      stereoOverlayRef.current = false;
      return;
    }
    const controller = new AbortController();
    stereoAbortRef.current = controller;
    let stereoMod: typeof import('@/lib/stereoPipeline') | null = null;
    let scanId: string | null = null;
    let uploadedUrls: string[] = [];
    let pipelineStarted = false;
    try {
      await prepareCameraForProcessing();
      stereoMod = await getStereoMod();
      setStereoProgress(stereoMod.makeInitialProgress());
      setStereoOverlayVisible(true);
      const result = await stereoMod.createScanFromAngleShots(sorted, controller.signal);
      scanId = result.scanId;
      uploadedUrls = result.uploadedUrls;
      saveDraftState({
        imageUris: uploadedUrls,
        angleLabels: validShots.map((s, i) => FITTING_GUIDES[i]?.label || `사진 ${i + 1}`),
        status: 'generating',
        scanId: scanId ?? undefined,
        uploaded: true,
      });
      if (isMountedRef.current) {
        router.replace({ pathname: '/result/[id]', params: { id: scanId } });
      }
      const pipelineShots = [...sorted];
      pipelineStarted = true;
      stereoOverlayRef.current = false;
      setStereoOverlayVisible(false);
      nativeHeapCooldownGuard().finally(() => {
        if (controller.signal.aborted) { releasePipelineLock(); return; }
        stereoMod!.runStereoPipeline(pipelineShots, () => {}, cleanMode, scanId!, contentTone, studioSliders, uploadedUrls, controller.signal).catch(() => {}).finally(() => {
          if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
          releasePipelineLock();
        });
      });
    } catch (err) {
      if (isMountedRef.current) {
        setStereoOverlayVisible(false);
        setError(friendlyError(err, stereoMod ? '이미지 업로드에 실패했습니다. 다시 시도해주세요.' : '모듈을 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.'));
      }
    } finally {
      if (!pipelineStarted) {
        stereoOverlayRef.current = false;
        if (stereoAbortRef.current === controller) stereoAbortRef.current = null;
        releasePipelineLock('fitting');
      }
      sorted.length = 0;
      validShots.length = 0;
      shots.length = 0;
    }
  }, [router, cleanMode, contentTone, studioSliders, prepareCameraForProcessing, getStereoMod, saveDraftState]);

  const handleFittingPickImage = async () => {
    if (isWebPlatform()) return;
    const ImagePicker = await import('expo-image-picker');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const webCam = webCameraRef.current;
    if (webCam) {
      // Can't directly set image from picker on web camera; trigger capture flow
    }
  };

  const handleModeSelect = useCallback((mode: CaptureMode) => {
    setError(null);
    if (mode === 'fitting') {
      if (isWebPlatform()) {
        setScreenPhase('fitting_capture');
      } else {
        if (permission?.granted) {
          setScreenPhase('fitting_capture');
          scheduleCameraReactivation();
        } else {
          requestPermission().then(() => {
            if (isMountedRef.current) setScreenPhase('fitting_capture');
          });
        }
      }
    } else {
      if (isWebPlatform()) {
        setScreenPhase('camera');
      } else {
        if (permission?.granted) {
          setScreenPhase('camera');
          scheduleCameraReactivation();
        } else {
          requestPermission().then(() => {
            if (isMountedRef.current) setScreenPhase('camera');
          });
        }
      }
    }
  }, [permission, requestPermission, scheduleCameraReactivation]);

  const handleContentToneChange = useCallback((tone: ContentTone) => {
    setContentTone(tone);
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

  const handleResumeDraftFromHome = useCallback((draft: { source: string; id: string }) => {
    if (draft.source === 'fitting') {
      setCaptureMode('fitting');
    } else {
      setCaptureMode('single');
    }
    router.push({ pathname: '/synthesis', params: { draftId: draft.id } });
  }, [router]);

  // Lazy-loaded components
  const WebCameraView = lazy(() => import('@/components/WebCameraView').then((m) => ({ default: m.WebCameraView })));
  const MultiAngleCaptureGuide = lazy(() => import('@/components/MultiAngleCaptureGuide').then((m) => ({ default: m.MultiAngleCaptureGuide })));
  const PostCaptureWorkflow = lazy(() => import('@/components/PostCaptureWorkflow').then((m) => ({ default: m.PostCaptureWorkflow })));
  const StereoProgressLightweight = lazy(() => import('@/components/AidcaProgressTracker').then((m) => ({ default: m.AidcaProgressTracker })));
  const StudioPremiumAccordion = lazy(() => import('@/components/StudioPremiumPanel').then((m) => ({ default: m.StudioPremiumAccordion })));
  const stereoProgressSV = useSharedValue(0);
  useEffect(() => { stereoProgressSV.value = withTiming(stereoProgress.overallProgress, { duration: 300 }); }, [stereoProgress.overallProgress, stereoProgressSV]);
  const CreditPurchaseModal = lazy(() => import('@/components/CreditPurchaseModal').then((m) => ({ default: m.CreditPurchaseModal })));
  const ModeCard = ({ icon, title, desc, gradientColors, glowColor, rippleColor, onPress }: {
    icon: React.ReactNode; title: string; desc: string;
    gradientColors: [string, string]; glowColor: string; rippleColor: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.modeCard}>
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modeCardGradient}>
        <View style={styles.modeCardIconWrap}>{icon}</View>
        <Text style={styles.modeCardTitle}>{title}</Text>
        <Text style={styles.modeCardDesc}>{desc}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  // ─── Mode Selection Screen ───
  if (screenPhase === 'mode_select') {
    return (
      <ScrollView style={styles.modeSelectContainer} contentContainerStyle={[styles.modeSelectContent, { paddingBottom: tabBarHeight + theme.spacing.lg }]} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: safeTop + theme.spacing.lg }} />

        <TriggerBanner />

        <DraftHistory onResume={handleResumeDraftFromHome} />

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
            onValuesChange={(values: Partial<StudioSliderValues>) => setStudioSliders((prev) => ({ ...prev, ...values }))}
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

        <Suspense fallback={null}>
          <CreditPurchaseModal
            visible={creditModalVisible}
            onClose={() => setCreditModalVisible(false)}
          />
        </Suspense>

        {error && (
          <View style={styles.modeSelectErrorInline}>
            <Text style={styles.modeSelectErrorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── Camera Screen (single/stereo) ───
  if (screenPhase === 'camera') {
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
            <Suspense fallback={<View style={styles.cameraPlaceholder} />}>
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
                autoSaving={stereoOverlayVisible}
                autoSaveToast={autoSaveToast}
                autoSaveStep={autoSavePulse}
                onMultiAnglePress={() => { setMultiAngleVisible(true); captureActiveRef.current = true; captureBtnLockRef.current = true; }}
                onCameraReady={updateCameraReady}
              />
            </Suspense>
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
                onPress={() => handleShutterPress('single')}
                disabled={stereoOverlayVisible || !cameraReady}
                activeOpacity={0.85}
              >
                <Camera size={28} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickImage} activeOpacity={0.7} style={styles.galleryBtn}>
                <ImageIcon size={22} color={theme.colors.dark.text} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickVideo} activeOpacity={0.7} style={styles.galleryBtn}>
                <Video size={22} color={theme.colors.dark.text} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.shutterHintText}>
              {stereoOverlayVisible ? '이미지 업로드 중...' : '정면·좌측·우측·후면·상부 순차 촬영'}
            </Text>
          </View>

          <Suspense fallback={null}>
            <MultiAngleCaptureGuide
              visible={multiAngleVisible}
              onClose={() => { setMultiAngleVisible(false); captureActiveRef.current = false; captureBtnLockRef.current = false; }}
              onComplete={handleMultiAngleComplete}
              onPickImage={handleMultiAnglePick}
              onCaptureImage={handleMultiAngleCapture}
              minShots={3}
              headerTitle="입체컷 오토 · 다각도 가이드"
              introTitle="3~5컷 다각도 촬영으로 입체 숏폼 완성"
              introDesc="정면·좌측·우측·후면·상부를 순서대로 촬영하면 AI가 3D 입체 영상을 만듭니다. 최소 3컷부터 가능하며, 5컷까지 촬영하면 더 정밀한 결과를 얻을 수 있습니다."
              accentColor={theme.colors.gold[400]}
              completeLabelAll="5장으로 입체컷 생성"
              completeLabelEarly="여기까지 완료 (생성하기)"
            />
          </Suspense>

          <Suspense fallback={null}>
            {stereoOverlayVisible && (
              <StereoProgressLightweight progressSV={stereoProgressSV} />
            )}
          </Suspense>

          <Suspense fallback={null}>
            <PostCaptureWorkflow
              key={workflowMountKey}
              visible={postCaptureVisible}
              videoUri={postCaptureVideoUri}
              imageUri={postCaptureBase64 ? `data:${postCaptureMime};base64,${postCaptureBase64}` : null}
              onClose={handlePostCaptureClose}
              onProceedToAnalysis={handlePostCaptureProceed}
            />
          </Suspense>

          <Suspense fallback={null}>
            <CreditPurchaseModal
              visible={creditModalVisible}
              onClose={() => setCreditModalVisible(false)}
            />
          </Suspense>

          <ProcessingBarrier
            visible={processing || autoSaving}
            label={autoSaving ? 'AI 분석 중...' : '처리 중...'}
            sublabel={autoSaveToast ?? undefined}
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
            onPress={handlePickImage}
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
              key={`cam-${cameraSessionKey}`}
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
              onPress={() => handleShutterPress('single')}
              disabled={stereoOverlayVisible || !cameraReady}
              activeOpacity={0.85}
            >
              <Camera size={28} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.7} style={styles.galleryBtn}>
              <ImageIcon size={22} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickVideo} activeOpacity={0.7} style={styles.galleryBtn}>
              <Video size={22} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.shutterHintText}>
            {stereoOverlayVisible ? '이미지 업로드 중...' : '정면·좌측·우측·후면·상부 순차 촬영'}
          </Text>
        </View>

        <Suspense fallback={null}>
          <MultiAngleCaptureGuide
            visible={multiAngleVisible}
            onClose={() => { setMultiAngleVisible(false); captureActiveRef.current = false; captureBtnLockRef.current = false; }}
            onComplete={handleMultiAngleComplete}
            onPickImage={handleMultiAnglePick}
            onCaptureImage={handleMultiAngleCapture}
            minShots={3}
            headerTitle="입체컷 오토 · 다각도 가이드"
            introTitle="3~5컷 다각도 촬영으로 입체 숏폼 완성"
            introDesc="정면·좌측·우측·후면·상부를 순서대로 촬영하면 AI가 3D 입체 영상을 만듭니다. 최소 3컷부터 가능하며, 5컷까지 촬영하면 더 정밀한 결과를 얻을 수 있습니다."
            accentColor={theme.colors.gold[400]}
            completeLabelAll="5장으로 입체컷 생성"
            completeLabelEarly="여기까지 완료 (생성하기)"
          />
        </Suspense>

        <Suspense fallback={null}>
          {stereoOverlayVisible && (
            <StereoProgressLightweight progressSV={stereoProgressSV} />
          )}
        </Suspense>

        <Suspense fallback={null}>
          <PostCaptureWorkflow
            key={workflowMountKey}
            visible={postCaptureVisible}
            videoUri={postCaptureVideoUri}
            imageUri={postCaptureBase64 ? `data:${postCaptureMime};base64,${postCaptureBase64}` : null}
            onClose={handlePostCaptureClose}
            onProceedToAnalysis={handlePostCaptureProceed}
          />
        </Suspense>

        <Suspense fallback={null}>
          <CreditPurchaseModal
            visible={creditModalVisible}
            onClose={() => setCreditModalVisible(false)}
          />
        </Suspense>

        <ProcessingBarrier
          visible={processing || autoSaving}
          label={autoSaving ? 'AI 분석 중...' : '처리 중...'}
          sublabel={autoSaveToast ?? undefined}
        />
      </View>
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
            <Suspense fallback={<View style={styles.cameraPlaceholder} />}>
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
            </Suspense>
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

          <Suspense fallback={null}>
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
          </Suspense>

          <Suspense fallback={null}>
            {stereoOverlayVisible && (
              <StereoProgressLightweight progressSV={stereoProgressSV} />
            )}
          </Suspense>

          <Suspense fallback={null}>
            <CreditPurchaseModal
              visible={creditModalVisible}
              onClose={() => setCreditModalVisible(false)}
            />
          </Suspense>
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

        <Suspense fallback={null}>
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
        </Suspense>

        <Suspense fallback={null}>
          {stereoOverlayVisible && (
            <StereoProgressLightweight progressSV={stereoProgressSV} />
          )}
        </Suspense>

        <Suspense fallback={null}>
          <CreditPurchaseModal
            visible={creditModalVisible}
            onClose={() => setCreditModalVisible(false)}
          />
        </Suspense>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  modeSelectContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  modeSelectContent: {
    paddingHorizontal: theme.spacing.md,
  },
  modeCardsWrap: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  modeCard: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  modeCardGradient: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    minHeight: 120,
    justifyContent: 'center',
  },
  modeCardIconWrap: {
    marginBottom: theme.spacing.xs,
  },
  modeCardTitle: {
    fontSize: 20,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#040B1B',
  },
  modeCardDesc: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: 'rgba(4, 11, 27, 0.8)',
    lineHeight: 18,
  },
  modeConfirmWrap: {
    marginTop: theme.spacing.md,
  },
  modeConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary[600],
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  modeConfirmText: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  toneSelectorWrap: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  toneSelectorLabel: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  toneSegmented: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  toneSegment: {
    flex: 1,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    gap: theme.spacing.xs,
  },
  toneSegmentActive: {
    borderColor: theme.colors.gold[400],
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  toneSegmentActiveRaw: {
    borderColor: theme.colors.primary[400],
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
  },
  toneSegmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toneIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toneIconBadgeActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  toneIconBadgeActiveRaw: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
  },
  toneIconBadgeGoldGlow: {
    ...theme.shadows.glowWarning,
  },
  toneIconBadgeBlueGlow: {
    ...theme.shadows.glowPrimary,
  },
  toneSparkleOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  toneSegmentText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  toneSegmentTextActive: {
    color: theme.colors.dark.text,
  },
  toneHintText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 15,
  },
  toneHintTextActive: {
    color: theme.colors.dark.textDim,
  },
  cleanModeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  cleanModeLabel: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  cleanModeSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  cleanModeSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    padding: 2,
  },
  cleanModeSwitchActive: {
    backgroundColor: theme.colors.primary[500],
  },
  cleanModeKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  cleanModeKnobActive: {
    transform: [{ translateX: 20 }],
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    zIndex: 10,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPreviewWrap: {
    flex: 1,
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 12, 0.9)',
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  shutterBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  shutterBtnDisabled: {
    opacity: 0.4,
  },
  shutterBtnCapturing: {
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  galleryBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterHintText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  errorBanner: {
    backgroundColor: theme.colors.error[500] + '20',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error[400],
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  permissionText: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  permissionBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  backToModeBtn: {
    padding: theme.spacing.sm,
  },
  backToModeText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  modeSelectErrorInline: {
    backgroundColor: theme.colors.error[500] + '20',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error[400],
  },
  modeSelectErrorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
});
