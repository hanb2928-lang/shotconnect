import { useState, useCallback, useRef, useEffect } from 'react';
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
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { compressDataUrlToMaxBytes } from '@/lib/imageEdit';
import { cleanBase64 } from '@/lib/base64';
import { registerTempFile, unpinTempFile, safeDeleteTempFile } from '@/lib/tempFileManager';
import { compressImageInWorker, isWorkerPoolAvailable } from '@/lib/workerPool';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
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
import { PreviewExportTray } from '@/components/PreviewExportTray';
import { submitVideoJobAsync, type VideoGenProgress } from '@/lib/aiVideoPipeline';
import { isOnline, useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useResultPolling } from '@/hooks/useResultPolling';
import { VideoGenStepTracker } from '@/components/VideoGenStepTracker';
import { supabase } from '@/lib/supabase';
import { notifyVideoCompleted } from '@/lib/pushNotify';
import { useBeforeUnloadGuard } from '@/hooks/useBeforeUnloadGuard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ProcessingBarrier } from '@/components/ProcessingBarrier';
import { MotionPreviewOverlay } from '@/components/MotionPreviewOverlay';
import { DraftHistory } from '@/components/DraftHistory';
import { useDraftAutoSave } from '@/hooks/useDraftAutoSave';
import type { DraftEntry } from '@/lib/draftStorage';
import { getActiveVideoJob, clearActiveVideoJob, saveActiveVideoJob } from '@/lib/videoJobPersistence';
import { AppState, type AppStateStatus } from 'react-native';

const MAX_NATIVE_IMAGE_BYTES = 2_000_000;
const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_INITIAL_DIM = 720;
const UPLOAD_INITIAL_QUALITY = 0.7;

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

  // Pin the source URI so the TTL sweep cannot delete it mid-upload.
  // On native, file:// URIs from the camera are in the temp cache and can
  // be collected by sweepTempFiles if the upload takes longer than the TTL.
  if (Platform.OS !== 'web' && !uri.startsWith('data:')) {
    registerTempFile(uri, 'synthesis-upload', { pin: true });
  }

  try {
    // 720px normalization + 2MB hard cap via iterative compression.
    // On web, compression runs in a Web Worker so the UI thread stays free.
    let compressedUri = uri;
    const dimSteps = [UPLOAD_INITIAL_DIM, 600, 480, 360];
    const qualitySteps = [UPLOAD_INITIAL_QUALITY, 0.55, 0.42, 0.3];

    for (let pass = 0; pass < dimSteps.length; pass++) {
      if (Platform.OS === 'web' && uri.startsWith('data:')) {
        // Web data URL: compress via worker (or main-thread fallback)
        const compressed = await compressForUpload(uri, dimSteps[pass], qualitySteps[pass]);
        const byteLen = Math.floor((cleanBase64(compressed).length * 3) / 4);
        if (byteLen <= MAX_NATIVE_IMAGE_BYTES) {
          const finalBase64 = cleanBase64(compressed);
          return await performUpload(finalBase64);
        }
        continue;
      }
      const manipulated = await ImageManipulator.manipulateAsync(
        compressedUri,
        [{ resize: { width: dimSteps[pass] } }],
        { compress: qualitySteps[pass], format: ImageManipulator.SaveFormat.JPEG },
      );
      compressedUri = manipulated.uri;
      const fileInfo = await FileSystem.getInfoAsync(compressedUri);
      if (fileInfo.exists && fileInfo.size <= MAX_NATIVE_IMAGE_BYTES) break;
    }

    const fileInfo = await FileSystem.getInfoAsync(compressedUri);
    if (!fileInfo.exists) throw new Error('이미지 파일을 찾을 수 없습니다.');

    const base64 = await FileSystem.readAsStringAsync(compressedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Enforce 2MB payload via iterative data-URL compression
    let finalBase64 = base64;
    const payloadBytes = Math.floor((base64.length * 3) / 4);
    if (payloadBytes > MAX_NATIVE_IMAGE_BYTES) {
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      const compressed = await compressDataUrlToMaxBytes(dataUrl, MAX_NATIVE_IMAGE_BYTES, 540, 0.3);
      finalBase64 = cleanBase64(compressed);
    }

    return await performUpload(finalBase64);
  } finally {
    // Release the pin so the temp file can be cleaned up after upload
    if (Platform.OS !== 'web' && !uri.startsWith('data:')) {
      unpinTempFile(uri);
      await safeDeleteTempFile(uri).catch(() => {});
    }
  }
}

async function performUpload(finalBase64: string): Promise<string> {
  const makeBytes = (b64: string) => Platform.OS === 'web'
    ? new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' })
    : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  let currentBase64 = finalBase64;
  let currentDim = 540;
  let currentQuality = 0.3;
  const fileName = `synth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    const bytes = makeBytes(currentBase64);
    const { error: uploadError } = await supabase.storage
      .from('scans')
      .upload(fileName, bytes, { contentType: 'image/jpeg', cacheControl: '360000' });

    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('scans').getPublicUrl(fileName);
      return urlData.publicUrl;
    }

    lastError = uploadError instanceof Error ? uploadError : new Error(String(uploadError));

    // N-002: On 413 Payload Too Large, attempt emergency recompression
    // before retrying — shrink dimensions and quality further.
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
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    // N-001 / N-003: On network/TLS/SSL errors, exponential backoff with jitter
    if (attempt < UPLOAD_MAX_RETRIES && isUploadNetworkError(uploadError)) {
      const baseDelay = 1000 * Math.pow(2, attempt);
      const jitter = 0.5 + Math.random() * 0.5;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * jitter));
      continue;
    }
    break;
  }

  // N-003: Provide a user-friendly hint for TLS/proxy/firewall failures
  if (lastError && isTlsOrProxyError(lastError)) {
    throw new Error('보안 연결에 실패했습니다. Wi-Fi 환경을 변경하거나 VPN/프록시 설정을 확인해 주세요.');
  }

  throw new Error(`이미지 업로드 실패: ${lastError?.message ?? '알 수 없는 오류'}`);
}

export default function SynthesisScreen() {
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [manualPrompt, setManualPrompt] = useState('');
  const [cameraSpeed, setCameraSpeed] = useState(1.0);
  const [ttsSyncOffset, setTtsSyncOffset] = useState(0);
  const [captionText, setCaptionText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<VideoGenProgress | null>(null);
  const scanIdRef = useRef<string | null>(null);
  const genStartRef = useRef<number>(0);
  const progressMsgRef = useRef<string>('');
  const mountedRef = useRef(true);
  const { saveDraftState, loadDraft, clearDraftId } = useDraftAutoSave('synthesis');
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const params = useLocalSearchParams<{ draftId?: string }>();
  const [jobId, setJobId] = useState<string | null>(null);
  const handleResumeDraftRef = useRef<((draft: DraftEntry) => Promise<void>) | null>(null);

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

  useBeforeUnloadGuard(isGenerating || isExporting);

  useEffect(() => {
    const tag = 'synthesis-generating';
    if (isGenerating || isExporting) {
      activateKeepAwakeAsync(tag).catch(() => {});
    } else {
      deactivateKeepAwake(tag).catch(() => {});
    }
    return () => { deactivateKeepAwake(tag).catch(() => {}); };
  }, [isGenerating, isExporting]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

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

  // Restore jobId from persistent storage after OS cold-start kill
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await getActiveVideoJob();
      if (cancelled || !active || !active.jobId) return;
      // Verify the job still exists in the DB before resuming polling
      try {
        const { data, error } = await supabase
          .from('video_jobs')
          .select('status')
          .eq('id', active.jobId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          clearActiveVideoJob();
          return;
        }
        const status = (data as { status: string }).status;
        if (status === 'SUCCESS' || status === 'FAILED') {
          clearActiveVideoJob();
          return;
        }
        // Job is still in-progress — restore it so polling resumes
        setJobId(active.jobId);
        setIsGenerating(true);
        setVideoProgress({ phase: 'generating', progress: 0.5, message: '이전 생성 작업을 복구하는 중...', elapsedSec: 0 });
      } catch {
        // DB unreachable — don't resume, user can retry manually
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Force-sync job status from DB when app returns to foreground after OS kill
  useEffect(() => {
    if (!jobId) return;
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      (async () => {
        try {
          const { data, error } = await supabase
            .from('video_jobs')
            .select('status, video_url, error_message')
            .eq('id', jobId)
            .maybeSingle();
          if (error || !data) return;
          const row = data as { status: string; video_url: string | null; error_message: string | null };
          if (row.status === 'SUCCESS' && row.video_url) {
            clearActiveVideoJob();
            jobIdRef.current = null;
            setJobId(null);
            setIsGenerating(false);
            setResultVideoUrl(row.video_url);
            setVideoProgress({ phase: 'completed', progress: 1.0, message: '영상 생성 완료', elapsedSec: 0 });
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

  const generateLockRef = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  const handleGenerate = useCallback(async () => {
    if (generateLockRef.current) return;
    generateLockRef.current = true;
    if (isGenerating || jobIdRef.current) { generateLockRef.current = false; return; }
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
    setIsGenerating(true);
    setResultImageUrl(null);
    setResultVideoUrl(null);
    setVideoProgress({ phase: 'submitting', progress: 0.05, message: '준비 중...', elapsedSec: 0 });
    genStartRef.current = Date.now();

    const modeLabel = genMode === 'auto_3d' ? '입체컷 오토' : genMode === 'universal_synthesis' ? 'AI 범용 합성' : '수동';

    const productName = '프리미엄 추천 상품';
    const aspectRatio = (outputMode === 'video' ? '9:16' : '1:1') as '9:16' | '16:9' | '1:1' | '4:5';
    const promptText = genMode === 'manual' && manualPrompt.trim()
      ? manualPrompt.trim()
      : `Cinematic ${modeLabel} product showcase. ${captionText || '시선 집중! 지금 바로 확인하세요'}`;

    try {
      setVideoProgress({ phase: 'submitting', progress: 0.06, message: '이미지 업로드 중...', elapsedSec: 0 });

      const uploadSingle = async (img: SourceImage): Promise<string> => {
        if (img.uri.startsWith('http://') || img.uri.startsWith('https://')) return img.uri;
        return uploadImageToStorage(img.uri);
      };

      // Sequential upload to prevent memory spikes (OOM) and respect server
      // payload limits — each image is compressed, read, and uploaded one at
      // a time so peak memory stays bounded to a single image's data.
      const uploadedUrls: string[] = [];
      for (const img of productImages) {
        const url = await uploadSingle(img);
        uploadedUrls.push(url);
      }
      const mainUrl = uploadedUrls[0];
      const restUrls = uploadedUrls.slice(1);
      const modelUrl = modelImage ? await uploadSingle(modelImage) : null;

      if (!mountedRef.current) return;
      setVideoProgress({ phase: 'submitting', progress: 0.08, message: 'AI 렌더링 요청 전송 중...', elapsedSec: 0 });

      const { data: scanData, error: scanError } = await supabase
        .from('scans')
        .insert({
          image_url: mainUrl,
          scan_source: 'multi',
          product_name: productName,
          additional_image_urls: restUrls,
        })
        .select('id')
        .single();

      if (scanError || !scanData) {
        throw new Error('스캔 레코드 생성에 실패했습니다.');
      }
      scanIdRef.current = scanData.id;

      if (!mountedRef.current) return;

      const submitResult = await submitVideoJobAsync(promptText, {
        durationSec: 5,
        aspectRatio,
        productName,
        scanId: scanData.id,
        captionText: captionText || '시선 집중! 지금 바로 확인하세요',
        platform: platform === 'shortform' ? 'shorts' : platform,
        isCleanVideoMode: genMode === 'auto_3d',
        selectedMode: genMode,
        enableOrbit360,
        enableCaustics: genMode === 'auto_3d' ? enableCaustics : undefined,
        orbitSpeed: enableOrbit360 ? cameraSpeed : undefined,
        enableVirtualFitting: genMode === 'universal_synthesis' ? enableVirtualFitting : undefined,
        enableFabricPhysics,
        draft: true,
      });
      if (!mountedRef.current) return;
      jobIdRef.current = submitResult.taskId;
      setJobId(submitResult.taskId);
      await saveActiveVideoJob(submitResult.taskId, 'submitting');
      setVideoProgress({ phase: 'generating', progress: 0.12, message: 'AI가 영상을 렌더링하고 있어요...', elapsedSec: 0 });
    } catch (err) {
      if (!mountedRef.current) return;
      jobIdRef.current = null;
      setIsGenerating(false);
      setVideoProgress(null);
      setError(err instanceof Error ? err.message : 'AI 영상 생성 요청에 실패했습니다.');
    } finally {
      generateLockRef.current = false;
    }
  }, [productImages, outputMode, genMode, modelImage, enableOrbit360, enableCaustics, enableVirtualFitting, enableFabricPhysics, cameraSpeed, manualPrompt, captionText, platform, isGenerating]);

  const polling = useResultPolling(jobId, {
    scanId: scanIdRef.current,
    onCompleted: (videoUrl) => {
      if (!mountedRef.current) return;
      jobIdRef.current = null;
      setIsGenerating(false);
      clearActiveVideoJob();
      setVideoProgress((prev) => prev ? { ...prev, phase: 'completed', progress: 1.0, message: '영상 생성 완료' } : null);
      if (outputMode === 'image') {
        setResultImageUrl(videoUrl);
      } else {
        setResultVideoUrl(videoUrl);
      }
      notifyVideoCompleted();
    },
    onError: (errMsg) => {
      if (!mountedRef.current) return;
      jobIdRef.current = null;
      setIsGenerating(false);
      clearActiveVideoJob();
      setVideoProgress((prev) => prev ? { ...prev, phase: 'error', progress: 0, message: errMsg } : null);
      setError(errMsg);
    },
  });

  progressMsgRef.current = polling.progressMessage;

  useEffect(() => {
    if (!isGenerating) return;
    const GEN_TIMEOUT_MS = 300_000;
    const timer = setInterval(() => {
      if (!mountedRef.current) return;
      const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
      setVideoProgress((prev) => {
        if (!prev) return prev;
        const msg = progressMsgRef.current;
        const pctMatch = msg?.match(/\((\d+)%\)/);
        const parsed = pctMatch ? parseInt(pctMatch[1], 10) : NaN;
        const polledProgress = !isNaN(parsed) ? parsed / 100 : null;
        const baseProgress = prev.progress;
        const timeBasedProgress = Math.min(0.9, 0.12 + elapsed * 0.005);
        const nextProgress = polledProgress ?? Math.max(baseProgress, timeBasedProgress);
        return { ...prev, message: msg || prev.message, elapsedSec: elapsed, progress: nextProgress };
      });
    }, 1000);
    const timeout = setTimeout(() => {
      if (!mountedRef.current) return;
      jobIdRef.current = null;
      setIsGenerating(false);
      setVideoProgress(null);
      setError('영상 생성 시간이 초과되었습니다. 서버에서 계속 렌더링 중일 수 있어요. 잠시 후 작업 목록에서 완성된 영상을 확인할 수 있습니다.');
    }, GEN_TIMEOUT_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [isGenerating]);

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
      >
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

        {isGenerating && videoProgress && (
          <VideoGenStepTracker progress={videoProgress} variant="inline" />
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {isGenerating && productImages.length >= 2 ? (
        <MotionPreviewOverlay
          visible={isGenerating}
          images={productImages.map((img) => img.uri)}
          label="AI 영상 생성 중"
          progressMessage={videoProgress?.message ?? '촬영하신 이미지로 모션을 만들고 있어요'}
          progress={videoProgress?.progress ?? 0}
        />
      ) : (
        <ProcessingBarrier
          visible={isGenerating || isExporting}
          label={isExporting ? '내보내는 중...' : 'AI 생성 중...'}
          sublabel={videoProgress?.message ?? '완료될 때까지 화면이 잠겨 있어요'}
        />
      )}
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
  },
  errorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
});
