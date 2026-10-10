import { useState, useCallback, useRef, useEffect } from 'react';
import { SafeLazyLoad } from '@/components/ErrorBoundary';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ViewStyle,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { compressAndUploadUri } from '@/lib/imageEdit';
import { cleanBase64 } from '@/lib/base64';
import { registerTempFile, unpinTempFile, safeDeleteTempFile } from '@/lib/tempFileManager';
import { compressImageInWorker, isWorkerPoolAvailable } from '@/lib/workerPool';
import { ArrowLeft, Sparkles, RotateCcw } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PlatformModeSelectCard,
  type PlatformMode,
  type OutputMode,
} from '@/components/PlatformModeSelectCard';
import {
  ProductMoodPresetCard,
  type ProductMood,
} from '@/components/ProductMoodPresetCard';
import {
  SourceInputFittingPanel,
  type SourceImage,
} from '@/components/SourceInputFittingPanel';
import {
  GenerationModePanel,
  type GenMode,
} from '@/components/GenerationModePanel';
import { TextureUploader } from '@/components/TextureUploader';
import { PreviewExportTray } from '@/components/PreviewExportTray';
import { VideoGenStepTracker } from '@/components/VideoGenStepTracker';
import { supabase } from '@/lib/supabase';
import { isOnline, useNetworkStatus } from '@/hooks/useNetworkStatus';
import { DraftHistory } from '@/components/DraftHistory';
import { useDraftAutoSave } from '@/hooks/useDraftAutoSave';
import type { DraftEntry } from '@/lib/draftStorage';
import { friendlyError } from '@/lib/errors';
import { logError } from '@/lib/errorLogger';
import { useVideoGen } from '@/hooks/useVideoGen';

const MAX_NATIVE_IMAGE_BYTES = 2_000_000;
const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_INITIAL_DIM = 720;
const UPLOAD_INITIAL_QUALITY = 0.7;
const UPLOAD_TIMEOUT_MS = 30_000;

function isUploadNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout') || msg.includes('abort') || msg.includes('tls') || msg.includes('ssl') || msg.includes('certificate');
  }
  return false;
}

function isPayloadTooLargeError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('413') || msg.includes('payload too large') || msg.includes('entity too large') || msg.includes('request entity too large');
  }
  return false;
}

function isTlsOrProxyError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('tls') || msg.includes('ssl') || msg.includes('certificate') || msg.includes('handshake') || msg.includes('secure connection');
  }
  return false;
}

function withUploadTimeout<T>(uploadPromise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('업로드 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.')),
      timeoutMs,
    );
  });
  return Promise.race([uploadPromise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function compressForUpload(dataUrl: string, maxDim: number, quality: number): Promise<string> {
  if (isWorkerPoolAvailable()) {
    try {
      return await compressImageInWorker(dataUrl, maxDim, quality);
    } catch {
      // fall through to main-thread compression
    }
  }
  const { prepareImageForApi } = await import('@/lib/imageEdit');
  return prepareImageForApi(dataUrl, maxDim, quality);
}

async function uploadImageToStorage(uri: string): Promise<string> {
  // Ghost URI defense: verify the source file exists before any processing.
  if (Platform.OS !== 'web' && !uri.startsWith('data:')) {
    let srcInfo: { exists: boolean } | null = null;
    try {
      srcInfo = await FileSystem.getInfoAsync(uri);
    } catch {
      throw new Error('이미지 파일을 확인할 수 없습니다. 다시 촬영해주세요.');
    }
    if (!srcInfo || !srcInfo.exists) {
      throw new Error('촬영된 이미지가 만료되었거나 삭제되었습니다. 다시 촬영해주세요.');
    }
  }

  // Web path: compress via worker and upload bytes. Base64 is acceptable
  // here because the web JS engine has a much larger heap than Hermes.
  if (Platform.OS === 'web' && uri.startsWith('data:')) {
    const dimSteps = [UPLOAD_INITIAL_DIM, 600, 480, 360];
    const qualitySteps = [UPLOAD_INITIAL_QUALITY, 0.55, 0.42, 0.3];
    for (let pass = 0; pass < dimSteps.length; pass++) {
      const compressed = await compressForUpload(uri, dimSteps[pass], qualitySteps[pass]);
      const byteLen = Math.floor((cleanBase64(compressed).length * 3) / 4);
      if (byteLen <= MAX_NATIVE_IMAGE_BYTES) {
        const finalBase64 = cleanBase64(compressed);
        return await performUpload(finalBase64);
      }
    }
    // If all passes exceeded the cap, use the last compressed result.
    const fallback = await compressForUpload(uri, 360, 0.3);
    return await performUpload(cleanBase64(fallback));
  }

  // Native path: file URI streaming — disk → ImageManipulator (720px WebP
  // quality 0.8) → disk → FileSystem.uploadAsync → server. The image data
  // never enters the JS heap as base64, eliminating the OOM crash that
  // occurs when large base64 strings are held in Hermes memory during the
  // upload + video submit serialization phase.
  if (Platform.OS !== 'web' && !uri.startsWith('data:')) {
    registerTempFile(uri, 'synthesis-upload', { pin: true });
    try {
      // compressAndUploadUri handles 720px resize, WebP 0.8 encoding, and
      // native binary upload in one shot. The compressed temp file is
      // deleted in its finally block. We just need to clean up the source.
      return await compressAndUploadUri(uri, UPLOAD_INITIAL_DIM, 0.8, 'webp');
    } finally {
      unpinTempFile(uri);
      await safeDeleteTempFile(uri).catch(() => {});
    }
  }

  // Native data: URI (rare, from camera base64 fallback) — convert to file
  // first, then use the streaming path.
  if (Platform.OS !== 'web' && uri.startsWith('data:')) {
    const tmpPath = `${FileSystem.cacheDirectory}synth-src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    try {
      const base64Data = cleanBase64(uri);
      await FileSystem.writeAsStringAsync(tmpPath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      registerTempFile(tmpPath, 'synthesis-data-src', { pin: true });
      return await compressAndUploadUri(tmpPath, UPLOAD_INITIAL_DIM, 0.8, 'webp');
    } finally {
      unpinTempFile(tmpPath);
      await safeDeleteTempFile(tmpPath).catch(() => {});
    }
  }

  // Web non-data URI (e.g. http) — return as-is, already remote.
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  throw new Error('지원하지 않는 이미지 형식입니다.');
}

async function performUpload(finalBase64: string): Promise<string> {
  let currentBase64 = finalBase64;
  let currentDim = 540;
  let currentQuality = 0.3;
  const fileName = `synth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const makeBytes = (b64: string) =>
    new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    const bytes = makeBytes(currentBase64);
    try {
      const { uploadBytesToStorage } = await import('@/lib/imageEdit');
      const publicUrl = await withUploadTimeout(
        uploadBytesToStorage(bytes, 'scans', fileName, 'image/jpeg'),
        UPLOAD_TIMEOUT_MS,
      );
      return publicUrl;
    } catch (uploadError) {
      lastError = uploadError instanceof Error ? uploadError : new Error(String(uploadError));

    if (attempt < UPLOAD_MAX_RETRIES && isPayloadTooLargeError(uploadError)) {
      const emergencyDims = [480, 360, 240];
      const emergencyQualities = [0.25, 0.18, 0.12];
      const stepIdx = Math.min(attempt, emergencyDims.length - 1);
      currentDim = emergencyDims[stepIdx];
      currentQuality = emergencyQualities[stepIdx];
      const dataUrl = `data:image/jpeg;base64,${currentBase64}`;
      try {
        const recompressed = await compressForUpload(dataUrl, currentDim, currentQuality);
        currentBase64 = cleanBase64(recompressed);
      } catch {
        // If recompression fails, retry with the same payload
      }
      const backoffDelay = 1000 * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      continue;
    }

    if (attempt < UPLOAD_MAX_RETRIES && isUploadNetworkError(uploadError)) {
      const baseDelay = 1000 * Math.pow(2, attempt);
      const jitter = 0.5 + Math.random() * 0.5;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * jitter));
      continue;
    }
    break;
    }
  }

  if (lastError && isTlsOrProxyError(lastError)) {
    throw new Error('보안 연결에 실패했습니다. Wi-Fi 환경을 변경하거나 VPN/프록시 설정을 확인해 주세요.');
  }

  throw new Error(`이미지 업로드 실패: ${lastError?.message ?? '알 수 없는 오류'}`);
}

function SynthesisScreenInner() {
  const router = useRouter();
  const safeTop = useSafeTop();
  const insets = useSafeAreaInsets();

  const networkStatus = useNetworkStatus();
  const isOffline = networkStatus === 'offline';
  const [platform, setPlatform] = useState<PlatformMode>('shortform');
  const [outputMode, setOutputMode] = useState<OutputMode>('image');
  const [mood, setMood] = useState<ProductMood>('studio_premium');
  const [productImages, setProductImages] = useState<SourceImage[]>([]);
  const [modelImage, setModelImage] = useState<SourceImage | null>(null);
  const [genMode, setGenMode] = useState<GenMode>('auto_3d');
  const [enableOrbit360, setEnableOrbit360] = useState(true);
  const [enableCaustics, setEnableCaustics] = useState(true);
  const [enableVirtualFitting, setEnableVirtualFitting] = useState(true);
  const [enableFabricPhysics, setEnableFabricPhysics] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [cameraSpeed, setCameraSpeed] = useState(1.0);
  const [ttsSyncOffset, setTtsSyncOffset] = useState(0);
  const [captionText, setCaptionText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const scanIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const preUploadCacheRef = useRef<Map<string, string>>(new Map());
  const preUploadInFlightRef = useRef<Set<string>>(new Set());
  const { saveDraftState, loadDraft, clearDraftId } = useDraftAutoSave('synthesis');
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const params = useLocalSearchParams<{ draftId?: string }>();
  const handleResumeDraftRef = useRef<((draft: DraftEntry) => Promise<void>) | null>(null);

  const videoGen = useVideoGen();
  const {
    isGenerating,
    jobId,
    videoProgress,
    resultVideoUrl,
    resultImageUrl,
    error: genError,
    startGeneration,
    clearResult,
    retryFromDB,
  } = videoGen;

  const error = localError ?? genError;
  const setError = (msg: string | null) => setLocalError(msg);
  const setResultImageUrl = (url: string | null) => {
    if (url === null) clearResult();
  };
  const setResultVideoUrl = (_url: string | null) => {
    // Result state is now managed by the global context
  };

  // Auto-load draft from query param (navigated from home screen DraftHistory)
  useEffect(() => {
    if (!params.draftId || resumeDraftId) return;
    (async () => {
      const draftId = params.draftId;
      if (!draftId) return;
      const draft = await loadDraft(draftId);
      if (draft && handleResumeDraftRef.current) {
        await handleResumeDraftRef.current(draft);
      }
    })();
  }, [params.draftId, resumeDraftId, loadDraft]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Warm-up the generate-video edge function on screen mount to avoid cold-start delay.
  useEffect(() => {
    supabase.functions.invoke('generate-video', { body: { mode: 'warmup' } }).catch(() => {});
  }, []);

  // Pre-upload: start uploading images to storage as soon as they're added,
  // so the generate button doesn't wait. Results are cached by source URI.
  useEffect(() => {
    if (!isOnline()) return;
    const allImages: SourceImage[] = [
      ...productImages,
      ...(modelImage ? [modelImage] : []),
    ];
    for (const img of allImages) {
      const uri = img.uri;
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        preUploadCacheRef.current.set(uri, uri);
        continue;
      }
      if (preUploadCacheRef.current.has(uri) || preUploadInFlightRef.current.has(uri)) continue;
      preUploadInFlightRef.current.add(uri);
      uploadImageToStorage(uri)
        .then((url) => {
          if (mountedRef.current) preUploadCacheRef.current.set(uri, url);
        })
        .catch(() => {
          // Silent failure — handleGenerate will retry the upload
        })
        .finally(() => {
          preUploadInFlightRef.current.delete(uri);
        });
    }
  }, [productImages, modelImage]);

  const productInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  const fittingReady = productImages.length >= 3 && !!modelImage;

  const handlePlatformChange = useCallback((mode: PlatformMode) => {
    setPlatform(mode);
    const platformHooks: Record<PlatformMode, string> = {
      shortform: '3초 안에 궁금해지는 훅',
      feed: '스크롤 멈추는 한 줄',
      detail: '구매 욕구 자극 카피',
    };
    setCaptionText(platformHooks[mode]);
  }, []);

  const handleWebProductPick = useCallback(() => {
    if (Platform.OS !== 'web' || !productInputRef.current) return;
    productInputRef.current.click();
  }, []);

  const handleWebModelPick = useCallback(() => {
    if (Platform.OS !== 'web' || !modelInputRef.current) return;
    modelInputRef.current.click();
  }, []);

  const handleNativeProductPick = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('사진 라이브러리 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5 - productImages.length,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const remaining = 5 - productImages.length;
    const angleLabels = ['정면', '좌측', '우측', '후면', '상부'];
    const newImages: SourceImage[] = result.assets.slice(0, remaining).map((asset, i) => ({
      id: `prod-${Date.now()}-${i}`,
      uri: asset.uri,
      angle: angleLabels[productImages.length + i] || `사진 ${productImages.length + i + 1}`,
    }));
    if (newImages.length > 0) setProductImages((prev) => [...prev, ...newImages]);
  }, [productImages.length]);

  const handleNativeModelPick = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('사진 라이브러리 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    setModelImage({ id: `model-${Date.now()}`, uri: result.assets[0].uri });
  }, []);

  const handleProductFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: SourceImage[] = [];
    const remaining = 5 - productImages.length;
    const angleLabels = ['정면', '좌측', '우측', '후면', '상부'];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      newImages.push({
        id: `prod-${Date.now()}-${i}`,
        uri: url,
        angle: angleLabels[productImages.length + i] || `사진 ${productImages.length + i + 1}`,
      });
    }
    if (newImages.length > 0) {
      setProductImages((prev) => {
        const replaced = prev.filter((img) => {
          if (img.uri.startsWith('blob:')) { URL.revokeObjectURL(img.uri); return false; }
          return true;
        });
        return [...replaced, ...newImages];
      });
    }
    e.target.value = '';
  }, [productImages.length]);

  const handleModelFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (modelImage?.uri.startsWith('blob:')) URL.revokeObjectURL(modelImage.uri);
    const url = URL.createObjectURL(file);
    setModelImage({ id: `model-${Date.now()}`, uri: url });
    e.target.value = '';
  }, [modelImage]);

  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const currentUrls = [
      ...productImages.map((img) => img.uri),
      ...(modelImage ? [modelImage.uri] : []),
    ];
    const stale = objectUrlsRef.current.filter((u) => !currentUrls.includes(u));
    stale.forEach((u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
    objectUrlsRef.current = currentUrls;
  }, [productImages, modelImage]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return () => {
      objectUrlsRef.current.forEach((uri) => {
        if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
      });
    };
  }, []);

  // Auto-save draft when images or options change
  useEffect(() => {
    if (productImages.length > 0) {
      saveDraftState({
        imageUris: productImages.map((img) => img.uri),
        angleLabels: productImages.map((img) => img.angle || ''),
        modelImageUri: modelImage?.uri,
        status: isGenerating ? 'generating' : 'editing',
        scanId: scanIdRef.current ?? undefined,
        jobId: jobId ?? undefined,
        resultVideoUrl: resultVideoUrl ?? undefined,
        genMode,
        mood,
        platform,
        uploaded: productImages.some((img) => img.uri.startsWith('http')),
      });
    }
  }, [productImages, modelImage, isGenerating, jobId, resultVideoUrl, genMode, mood, platform, saveDraftState]);

  // Resume a draft — restores images and options
  const handleResumeDraft = useCallback(async (draft: DraftEntry) => {
    // On web, blob: URIs are gone after reload — only https:// URIs survive.
    // On native, file:// URIs may still exist in the app's cache directory.
    const validUris = draft.imageUris.filter((uri) =>
      uri.startsWith('http') ||
      (Platform.OS !== 'web' && uri.startsWith('file://'))
    );
    if (validUris.length === 0) {
      setError('이 작업의 이미지가 만료되었습니다. 다시 촬영해주세요.');
      return;
    }
    const restoredImages: SourceImage[] = validUris.map((uri, i) => ({
      id: `restored-${Date.now()}-${i}`,
      uri,
      angle: draft.angleLabels[i] || `사진 ${i + 1}`,
    }));
    setProductImages(restoredImages);
    if (draft.modelImageUri && (draft.modelImageUri.startsWith('http') || (Platform.OS !== 'web' && draft.modelImageUri.startsWith('file://')))) {
      setModelImage({ id: `restored-model-${Date.now()}`, uri: draft.modelImageUri });
    }
    if (draft.genMode) setGenMode(draft.genMode as GenMode);
    if (draft.mood) setMood(draft.mood as ProductMood);
    if (draft.platform) setPlatform(draft.platform as PlatformMode);
    if (draft.scanId) scanIdRef.current = draft.scanId;
    if (draft.resultVideoUrl) setResultVideoUrl(draft.resultVideoUrl);
    setResumeDraftId(draft.id);
    await loadDraft(draft.id);
  }, [loadDraft]);

  // Keep ref in sync so the boot effect can call handleResumeDraft
  handleResumeDraftRef.current = handleResumeDraft;

  const generateLockRef = useRef(false);
  const handleGenerate = useCallback(async () => {
    if (generateLockRef.current || isGenerating) return;
    generateLockRef.current = true;
    if (productImages.length < 3) {
      setError('제품 사진을 최소 3컷 등록해주세요.');
      generateLockRef.current = false;
      return;
    }
    if (genMode === 'universal_synthesis' && !modelImage) {
      setError('AI 범용 합성 모드에서는 모델 사진이 필요합니다.');
      generateLockRef.current = false;
      return;
    }
    if (!isOnline()) {
      setError('인터넷 연결을 확인해주세요. 네트워크가 연결되지 않아 AI 생성을 시작할 수 없습니다.');
      generateLockRef.current = false;
      return;
    }
    setError(null);

    const modeLabel = genMode === 'auto_3d' ? '입체컷 오토' : genMode === 'universal_synthesis' ? 'AI 범용 합성' : '수동';
    const productName = '프리미엄 추천 상품';
    const aspectRatio = (outputMode === 'video' ? '9:16' : '1:1') as '9:16' | '16:9' | '1:1' | '4:5';
    const promptText = genMode === 'manual' && manualPrompt.trim()
      ? manualPrompt.trim()
      : `Cinematic ${modeLabel} product showcase. ${captionText || '시선 집중! 지금 바로 확인하세요'}`;

    try {
      const totalImages = productImages.length + (modelImage ? 1 : 0);

      // Parallel upload: fire all product images + model image simultaneously
      // via Promise.all. No sequential waiting — every image streams to the
      // storage bucket concurrently, cutting total upload time in half.
      const allImages: { img: SourceImage; idx: number }[] = productImages.map((img, idx) => ({ img, idx }));
      const uploadSingle = async (img: SourceImage): Promise<string> => {
        if (img.uri.startsWith('http://') || img.uri.startsWith('https://')) return img.uri;
        const cached = preUploadCacheRef.current.get(img.uri);
        if (cached) return cached;
        return uploadImageToStorage(img.uri);
      };

      const [productResults, modelResult] = await Promise.all([
        Promise.all(allImages.map(({ img }) => uploadSingle(img))),
        modelImage ? uploadSingle(modelImage) : Promise.resolve(null),
      ]);

      const uploadedUrls = productResults;
      preUploadCacheRef.current.clear();

      const mainUrl = uploadedUrls[0];
      const restUrls = uploadedUrls.slice(1);
      const modelUrl = modelResult;

      // Android OOM defense: now that all uploads are complete and we hold
      // only the remote https URLs, replace the local file:// / data: URIs in
      // React state so the large base64 / file buffers are dereferenced from
      // the JS heap before the video submit request serializes its payload.
      if (Platform.OS !== 'web') {
        setProductImages((prev) =>
          prev.map((img, i) =>
            uploadedUrls[i] && uploadedUrls[i].startsWith('http')
              ? { ...img, uri: uploadedUrls[i] }
              : img,
          ),
        );
        if (modelImage && modelUrl && modelUrl.startsWith('http')) {
          setModelImage({ id: modelImage.id, uri: modelUrl, angle: modelImage.angle });
        }
      }

      await startGeneration({
        promptText,
        aspectRatio,
        productName,
        captionText: captionText || '시선 집중! 지금 바로 확인하세요',
        platform: platform === 'shortform' ? 'shorts' : platform,
        genMode,
        enableOrbit360,
        enableCaustics: genMode === 'auto_3d' ? enableCaustics : undefined,
        orbitSpeed: enableOrbit360 ? cameraSpeed : undefined,
        enableVirtualFitting: genMode === 'universal_synthesis' ? enableVirtualFitting : undefined,
        enableFabricPhysics,
        cameraSpeed,
        mainUrl,
        restUrls,
        modelUrl,
        outputMode,
      });
    } catch (err) {
      if (scanIdRef.current) {
        const orphanedScanId = scanIdRef.current;
        scanIdRef.current = null;
        try { await supabase.from('scans').delete().eq('id', orphanedScanId); } catch {}
      }
      const userMsg = friendlyError(err, '이미지 업로드에 실패했습니다. 네트워크 연결을 확인하고 잠시 후 다시 시도해주세요.');
      logError(err, {
        component: 'synthesis',
        action: 'handleGenerate',
        extra: {
          phase: 'image-upload',
          productImageCount: productImages.length,
          hasModelImage: !!modelImage,
          genMode,
          platform,
        },
      });
      setError(userMsg);
    } finally {
      generateLockRef.current = false;
    }
  }, [productImages, outputMode, genMode, modelImage, enableOrbit360, enableCaustics, enableVirtualFitting, enableFabricPhysics, cameraSpeed, manualPrompt, captionText, platform, isGenerating, startGeneration]);

  const handleDownload = useCallback(() => {
    setIsExporting(true);
    setTimeout(() => { if (mountedRef.current) setIsExporting(false); }, 1000);
  }, []);

  const handleShare = useCallback(() => {
    if (Platform.OS === 'web') {
      Alert.alert('공유', 'SNS 공유 기능이 곧 제공됩니다.');
    }
  }, []);

  const autoDetectedMood: ProductMood | null = productImages.length >= 3 ? mood : null;

  const modeOptions = genMode === 'auto_3d'
    ? [
        {
          key: 'orbit360',
          label: '360° 궤도 회전',
          description: '제품 주위를 회전하는 입체 카메라 무빙',
          enabled: enableOrbit360,
          onToggle: () => setEnableOrbit360((v) => !v),
        },
        {
          key: 'caustics',
          label: '광채 강화',
          description: '보석·금속의 빛 반사와 굴절 효과 극대화',
          enabled: enableCaustics,
          onToggle: () => setEnableCaustics((v) => !v),
        },
      ]
    : genMode === 'universal_synthesis'
    ? [
        {
          key: 'virtualFitting',
          label: '가상 피팅',
          description: '모델에게 제품을 자연스럽게 착용시키는 합성',
          enabled: enableVirtualFitting,
          onToggle: () => setEnableVirtualFitting((v) => !v),
        },
        {
          key: 'fabricPhysics',
          label: '원단 물리 엔진',
          description: '의류 원단의 주름과 흐름을 실사 수준으로 시뮬레이션',
          enabled: enableFabricPhysics,
          onToggle: () => setEnableFabricPhysics((v) => !v),
        },
        {
          key: 'orbit360',
          label: '360° 궤도 회전',
          description: '모델과 의류를 360도 회전하며 앞·옆·뒷모습 실루엣 연출',
          enabled: enableOrbit360,
          onToggle: () => setEnableOrbit360((v) => !v),
        },
      ]
    : [];

  return (
    <View style={styles.container}>
      {/* Hidden file inputs for web */}
      {Platform.OS === 'web' && (
        <>
          <input
            ref={productInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleProductFileChange}
          />
          <input
            ref={modelInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleModelFileChange}
          />
        </>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: safeTop + 12 }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.dark.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Sparkles size={16} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.topTitle}>AI 범용 합성 편집</Text>
        </View>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + theme.spacing.lg }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isGenerating}
      >
        <View pointerEvents={isGenerating ? 'none' : 'auto'}>
        <PlatformModeSelectCard
          platform={platform}
          outputMode={outputMode}
          onPlatformChange={handlePlatformChange}
          onOutputModeChange={setOutputMode}
        />

        <DraftHistory onResume={handleResumeDraft} />

        <ProductMoodPresetCard
          autoDetectedMood={autoDetectedMood}
          mood={mood}
          onMoodChange={setMood}
        />

        <SourceInputFittingPanel
          productImages={productImages}
          modelImage={modelImage}
          onProductImageAdd={setProductImages}
          onModelImageSet={setModelImage}
          fittingReady={fittingReady}
          onWebProductPick={handleWebProductPick}
          onWebModelPick={handleWebModelPick}
          onNativeProductPick={handleNativeProductPick}
          onNativeModelPick={handleNativeModelPick}
        />

        {modelImage?.uri && (
          <TextureUploader
            modelImageUrl={modelImage.uri}
            productName={productImages[0]?.id}
          />
        )}

        <GenerationModePanel
          mode={genMode}
          onModeChange={setGenMode}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          isOffline={isOffline}
          manualPrompt={manualPrompt}
          onManualPromptChange={setManualPrompt}
          cameraSpeed={cameraSpeed}
          onCameraSpeedChange={setCameraSpeed}
          ttsSyncOffset={ttsSyncOffset}
          onTtsSyncOffsetChange={setTtsSyncOffset}
          captionText={captionText}
          onCaptionTextChange={setCaptionText}
          modeOptions={modeOptions}
        />

        <PreviewExportTray
          outputMode={outputMode}
          resultImageUrl={resultImageUrl}
          resultVideoUrl={resultVideoUrl}
          onDownload={handleDownload}
          onShare={handleShare}
          isExporting={isExporting}
        />
        </View>

        {isGenerating && videoProgress && (
          <VideoGenStepTracker progress={videoProgress} variant="inline" />
        )}

        {isGenerating && (
          <View style={styles.navHint}>
            <Text style={styles.navHintText}>
              생성 중에 다른 화면으로 이동할 수 있어요. 완료되면 알림으로 알려드릴게요.
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, isGenerating && styles.retryBtnDisabled]}
              onPress={async () => {
                const recovered = await retryFromDB();
                if (!recovered) handleGenerate();
              }}
              disabled={isGenerating}
              activeOpacity={0.7}
            >
              <RotateCcw size={14} color={isGenerating ? theme.colors.dark.textDim : theme.colors.error[400]} strokeWidth={2} />
              <Text style={[styles.retryBtnText, isGenerating && styles.retryBtnTextDisabled]}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topTitle: {
    fontSize: 17,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonPlaceholder: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  } as ViewStyle,
  errorBanner: {
    backgroundColor: theme.colors.error[500] + '20',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error[400],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    flex: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.error[400] + '15',
  },
  retryBtnDisabled: {
    opacity: 0.4,
  },
  retryBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  retryBtnTextDisabled: {
    color: theme.colors.dark.textDim,
  },
  navHint: {
    backgroundColor: theme.colors.primary[400] + '15',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary[400],
  },
  navHintText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300],
    lineHeight: 17,
  },
});

export default function SynthesisScreen() {
  return (
    <SafeLazyLoad>
      <SynthesisScreenInner />
    </SafeLazyLoad>
  );
}
