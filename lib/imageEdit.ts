import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Image as RNImage, AppState, type AppStateStatus } from 'react-native';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { base64ToUint8Array, cleanBase64 } from '@/lib/base64';
import { safeFetch } from '@/lib/apiClient';
import { isLowEndDevice } from '@/lib/devicePerformance';
import { withFileLock } from '@/lib/fileLock';
import { mediaCacheKey, mediaCacheGet, mediaCacheSet } from '@/lib/mediaCache';
import { registerTempFile, safeDeleteTempFile, unpinTempFile, unregisterTempFile } from '@/lib/tempFileManager';
import { compressImageInWorker, isWorkerPoolAvailable } from '@/lib/workerPool';
import { analyzeAndDownscaleImage, withFileSettle, waitForFileChannelFlush } from '@/lib/smartResize';
import { runProactiveFlush, getHeapUsageRatio } from '@/lib/proactiveMemoryFlush';

export async function rotateImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ rotate: 90 }]);
  return result.uri;
}

export async function flipImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ flip: ImageManipulator.FlipType.Horizontal }]);
  return result.uri;
}

export async function cropImage(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [
    {
      crop: {
        originX: Math.round(crop.originX),
        originY: Math.round(crop.originY),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      },
    },
  ]);
  return result.uri;
}

export async function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const img = new (global as unknown as { Image: typeof Image }).Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('이미지 크기를 불러올 수 없습니다'));
      img.src = uri;
    });
  }
  // Android native: RNImage.getSize with data: URLs can silently hang.
  // Use a timeout wrapper and fall back to a default size for data URLs.
  if (uri.startsWith('data:')) {
    // ImageManipulator will handle resize regardless of source dimensions;
    // return a large value so the resize logic kicks in.
    return { width: 4096, height: 4096 };
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('이미지 크기 로딩 시간 초과'));
    }, 8000);
    RNImage.getSize(
      uri,
      (width, height) => { clearTimeout(timer); resolve({ width, height }); },
      () => { clearTimeout(timer); reject(new Error('이미지 크기를 불러올 수 없습니다')); },
    );
  });
}

export async function removeBackground(
  imageDataUrl: string,
  mimeType: string,
  userMaskDataUrl?: string,
): Promise<string> {
  const functionUrl = `${supabaseUrl}/functions/v1/remove-bg`;
  const response = await safeFetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ imageDataUrl, mimeType, userMaskDataUrl }),
    timeoutMs: 115000,
  });

  try {
    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: '배경 제거 서버 오류가 발생했습니다.' }));
      throw new Error(errData.error || `배경 제거 실패 (${response.status})`);
    }

    const data = await response.json().catch(() => ({}));
    if (data?.error) throw new Error(data.error);

    if (data?.imageUrl) {
      return data.imageUrl;
    }

    // Fallback for older deployments still returning base64
    const base64 = cleanBase64(data?.imageBase64 ?? '');
    if (!base64) {
      throw new Error('배경 제거 응답에 이미지 데이터가 없습니다.');
    }
    return `data:${data?.mimeType || 'image/png'};base64,${base64}`;
  } finally {
    if (response.body) response.body.cancel().catch(() => {});
  }
}

export function base64ToBlob(base64: string, mimeType: string): Blob | Uint8Array {
  const bytes = base64ToUint8Array(base64);
  if (Platform.OS !== 'web') {
    return bytes;
  }
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
}

export async function compressImage(uri: string, maxWidth = 720, quality = 0.8): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export const STANDARD_MAX_DIMENSION = 720;
export const STANDARD_QUALITY = 0.8;
export const UPLOAD_MAX_DIMENSION = 720;
export const UPLOAD_QUALITY = 0.8;
const CAPTURE_MAX_DIMENSION = 720;
const CAPTURE_QUALITY = 0.8;
const MAX_NATIVE_IMAGE_BYTES = 12_000_000;
export const UPLOAD_MAX_PAYLOAD_BYTES = 2_000_000;

function dataUrlByteLength(dataUrl: string): number {
  const b64 = cleanBase64(dataUrl);
  return Math.floor((b64.length * 3) / 4);
}

export async function compressDataUrlToMaxBytes(
  dataUrl: string,
  maxBytes: number,
  initialMaxDimension = UPLOAD_MAX_DIMENSION,
  initialQuality = UPLOAD_QUALITY,
): Promise<string> {
  let current = dataUrl;
  const dimSteps = [initialMaxDimension, 600, 480, 360];
  const qualitySteps = [initialQuality, 0.65, 0.5, 0.35];

  for (let pass = 0; pass < dimSteps.length; pass++) {
    const dim = dimSteps[pass];
    const qual = qualitySteps[pass];
    try {
      current = await prepareImageForApi(current, dim, qual);
    } catch {
      // keep previous result
    }
    if (dataUrlByteLength(current) <= maxBytes) return current;
  }

  // Last resort: re-compress from original at smallest settings
  try {
    current = await prepareImageForApi(dataUrl, dimSteps[dimSteps.length - 1], qualitySteps[qualitySteps.length - 1]);
  } catch {
    // give up
  }
  return current;
}

function assertNativeImageSize(size: number | undefined): void {
  if (Platform.OS !== 'web' && size !== undefined && size > MAX_NATIVE_IMAGE_BYTES) {
    throw new Error('이미지가 너무 커서 안전하게 처리할 수 없습니다. 더 낮은 해상도로 다시 촬영해주세요.');
  }
}

function assertNativeBase64Size(base64: string): void {
  if (Platform.OS !== 'web' && base64.length > MAX_NATIVE_IMAGE_BYTES * 1.4) {
    throw new Error('이미지 데이터가 너무 커서 안전하게 처리할 수 없습니다. 다시 촬영해주세요.');
  }
}

export async function compressCaptureFrameToBlob(
  base64: string,
  mimeType: string,
): Promise<{ blob: Blob | Uint8Array; base64: string; mimeType: string }> {
  assertNativeBase64Size(base64);
  const dataUrl = `data:${mimeType};base64,${base64}`;
  try {
    const compressed = await prepareImageForApi(dataUrl, CAPTURE_MAX_DIMENSION, CAPTURE_QUALITY);
    const compressedMime = compressed.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
    const compressedBase64 = cleanBase64(compressed);
    const blob = base64ToBlob(compressedBase64, compressedMime);
    return { blob, base64: compressedBase64, mimeType: compressedMime };
  } catch {
    const blob = base64ToBlob(base64, mimeType);
    return { blob, base64, mimeType };
  }
}

export async function compressBase64ForUpload(
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mimeType: string }> {
  assertNativeBase64Size(base64);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const applyCap = (compressed: string): { base64: string; mimeType: string } => {
    const compressedMime = compressed.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
    const b64 = cleanBase64(compressed);
    return { base64: b64, mimeType: compressedMime };
  };

  if (Platform.OS === 'web') {
    try {
      let compressed = await prepareImageForApi(dataUrl, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      if (dataUrlByteLength(compressed) > UPLOAD_MAX_PAYLOAD_BYTES) {
        compressed = await compressDataUrlToMaxBytes(dataUrl, UPLOAD_MAX_PAYLOAD_BYTES, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      }
      return applyCap(compressed);
    } catch {
      return { base64, mimeType };
    }
  }

  try {
    let compressed = await prepareImageForApi(dataUrl, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
    if (dataUrlByteLength(compressed) > UPLOAD_MAX_PAYLOAD_BYTES) {
      compressed = await compressDataUrlToMaxBytes(dataUrl, UPLOAD_MAX_PAYLOAD_BYTES, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
    }
    return applyCap(compressed);
  } catch {
    return { base64, mimeType };
  }
}

const NATIVE_URI_COPY_TIMEOUT_MS = 60_000;
const NATIVE_READ_TIMEOUT_MS = 30_000;

let nativeCopyInProgress = false;
const nativeCopyQueue: Array<() => void> = [];

function releaseNativeCopySlot(): void {
  const next = nativeCopyQueue.shift();
  if (next) next();
  else nativeCopyInProgress = false;
}

async function acquireNativeCopySlot(): Promise<() => void> {
  if (!nativeCopyInProgress) {
    nativeCopyInProgress = true;
    return releaseNativeCopySlot;
  }
  return new Promise((resolve) => {
    nativeCopyQueue.push(() => {
      nativeCopyInProgress = true;
      resolve(releaseNativeCopySlot);
    });
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} (시간 초과)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createBackgroundAbort(): AbortController | null {
  if (Platform.OS === 'web') return null;
  const controller = new AbortController();
  let listener: { remove: () => void } | null = null;
  const handler = (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      controller.abort();
      listener?.remove();
      listener = null;
    }
  };
  listener = AppState.addEventListener('change', handler);
  // Auto-cleanup if the controller is never explicitly aborted
  const originalAbort = controller.abort.bind(controller);
  controller.abort = () => {
    listener?.remove();
    listener = null;
    originalAbort();
  };
  return controller;
}

async function validateCopiedFile(path: string): Promise<void> {
  let info: { exists: boolean; size?: number } | null = null;
  try {
    info = await FileSystem.getInfoAsync(path);
  } catch {
    throw new Error('지원하지 않거나 손상된 파일입니다.');
  }
  if (!info || !info.exists) {
    throw new Error('지원하지 않거나 손상된 파일입니다.');
  }
  if (info.size === undefined || info.size <= 0) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    throw new Error('지원하지 않거나 손상된 파일입니다.');
  }
}

async function makeReadableNativeUri(uri: string): Promise<{ uri: string; temporary: boolean }> {
  if (Platform.OS === 'web') return { uri, temporary: false };
  const appCacheDir = FileSystem.cacheDirectory;
  const needsCopy =
    uri.startsWith('content://') ||
    (uri.startsWith('file://') && appCacheDir && !uri.startsWith(appCacheDir) && !uri.startsWith(FileSystem.documentDirectory ?? ''));
  if (!needsCopy) return { uri, temporary: false };
  if (!appCacheDir) throw new Error('임시 저장 공간을 사용할 수 없습니다.');
  const target = `${FileSystem.cacheDirectory}shot-connect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let bgAbortController: AbortController | null = null;
  const releaseSlot = await acquireNativeCopySlot();
  try {
    bgAbortController = createBackgroundAbort();
    const copyPromise = FileSystem.copyAsync({ from: uri, to: target });
    const bgRejectPromise = new Promise<never>((_, reject) => {
      if (!bgAbortController) return;
      bgAbortController.signal.addEventListener('abort', () => {
        reject(new Error('앱이 백그라운드로 전환되어 파일 복사가 중단되었습니다.'));
      }, { once: true });
    });
    await Promise.race([
      copyPromise,
      bgRejectPromise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('파일을 불러오는 시간이 초과되었습니다.')), NATIVE_URI_COPY_TIMEOUT_MS);
      }),
    ]);
    // Yield to the native event loop so the OS file channel handle can
    // fully flush before subsequent read/manipulate/delete operations
    // hit the freshly-copied file (prevents EBUSY races on Android/iOS).
    await waitForFileChannelFlush();
    // Register the copied file immediately so tempFileManager tracks it even
    // if the app is backgrounded or killed before we finish processing.
    registerTempFile(target, 'makeReadableNativeUri', { pin: true });
    // Strict post-copy validation: reject zombie/corrupt files before they
    // enter the upload pipeline. Retry on transient EBUSY.
    await withFileSettle('validateCopiedFile', () => validateCopiedFile(target));
    // Smart resize: if the image exceeds device-safe pixel limits, downscale
    // immediately to prevent OOM during later base64 encoding or canvas ops.
    const resized = await analyzeAndDownscaleImage(target);
    if (resized.downscaled && resized.uri !== target) {
      // The original cached copy is no longer needed; the downscaled temp
      // file becomes the active source.
      unpinTempFile(target);
      await withFileSettle('deleteOriginalCopy', () =>
        FileSystem.deleteAsync(target, { idempotent: true }),
      ).catch(() => {});
      return { uri: resized.uri, temporary: true };
    }
    unpinTempFile(target);
    return { uri: target, temporary: true };
  } catch (error) {
    unregisterTempFile(target);
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (bgAbortController) bgAbortController.abort();
    releaseSlot();
  }
}

export async function compressImageToBase64(
  uri: string,
  maxDimension = STANDARD_MAX_DIMENSION,
  quality = STANDARD_QUALITY,
): Promise<{ base64: string; mimeType: string }> {
  const source = await makeReadableNativeUri(uri);
  try {
    const { width: origW, height: origH } = await getImageSize(source.uri);
    const longer = Math.max(origW, origH);
    const actions =
      longer > maxDimension
        ? origW >= origH
          ? [{ resize: { width: maxDimension } }]
          : [{ resize: { height: maxDimension } }]
        : [];
    try {
      const manipulated = await withTimeout(
        ImageManipulator.manipulateAsync(
          source.uri,
          actions,
          { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
        ),
        NATIVE_READ_TIMEOUT_MS,
        '이미지 변환',
      );
      registerTempFile(manipulated.uri, 'compressImageToBase64', { pin: true });
      return await withFileLock(manipulated.uri, async () => {
        const fileInfo = await withTimeout(
          withFileSettle('compressGetInfo', () => FileSystem.getInfoAsync(manipulated.uri)),
          NATIVE_READ_TIMEOUT_MS,
          '변환 파일 정보 조회',
        );
        if (!fileInfo.exists) throw new Error('이미지 변환 실패');
        assertNativeImageSize(fileInfo.size);
        const base64 = await withTimeout(
          withFileSettle('compressRead', () => FileSystem.readAsStringAsync(manipulated.uri, {
            encoding: FileSystem.EncodingType.Base64,
          })),
          NATIVE_READ_TIMEOUT_MS,
          '이미지 파일 읽기',
        );
        await safeDeleteTempFile(manipulated.uri).catch(() => {});
        await waitForFileChannelFlush();
        return { base64, mimeType: 'image/jpeg' };
      });
    } catch {
      const fileInfo = await withTimeout(
        FileSystem.getInfoAsync(source.uri),
        NATIVE_READ_TIMEOUT_MS,
        '파일 정보 조회',
      ).catch(() => null);
      if (!fileInfo || !fileInfo.exists) throw new Error('이미지를 불러올 수 없습니다.');
      assertNativeImageSize(fileInfo.size);
      const base64 = await withTimeout(
        FileSystem.readAsStringAsync(source.uri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
        NATIVE_READ_TIMEOUT_MS,
        '이미지 파일 읽기',
      );
      return { base64, mimeType: 'image/jpeg' };
    }
  } finally {
    if (source.temporary) {
      await withFileSettle('deleteSource', () => FileSystem.deleteAsync(source.uri, { idempotent: true })).catch(() => {});
      await waitForFileChannelFlush();
    }
  }
}

export async function uploadEditedImage(base64: string, mimeType: string): Promise<string> {
  const isPng = mimeType === 'image/png';
  const dataUrl = isPng ? `data:image/png;base64,${base64}` : `data:image/jpeg;base64,${base64}`;
  const compressedDataUrl = isPng ? await prepareImageForEdit(dataUrl, 1080) : await prepareImageForApi(dataUrl, 1080, 0.85);
  const compressedBase64 = cleanBase64(compressedDataUrl);
  const uploadMime = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';

  const fileName = `edited-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const body = Platform.OS === 'web'
    ? base64ToBlob(compressedBase64, uploadMime)
    : base64ToUint8Array(compressedBase64);

  const { error } = await supabase.storage
    .from('scans')
    .upload(fileName, body, { contentType: uploadMime, cacheControl: '360000' });

  if (error) throw new Error(`업로드 실패: ${error.message}`);

  const { data: urlData } = supabase.storage.from('scans').getPublicUrl(fileName);
  return urlData.publicUrl;
}

export async function saveEditedScan(scanId: string, editedImageUrl: string): Promise<void> {
  const { error } = await supabase
    .from('scans')
    .update({ edited_image_url: editedImageUrl })
    .eq('id', scanId);

  if (error) throw new Error(`저장 실패: ${error.message}`);
}

export async function compositeOnBackground(
  productDataUrl: string,
  bgStyle: 'studio' | 'retail' | 'natural' | 'gradient' | 'none',
): Promise<string> {
  if (bgStyle === 'none') return productDataUrl;

  const cacheKey = mediaCacheKey('compositeBg', { bgStyle, productDataUrl });
  const cached = await mediaCacheGet(cacheKey);
  if (cached) return cached;

  const bgUrl = `/bg-${bgStyle}.webp`;
  const result = Platform.OS === 'web' && typeof document !== 'undefined'
    ? await compositeOnBackgroundWeb(productDataUrl, bgUrl)
    : await compositeOnBackgroundNative(productDataUrl, bgUrl);

  await mediaCacheSet(cacheKey, result);
  return result;
}

async function compositeOnBackgroundWeb(productDataUrl: string, bgUrl: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 생성할 수 없습니다');

  const [bgImg, productImg] = await Promise.all([
    loadImageElement(bgUrl),
    loadImageElement(productDataUrl),
  ]);

  ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

  const pw = productImg.naturalWidth;
  const ph = productImg.naturalHeight;
  const scale = Math.min((canvas.width * 0.8) / pw, (canvas.height * 0.8) / ph);
  const dw = pw * scale;
  const dh = ph * scale;
  const dx = (canvas.width - dw) / 2;
  const dy = (canvas.height - dh) / 2;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.drawImage(productImg, dx, dy, dw, dh);
  ctx.shadowColor = 'transparent';
  await new Promise<void>((r) => setTimeout(r, 0));

  const result = canvas.toDataURL('image/png', 0.95);
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

function loadImageElement(src: string, timeoutMs = 15000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('이미지 로딩 시간이 초과되었습니다'));
      }
    }, timeoutMs);
    img.onload = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error('이미지를 불러올 수 없습니다'));
      }
    };
    img.src = src;
  });
}

async function compositeOnBackgroundNative(productDataUrl: string, _bgUrl: string): Promise<string> {
  return productDataUrl;
}

export type MoodFilterType = 'none' | 'warm' | 'fresh';

const MOOD_OVERLAY_COLORS: Record<Exclude<MoodFilterType, 'none'>, string> = {
  warm: 'rgba(255, 170, 60, 0.18)',
  fresh: 'rgba(80, 200, 230, 0.15)',
};

function applyMoodOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mood: Exclude<MoodFilterType, 'none'>,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = MOOD_OVERLAY_COLORS[mood];
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export async function prepareImageForApi(
  dataUrl: string,
  maxDimension = STANDARD_MAX_DIMENSION,
  quality = STANDARD_QUALITY,
  moodFilter: MoodFilterType = 'none',
): Promise<string> {
  const normalizedDataUrl = normalizeImageDataUrl(dataUrl);
  if (Platform.OS !== 'web') {
    assertNativeBase64Size(cleanBase64(normalizedDataUrl));
  }
  if (Platform.OS === 'web') {
    // Mood filters need a 2D context for globalCompositeOperation; skip worker.
    if (moodFilter === 'none' && isWorkerPoolAvailable()) {
      try {
        return await compressImageInWorker(normalizedDataUrl, maxDimension, quality);
      } catch {
        // Worker failed — fall through to main-thread canvas below
      }
    }
    try {
      const img = await loadImageElement(normalizedDataUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      // Round dimensions to multiples of 8 for better JPEG/WebP block encoding efficiency
      const rawW = Math.round(img.naturalWidth * scale);
      const rawH = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(8, rawW - (rawW % 8));
      canvas.height = Math.max(8, rawH - (rawH % 8));
      const ctx = canvas.getContext('2d');
      if (!ctx) return normalizedDataUrl;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (moodFilter !== 'none') {
        applyMoodOverlay(ctx, canvas.width, canvas.height, moodFilter);
      }
      // Use WebP when the browser supports it (smaller payload), fall back to JPEG
      await new Promise<void>((r) => setTimeout(r, 0));
      const result = canvas.toDataURL('image/webp', quality);
      canvas.width = 0;
      canvas.height = 0;
      return result;
    } catch {
      return normalizedDataUrl;
    }
  }

  try {
    const { width: origW, height: origH } = await getImageSize(normalizedDataUrl);
    const longer = Math.max(origW, origH);
    const actions =
      longer > maxDimension
        ? origW >= origH
          ? [{ resize: { width: maxDimension } }]
          : [{ resize: { height: maxDimension } }]
        : [];
    const manipulated = await withFileSettle('prepareApi-manipulate', () =>
      ImageManipulator.manipulateAsync(
        normalizedDataUrl,
        actions,
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      ),
    );

    registerTempFile(manipulated.uri, 'prepareImageForApi-native', { pin: true });
    return await withFileLock(manipulated.uri, async () => {
      const fileInfo = await withFileSettle('prepareApi-getInfo', () => FileSystem.getInfoAsync(manipulated.uri));
      if (!fileInfo.exists) throw new Error('이미지 변환 실패');
      assertNativeImageSize(fileInfo.size);
      const base64 = await withFileSettle('prepareApi-read', () => FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }));
      await safeDeleteTempFile(manipulated.uri).catch(() => {});
      await waitForFileChannelFlush();
      return `data:image/jpeg;base64,${base64}`;
    });
  } catch {
    throw new Error('이미지 압축에 실패했습니다. 더 낮은 해상도로 다시 촬영해주세요.');
  }
}

export async function prepareImageForEdit(
  dataUrl: string,
  maxDimension = STANDARD_MAX_DIMENSION,
): Promise<string> {
  const normalizedDataUrl = normalizeImageDataUrl(dataUrl);
  if (Platform.OS !== 'web') {
    assertNativeBase64Size(cleanBase64(normalizedDataUrl));
  }
  if (Platform.OS === 'web') {
    try {
      const img = await loadImageElement(normalizedDataUrl);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(8, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(8, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return normalizedDataUrl;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      await new Promise<void>((r) => setTimeout(r, 0));
      const result = canvas.toDataURL('image/png');
      canvas.width = 0;
      canvas.height = 0;
      return result;
    } catch {
      return normalizedDataUrl;
    }
  }

  try {
    const { width: origW, height: origH } = await getImageSize(normalizedDataUrl);
    const longer = Math.max(origW, origH);
    const actions =
      longer > maxDimension
        ? origW >= origH
          ? [{ resize: { width: maxDimension } }]
          : [{ resize: { height: maxDimension } }]
        : [];
    const manipulated = await withFileSettle('prepareEdit-manipulate', () =>
      ImageManipulator.manipulateAsync(
        normalizedDataUrl,
        actions,
        { compress: 1, format: ImageManipulator.SaveFormat.PNG },
      ),
    );

    registerTempFile(manipulated.uri, 'prepareImageForEdit-native', { pin: true });
    return await withFileLock(manipulated.uri, async () => {
      const fileInfo = await withFileSettle('prepareEdit-getInfo', () => FileSystem.getInfoAsync(manipulated.uri));
      if (!fileInfo.exists) throw new Error('이미지 변환 실패');
      const base64 = await withFileSettle('prepareEdit-read', () => FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }));
      await safeDeleteTempFile(manipulated.uri).catch(() => {});
      await waitForFileChannelFlush();
      return `data:image/png;base64,${base64}`;
    });
  } catch {
    return normalizedDataUrl;
  }
}

export function normalizeImageDataUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return dataUrl;

  const header = dataUrl.slice(5, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1).replace(/\s/g, '');
  if (!header.includes('base64') || !base64) return dataUrl;

  const declaredMime = header.split(';')[0];
  if (declaredMime.startsWith('image/')) return `data:${declaredMime};base64,${base64}`;

  const detectedMime = base64.startsWith('iVBORw0KGgo')
    ? 'image/png'
    : base64.startsWith('/9j/')
      ? 'image/jpeg'
      : base64.startsWith('R0lGOD')
        ? 'image/gif'
        : base64.startsWith('UklGR')
          ? 'image/webp'
          : null;

  return detectedMime ? `data:${detectedMime};base64,${base64}` : dataUrl;
}

export async function extractVideoFrameBase64(
  videoUri: string,
  maxDimension = STANDARD_MAX_DIMENSION,
  quality = STANDARD_QUALITY,
): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const video = document.createElement('video');
    video.src = videoUri;
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('동영상 로딩 시간 초과')), 15000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('동영상을 불러올 수 없습니다')); };
    });

    video.currentTime = Math.min(video.duration / 2, 1);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('동영상 프레임 탐색 시간 초과')), 10000);
      video.onseeked = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('동영상 프레임 탐색 실패')); };
    });

    const rawW = video.videoWidth || 1080;
    const rawH = video.videoHeight || 1080;
    const scale = Math.min(1, maxDimension / Math.max(rawW, rawH));
    const w = Math.max(8, Math.round(rawW * scale));
    const h = Math.max(8, Math.round(rawH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 생성할 수 없습니다');
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    canvas.width = 0;
    canvas.height = 0;
    video.src = '';
    return { base64: cleanBase64(dataUrl), mimeType: 'image/jpeg' };
  }

  if (Platform.OS !== 'web') {
    const { uploadVideoBlob, extractVideoFrameFromServer } = await import('@/lib/analysis');
    const source = await makeReadableNativeUri(videoUri);
    try {
      const videoUrl = await uploadVideoBlob(source.uri, 'video/mp4');
      const result = await extractVideoFrameFromServer(videoUrl, maxDimension, quality);
      if (result.frameUrl) {
        const FileSystem2 = await import('expo-file-system/legacy');
        const localPath = `${FileSystem2.cacheDirectory}server-frame-${Date.now()}.jpg`;
        try {
          await FileSystem2.downloadAsync(result.frameUrl, localPath);
          registerTempFile(localPath, 'extractVideoFrameBase64');
          const base64 = await FileSystem2.readAsStringAsync(localPath, {
            encoding: FileSystem2.EncodingType.Base64,
          });
          return { base64, mimeType: 'image/jpeg' };
        } finally {
          await safeDeleteTempFile(localPath).catch(() => {});
          await waitForFileChannelFlush();
        }
      }
      return { base64: result.base64, mimeType: result.mimeType };
    } finally {
      if (source.temporary) await FileSystem.deleteAsync(source.uri, { idempotent: true }).catch(() => {});
    }
  }

  throw new Error('이 플랫폼에서는 동영상 프레임 추출을 지원하지 않습니다');
}

export async function readUriAsBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === 'web') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(uri, { signal: controller.signal });
      if (!response.ok) throw new Error(`이미지 로드 실패 (${response.status})`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('이미지가 아닌 콘텐츠가 반환되었습니다');
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('이미지를 변환할 수 없습니다'));
        reader.readAsDataURL(blob);
      });
      const mimeType = dataUrl.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';
      return { base64: cleanBase64(dataUrl), mimeType };
    } finally {
      clearTimeout(timeoutId);
    }
  }
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) throw new Error('파일을 찾을 수 없습니다');
  assertNativeImageSize(fileInfo.size);
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  return { base64, mimeType };
}

export async function compressImageToBase64WithUri(
  uri: string,
  maxDimension = STANDARD_MAX_DIMENSION,
  quality = STANDARD_QUALITY,
): Promise<{ base64: string; mimeType: string; compressedUri: string | null }> {
  try {
    const { width: origW, height: origH } = await getImageSize(uri);
    const longer = Math.max(origW, origH);
    const actions =
      longer > maxDimension
        ? origW >= origH
          ? [{ resize: { width: maxDimension } }]
          : [{ resize: { height: maxDimension } }]
        : [];
    const manipulated = await withFileSettle('compressWithUri-manipulate', () =>
      ImageManipulator.manipulateAsync(
        uri,
        actions,
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      ),
    );
    registerTempFile(manipulated.uri, 'prepareImageForUpload-native', { pin: true });
    return await withFileLock(manipulated.uri, async () => {
      const fileInfo = await withFileSettle('compressWithUri-getInfo', () => FileSystem.getInfoAsync(manipulated.uri));
      if (!fileInfo.exists) throw new Error('이미지 변환 실패');
      assertNativeImageSize(fileInfo.size);
      const base64 = await withFileSettle('compressWithUri-read', () => FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }));
      await safeDeleteTempFile(manipulated.uri).catch(() => {});
      await waitForFileChannelFlush();
      return { base64, mimeType: 'image/jpeg', compressedUri: null };
    });
  } catch {
    const result = await compressImageToBase64(uri, maxDimension, quality);
    return { ...result, compressedUri: null };
  }
}

export async function compressCaptureUriToBlob(
  uri: string,
  maxDimension = STANDARD_MAX_DIMENSION,
  quality = STANDARD_QUALITY,
): Promise<{ blob: Blob | Uint8Array; base64: string; mimeType: string }> {
  const { base64, mimeType } = await compressImageToBase64(uri, maxDimension, quality);
  const blob = base64ToBlob(base64, mimeType);
  return { blob, base64, mimeType };
}

export async function waitForUriFlush(uri: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && (info.size === undefined || info.size > 0)) return true;
    } catch {
      // The camera may still be committing the file on Android.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export async function nativeHeapCooldownGuard(): Promise<void> {
  if (Platform.OS === 'web') {
    const ratio = getHeapUsageRatio();
    if (ratio !== null && ratio > 0.75) {
      await runProactiveFlush(true).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return;
  }
  const ratio = getHeapUsageRatio();
  if (ratio !== null && ratio > 0.7) {
    await runProactiveFlush(true).catch(() => {});
  }
  const ms = isLowEndDevice() ? 400 : 200;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
