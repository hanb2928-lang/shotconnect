import { useRef, useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';
import { Camera, RotateCcw, X, Check, Sparkles, Image as ImageIcon, AlertCircle, ArrowRight, Flame, Gem, Orbit, Layers, Diamond, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { startAsyncAnalysis } from '@/lib/asyncAnalysis';
import { saveManualScan, uploadImage } from '@/lib/analysis';
import { supabase } from '@/lib/supabase';
import { isOnline } from '@/hooks/useNetworkStatus';
import { buildDataUrl, cleanBase64, getMimeTypeFromDataUrl } from '@/lib/base64';
import { prepareImageForApi, compressImageToBase64, extractVideoFrameBase64 } from '@/lib/imageEdit';
import type { MoodFilterType } from '@/lib/imageEdit';
import { friendlyError } from '@/lib/errors';
import { getItem, setItem } from '@/lib/storage';
import { CreditPurchaseModal } from '@/components/CreditPurchaseModal';
import { pickImageWeb, isWebPlatform } from '@/lib/webImagePicker';
import { WebCameraView, type WebCameraHandle } from '@/components/WebCameraView';
import { MultiAngleCaptureGuide, type AngleShot, type AngleGuide } from '@/components/MultiAngleCaptureGuide';
import { TriggerBanner } from '@/components/TriggerBanner';
import { StudioPremiumAccordion, type StudioSliderValues } from '@/components/StudioPremiumPanel';
import { PostCaptureWorkflow } from '@/components/PostCaptureWorkflow';
import type { ShortFormEditPlan } from '@/lib/shortFormEditEngine';
import { runStereoPipeline, createScanFromAngleShots, makeInitialProgress, type StereoPipelineProgress } from '@/lib/stereoPipeline';

async function runFittingPipeline(
  shots: AngleShot[],
  scanId: string,
  customPrompt?: string,
  cleanMode = false,
  studioSliders?: StudioSliderValues,
): Promise<void> {
  const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  const productShot = sorted.find((s) => s.id.startsWith('product')) ?? sorted[0];
  const bgShot = sorted.find((s) => !s.id.startsWith('product')) ?? sorted[sorted.length - 1];
  if (!productShot?.base64 || !bgShot?.base64) return;

  try {
    const { data, error } = await supabase.functions.invoke('virtual-fitting', {
      body: {
        productImage: buildDataUrl(productShot.base64, productShot.mimeType || 'image/jpeg'),
        modelImage: buildDataUrl(bgShot.base64, bgShot.mimeType || 'image/jpeg'),
        customPrompt: customPrompt?.trim() || undefined,
        facetSparkle: studioSliders?.facetSparkle,
        fabricDetail: studioSliders?.fabricDetail,
        blendStrength: studioSliders?.blendStrength,
        smartFit: studioSliders?.smartFit,
      },
    });
    if (error || !data?.image) return;

    const imageUrl = await uploadImage(data.image as string, 'image/png');
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
  }
}

const CAPTURE_TIMEOUT_MS = 15000;
const PICK_TIMEOUT_MS = 20000;
const ANALYSIS_TIMEOUT_MS = 45000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} (시간 초과)`)), ms);
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
  const router = useRouter();
  const safeTop = useSafeTop();
  const tabBarHeight = useTabBarHeight();
  const safeInsets = useSafeAreaInsets();
  const bottomInset = Math.max(safeInsets.bottom, 0);
  const isMountedRef = useRef(true);
  const cameraRef = useRef<CameraView>(null);
  const webCameraRef = useRef<WebCameraHandle>(null);
  const autoSaveStepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSavePulse = useSharedValue(1);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditModalVisible, setCreditModalVisible] = useState(false);
  const [multiAngleVisible, setMultiAngleVisible] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaveToast, setAutoSaveToast] = useState<string | null>(null);
  const [autoSaveStep, setAutoSaveStep] = useState(1);
  const genIdRef = useRef(0);
  const [postCaptureVisible, setPostCaptureVisible] = useState(false);
  const [postCaptureVideoUri, setPostCaptureVideoUri] = useState<string | null>(null);
  const [postCaptureBase64, setPostCaptureBase64] = useState<string | null>(null);
  const [postCaptureMime, setPostCaptureMime] = useState<string>('video/webm');
  const [workflowMountKey, setWorkflowMountKey] = useState(0);
  const [stereoProgress, setStereoProgress] = useState<StereoPipelineProgress>(makeInitialProgress());
  const [stereoOverlayVisible, setStereoOverlayVisible] = useState(false);
  const [screenPhase, setScreenPhase] = useState<ScreenPhase>('mode_select');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('single');
  const [contentTone, setContentTone] = useState<ContentTone>('raw');
  const [cleanMode, setCleanMode] = useState(false);
  const [studioMode, setStudioMode] = useState<PanelMode>(null);
  const [studioSliders, setStudioSliders] = useState<StudioSliderValues>({ facetSparkle: 60, fabricDetail: 45, blendStrength: 70, smartFit: true });

  // Virtual fitting state
  const [fittingGuideVisible, setFittingGuideVisible] = useState(false);

  const postCaptureBase64Ref = useRef<string | null>(null);
  const postCaptureMimeRef = useRef<string>('video/webm');
  const postCaptureVideoUriRef = useRef<string | null>(null);

  useEffect(() => {
    getItem('content_tone').then((saved) => {
      if (saved === 'studio' || saved === 'raw') setContentTone(saved as ContentTone);
    });
  }, []);

  const handleContentToneChange = useCallback((tone: ContentTone) => {
    setContentTone(tone);
    setItem('content_tone', tone);
    if (tone !== 'studio') setStudioMode(null);
  }, []);

  const startAutoSaveAnimation = useCallback(() => {
    setAutoSaveStep(1);
    autoSavePulse.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
      false,
    );
    autoSaveStepTimer.current = setInterval(() => {
      setAutoSaveStep((s) => (s >= 3 ? 3 : s + 1));
    }, 800);
  }, [autoSavePulse]);
  const stopAutoSaveAnimation = useCallback(() => {
    if (autoSaveStepTimer.current) {
      clearInterval(autoSaveStepTimer.current);
      autoSaveStepTimer.current = null;
    }
    autoSavePulse.value = 1;
  }, [autoSavePulse]);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      setIsActive(true);
      return () => {
        isMountedRef.current = false;
        setIsActive(false);
        setCameraReady(false);
        setProcessing(false);
        setAutoSaving(false);
        setPostCaptureVisible(false);
        setPostCaptureVideoUri(null);
        postCaptureVideoUriRef.current = null;
        setPostCaptureBase64(null);
        postCaptureBase64Ref.current = null;
        genIdRef.current += 1;
        stopAutoSaveAnimation();
        cancelAnimation(autoSavePulse);
      };
    }, [stopAutoSaveAnimation, autoSavePulse]),
  );

  const runAutoAnalysis = useCallback(async (base64: string, mimeType: string, additionalB64s: string[] = []) => {
    if (!isOnline()) {
      setError('네트워크 연결을 확인해주세요. 인터넷이 연결되지 않아 AI 분석을 시작할 수 없습니다.');
      return;
    }
    const genId = genIdRef.current;
    setAutoSaving(true);
    setAutoSaveToast(null);
    setError(null);
    startAutoSaveAnimation();
    try {
      const { scanId } = await withTimeout(
        startAsyncAnalysis(base64, mimeType, additionalB64s.length > 0 ? 'multi' : 'single', additionalB64s, contentTone),
        ANALYSIS_TIMEOUT_MS,
        'AI 자동 분석',
      );
      if (genIdRef.current !== genId) return;
      setAutoSaveToast('숏폼 영상이 보관함에 자동 저장되었습니다!');
      setTimeout(() => setAutoSaveToast(null), 3500);
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
      if (genIdRef.current === genId) {
        stopAutoSaveAnimation();
        setAutoSaving(false);
      }
    }
  }, [router, startAutoSaveAnimation, stopAutoSaveAnimation]);

  const handlePostCaptureProceed = useCallback(async (customPrompt: string, _platform: string, _editPlan: ShortFormEditPlan) => {
    setPostCaptureVisible(false);

    const base64 = postCaptureBase64Ref.current;
    const mimeType = postCaptureMimeRef.current;
    const videoUri = postCaptureVideoUriRef.current;

    try {
      if (!base64) {
        if (!videoUri) return;
        const frame = await withTimeout(
          extractVideoFrameBase64(videoUri, 1080, 0.7),
          PICK_TIMEOUT_MS,
          '동영상 프레임 추출',
        );
        const imageUrl = await uploadImage(frame.base64, frame.mimeType);
        const scanId = await saveManualScan(imageUrl);
        router.push({ pathname: '/editor', params: { id: scanId, customPrompt: customPrompt || undefined } });
        return;
      }
      const imageUrl = await uploadImage(base64, mimeType);
      const scanId = await saveManualScan(imageUrl);
      router.push({ pathname: '/editor', params: { id: scanId, customPrompt: customPrompt || undefined } });
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(friendlyError(err, '편집 화면을 여는 중 오류가 발생했습니다. 다시 시도해주세요.'));
    }
  }, [router]);

  const handlePostCaptureClose = useCallback(() => {
    setPostCaptureVisible(false);
    setPostCaptureVideoUri(null);
    postCaptureVideoUriRef.current = null;
    setPostCaptureBase64(null);
    postCaptureBase64Ref.current = null;
  }, []);

  const handleCapture = async () => {
    if (!cameraRef.current || processing || !cameraReady || autoSaving) return;
    setMultiAngleVisible(true);
  };

  const handlePickImage = async () => {
    if (processing || autoSaving) return;

    if (isWebPlatform()) {
      try {
        const images = await withTimeout(pickImageWeb(false, 1), PICK_TIMEOUT_MS, '사진 선택');
        if (images.length === 0) return;
        const compressed = await withTimeout(
          prepareImageForApi(buildDataUrl(cleanBase64(images[0].base64), images[0].mimeType), 1080, 0.7, 'none' as MoodFilterType),
          PICK_TIMEOUT_MS,
          '이미지 압축',
        );
        setPostCaptureBase64(cleanBase64(compressed));
        postCaptureBase64Ref.current = cleanBase64(compressed);
        setPostCaptureMime(getMimeTypeFromDataUrl(compressed));
        postCaptureMimeRef.current = getMimeTypeFromDataUrl(compressed);
        setPostCaptureVideoUri(null);
        postCaptureVideoUriRef.current = null;
        setWorkflowMountKey((k) => k + 1); setPostCaptureVisible(true);
      } catch (err) {
        setError(friendlyError(err, '사진 선택에 실패했습니다. 다시 시도해주세요.'));
      }
      return;
    }

    try {
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
        compressImageToBase64(asset.uri, 1080, 0.7),
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
    }
  };

  const handleMultiAngleComplete = async (shots: AngleShot[]) => {
    const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
    setMultiAngleVisible(false);
    if (!sorted[0]?.base64) return;

    setStereoProgress(makeInitialProgress());
    setStereoOverlayVisible(true);

    let scanId: string;
    try {
      scanId = await createScanFromAngleShots(sorted);
    } catch (err) {
      if (!isMountedRef.current) return;
      setStereoOverlayVisible(false);
      setError(friendlyError(err, '이미지 업로드에 실패했습니다. 다시 시도해주세요.'));
      return;
    }

    if (isMountedRef.current) {
      setStereoOverlayVisible(false);
      router.replace({ pathname: '/result/[id]', params: { id: scanId } });
    }

    // Background: run synthesis/directing/publish pipeline without blocking UI
    runStereoPipeline(sorted, () => {}, cleanMode, scanId, contentTone, studioSliders).catch(() => {});
  };

  const handleMultiAngleCapture = async (_angleId: string): Promise<{ base64: string; mimeType: string } | null> => {
    if (isWebPlatform()) {
      if (webCameraRef.current?.isReady()) {
        try {
          const result = await withTimeout(
            webCameraRef.current.captureFrame(),
            CAPTURE_TIMEOUT_MS,
            '카메라 캡처',
          );
          if (result?.base64) return result;
        } catch {
          // Fall through to file picker
        }
      }
      try {
        const images = await withTimeout(pickImageWeb(false, 1, true), PICK_TIMEOUT_MS, '카메라 캡처');
        if (images.length === 0) return null;
        return { base64: images[0].base64, mimeType: images[0].mimeType };
      } catch {
        return null;
      }
    }
    if (!cameraRef.current || !cameraReady) return null;
    try {
      const photo = await withTimeout(
        cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.7,
          shutterSound: false,
          ...({ mute: true } as Record<string, unknown>),
        }) as Promise<{ base64?: string; uri: string }>,
        CAPTURE_TIMEOUT_MS,
        '다각도 촬영',
      );
      if (!photo?.base64) return null;
      const cleanB64 = cleanBase64(photo.base64);
      const compressedDataUrl = await withTimeout(
        prepareImageForApi(buildDataUrl(cleanB64, 'image/jpeg'), 1080, 0.7, 'none' as MoodFilterType),
        PICK_TIMEOUT_MS,
        '이미지 압축',
      );
      return { base64: cleanBase64(compressedDataUrl), mimeType: getMimeTypeFromDataUrl(compressedDataUrl) };
    } catch {
      return null;
    }
  };

  const handleMultiAnglePick = async (_angleId: string): Promise<{ base64: string; mimeType: string } | null> => {
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
      const result = await withTimeout(
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          base64: false,
          quality: 0.7,
        }),
        PICK_TIMEOUT_MS,
        '사진 선택',
      );
      if (result.canceled || !result.assets?.[0]?.uri) return null;
      const { base64, mimeType } = await withTimeout(
        compressImageToBase64(result.assets[0].uri, 1080, 0.7),
        PICK_TIMEOUT_MS,
        '이미지 압축',
      );
      return { base64, mimeType };
    } catch {
      return null;
    }
  };

  const handleWebCapture = useCallback(async (payload: string, mimeType: string) => {
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
        const compressed = await prepareImageForApi(
          buildDataUrl(cleanBase64(payload), mimeType),
          1080,
          0.7,
          'none' as MoodFilterType,
        );
        const b64 = cleanBase64(compressed);
        const mime = getMimeTypeFromDataUrl(compressed);
        setPostCaptureBase64(b64);
        postCaptureBase64Ref.current = b64;
        setPostCaptureMime(mime);
        postCaptureMimeRef.current = mime;
      } catch {
        setPostCaptureBase64(cleanBase64(payload));
        postCaptureBase64Ref.current = cleanBase64(payload);
        setPostCaptureMime(mimeType);
        postCaptureMimeRef.current = mimeType;
      }
      setPostCaptureVideoUri(null);
      postCaptureVideoUriRef.current = null;
    }
    setWorkflowMountKey((k) => k + 1); setPostCaptureVisible(true);
  }, []);

  // ─── Fitting multi-angle capture (reuses stereo-cut handlers) ───
  const handleFittingPickImage = async () => {
    if (stereoOverlayVisible) return;
    setFittingGuideVisible(true);
  };

  const handleFittingWebCapture = useCallback(async (payload: string, mimeType: string) => {
    if (mimeType.startsWith('video/')) return;
    setFittingGuideVisible(true);
  }, []);

  // ─── Virtual fitting: complete multi-angle guide (async, same pattern as 입체컷 오토) ───
  const handleFittingGuideComplete = useCallback(async (shots: AngleShot[]) => {
    const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
    setFittingGuideVisible(false);
    if (sorted.length < 2) return;

    setStereoProgress(makeInitialProgress());
    setStereoOverlayVisible(true);
    setError(null);

    let scanId: string;
    try {
      scanId = await createScanFromAngleShots(sorted);
    } catch (err) {
      if (!isMountedRef.current) return;
      setStereoOverlayVisible(false);
      setError(friendlyError(err, '이미지 업로드에 실패했습니다. 다시 시도해주세요.'));
      return;
    }

    if (isMountedRef.current) {
      setStereoOverlayVisible(false);
      router.replace({ pathname: '/result/[id]', params: { id: scanId } });
    }

    // Background: run virtual fitting pipeline without blocking UI
    runFittingPipeline(sorted, scanId, undefined, cleanMode, studioSliders).catch(() => {});
  }, [router, cleanMode, studioSliders]);

  const handleModeSelect = useCallback((mode: CaptureMode) => {
    setCaptureMode(mode);
    setError(null);
    setStudioMode(null);
    if (mode === 'single') {
      setScreenPhase('camera');
    } else if (mode === 'fitting') {
      setCameraReady(false);
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
      <ScrollView style={styles.modeSelectContainer} contentContainerStyle={styles.modeSelectContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.modeSelectHeader, { paddingTop: safeTop + theme.spacing.lg }]}>
          <View style={{ width: 80 }} />
          <View style={{ flex: 1 }} />
          <View style={{ width: 80 }} />
        </View>

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

        <StudioPremiumAccordion
          visible={contentTone === 'studio' && studioMode !== null}
          mode={studioMode === 'ai-blend' ? 'ai-blend' : 'auto-3d'}
          onValuesChange={(values) => setStudioSliders((prev) => ({ ...prev, ...values }))}
        />

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
                화장품 · 주얼리 · 패션 · 전자기기 · 홈데코 · 럭셔리 식품
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
                생활용품 · 식품 · 가성비 전자기기 · 패션 액세서리 · 다이어트
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cleanModeWrap}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cleanModeLabel}>✨ 클린 모드 (자막·문구 제외)</Text>
            <Text style={styles.cleanModeSub}>체크 시 훅, 자막, 마케팅 문구를 생성하지 않고 순수 영상/이미지 원본만 추출합니다</Text>
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
              onPress={() => { setCameraReady(false); setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
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
              onCameraReady={setCameraReady}
              simplified
            />
          </View>

          <View style={[styles.bottomBar, { paddingBottom: theme.spacing.sm }]}>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <View style={styles.shutterRow}>
              <TouchableOpacity
                style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, stereoOverlayVisible && styles.shutterBtnCapturing]}
                onPress={() => setFittingGuideVisible(true)}
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
            onClose={() => setFittingGuideVisible(false)}
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
            onPress={() => setFittingGuideVisible(true)}
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
            onPress={() => { setScreenPhase('mode_select'); setError(null); setCameraReady(false); }}
            activeOpacity={0.7}
          >
            <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => { setCameraReady(false); setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
            activeOpacity={0.7}
          >
            <RotateCcw size={20} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.cameraPreviewWrap}>
          {isActive ? (
            <CameraView
              ref={cameraRef}
              style={styles.cameraPreview}
              facing={facing}
              onCameraReady={() => setCameraReady(true)}
              mode="video"
            />
          ) : (
            <View style={[styles.cameraPreview, styles.cameraPlaceholder]}>
              <Camera size={36} color={theme.colors.dark.textDim} strokeWidth={1.5} />
            </View>
          )}
        </View>

        <View style={[styles.bottomBar, { paddingBottom: theme.spacing.sm }]}>
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.shutterRow}>
            <TouchableOpacity
              style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, stereoOverlayVisible && styles.shutterBtnCapturing]}
              onPress={() => setFittingGuideVisible(true)}
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
          onClose={() => setFittingGuideVisible(false)}
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
            onPress={() => { setCameraReady(false); setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
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
            onMultiAnglePress={() => setMultiAngleVisible(true)}
            onCameraReady={setCameraReady}
            simplified
          />
        </View>

        <View style={[styles.bottomBar, { paddingBottom: theme.spacing.sm }]}>
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.shutterRow}>
            <TouchableOpacity
              style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, (processing || autoSaving) && styles.shutterBtnCapturing]}
              onPress={() => setMultiAngleVisible(true)}
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
          onClose={() => setMultiAngleVisible(false)}
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
          onPress={() => { setScreenPhase('mode_select'); setError(null); setCameraReady(false); }}
          activeOpacity={0.7}
        >
          <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => { setCameraReady(false); setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
          activeOpacity={0.7}
        >
          <RotateCcw size={20} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Camera Preview */}
      <View style={styles.cameraPreviewWrap}>
        {isActive ? (
          <CameraView
            ref={cameraRef}
            style={styles.cameraPreview}
            facing={facing}
            onCameraReady={() => setCameraReady(true)}
            mode="video"
          />
        ) : (
          <View style={[styles.cameraPreview, styles.cameraPlaceholder]}>
            <Camera size={36} color={theme.colors.dark.textDim} strokeWidth={1.5} />
          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: theme.spacing.sm }]}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <View style={styles.shutterRow}>
          <TouchableOpacity
            style={[styles.shutterBtn, !cameraReady && styles.shutterBtnDisabled, (processing || autoSaving) && styles.shutterBtnCapturing]}
            onPress={() => setMultiAngleVisible(true)}
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

      {/* Multi-Angle Capture Guide */}
      <MultiAngleCaptureGuide
        visible={multiAngleVisible}
        onClose={() => setMultiAngleVisible(false)}
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
            <Animated.View style={{ transform: [{ scale: autoSavePulse }] }}>
              <Sparkles size={28} color={theme.colors.primary[400]} strokeWidth={2} />
            </Animated.View>
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
              <Animated.View style={{ transform: [{ scale: 1 }] }}>
                <Sparkles size={28} color={theme.colors.primary[400]} strokeWidth={2} />
              </Animated.View>
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
        <Text style={styles.modeCardTitle}>{title}</Text>
        <Text style={styles.modeCardDesc}>{desc}</Text>
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
  modeSelectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 0,
  },
  modeCardTextWrap: {
    flex: 1,
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
