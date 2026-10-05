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
import { logError } from '@/lib/errorLogger';

/**
 * Supabase Storage REST 경로에 사용할 수 없는 유니코드/공백/특수문자를
 * 영문 알파벳·숫자·언더바·하이픈·슬래시 조합으로 강제 정규화한다.
 * 모바일에서 파일명에 한글이나 특수기호가 섞이면 REST API가 경로를
 * 해석하지 못하고 400 에러를 내거나 업로드 프로미스가 증발한다.
 */
let uniqueCounter = 0;
export function uniqueSuffix(): string {
  uniqueCounter += 1;
  return `${Date.now()}-${uniqueCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeStoragePath(path: string): string {
  return path
    .split('/')
    .map((segment) => segment.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/_+/g, '_').replace(/^[-_.]+|[-_.]+$/g, ''))
    .filter(Boolean)
    .join('/');
}

/**
 * Sanitize then percent-encode each path segment for safe URL interpolation.
 * sanitizeStoragePath strips Unicode/special chars; encodeStoragePath ensures
 * the remaining ASCII-safe characters (dots, hyphens) are properly encoded
 * for use in a URL path component.
 */
export function encodeStoragePath(path: string): string {
  return sanitizeStoragePath(path)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function rotateImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ rotate: 90 }]);
  if (Platform.OS !== 'web') {
    await waitForUriFlush(result.uri);
    await waitForFileChannelFlush();
  }
  return result.uri;
}

export async function flipImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ flip: ImageManipulator.FlipType.Horizontal }]);
  if (Platform.OS !== 'web') {
    await waitForUriFlush(result.uri);
    await waitForFileChannelFlush();
  }
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
  if (Platform.OS !== 'web') {
    await waitForUriFlush(result.uri);
    await waitForFileChannelFlush();
  }
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
  if (Platform.OS !== 'web') {
    await waitForUriFlush(result.uri);
    await waitForFileChannelFlush();
  }
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

export async function writeBase64ToTempFile(base64: string, ext: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  // Android 14+ sandbox restricts read access to cacheDirectory for the
  // native upload module. Use documentDirectory (app-private, always readable).
  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!dir) return null;
  const path = `${dir}b64tmp-${uniqueSuffix()}.${ext}`;
  try {
    await withFileSettle('writeB64Temp', () =>
      FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 }),
    );
    registerTempFile(path, 'writeBase64ToTempFile', { pin: true });
    return path;
  } catch {
    return null;
  }
}

export async function compressCaptureFrameToBlob(
  base64: string,
  mimeType: string,
): Promise<{ blob: Blob | Uint8Array; base64: string; mimeType: string }> {
  assertNativeBase64Size(base64);

  if (Platform.OS !== 'web') {
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const tmpPath = await writeBase64ToTempFile(base64, ext);
    if (tmpPath) {
      try {
        const { base64: compressedBase64, mimeType: compressedMime } =
          await compressImageToBase64(tmpPath, CAPTURE_MAX_DIMENSION, CAPTURE_QUALITY);
        const blob = base64ToBlob(compressedBase64, compressedMime);
        return { blob, base64: compressedBase64, mimeType: compressedMime };
      } catch {
        // fall through to data-URL path below
      } finally {
        unpinTempFile(tmpPath);
        await safeDeleteTempFile(tmpPath).catch(() => {});
        await waitForFileChannelFlush();
      }
    }
  }

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
      const fallbackBytes = Math.floor((base64.length * 3) / 4);
      if (fallbackBytes > UPLOAD_MAX_PAYLOAD_BYTES) {
        throw new Error('이미지 압축에 실패하여 업로드할 수 없습니다. 다시 시도해주세요.');
      }
      return { base64, mimeType };
    }
  }

  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const tmpPath = await writeBase64ToTempFile(base64, ext);
  if (tmpPath) {
    try {
      const { base64: compressedBase64, mimeType: compressedMime } =
        await compressImageToBase64(tmpPath, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      if (dataUrlByteLength(`data:${compressedMime};base64,${compressedBase64}`) > UPLOAD_MAX_PAYLOAD_BYTES) {
        const reCompressed = await compressDataUrlToMaxBytes(
          `data:${compressedMime};base64,${compressedBase64}`,
          UPLOAD_MAX_PAYLOAD_BYTES,
          UPLOAD_MAX_DIMENSION,
          UPLOAD_QUALITY,
        );
        return applyCap(reCompressed);
      }
      return { base64: compressedBase64, mimeType: compressedMime };
    } catch {
      // fall through to data-URL path below
    } finally {
      unpinTempFile(tmpPath);
      await safeDeleteTempFile(tmpPath).catch(() => {});
      await waitForFileChannelFlush();
    }
  }

  try {
    let compressed = await prepareImageForApi(dataUrl, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
    if (dataUrlByteLength(compressed) > UPLOAD_MAX_PAYLOAD_BYTES) {
      compressed = await compressDataUrlToMaxBytes(dataUrl, UPLOAD_MAX_PAYLOAD_BYTES, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
    }
    return applyCap(compressed);
  } catch {
    const fallbackBytes = Math.floor((base64.length * 3) / 4);
    if (fallbackBytes > UPLOAD_MAX_PAYLOAD_BYTES) {
      throw new Error('이미지 압축에 실패하여 업로드할 수 없습니다. 다시 시도해주세요.');
    }
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
  const docDir = FileSystem.documentDirectory;
  const needsCopy =
    uri.startsWith('content://') ||
    (uri.startsWith('file://') && appCacheDir && !uri.startsWith(appCacheDir) && !(docDir && uri.startsWith(docDir)));
  if (!needsCopy) return { uri, temporary: false };
  if (!docDir) throw new Error('저장 공간을 사용할 수 없습니다.');
  const target = `${docDir}shot-connect-${uniqueSuffix()}.jpg`;
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
      unpinTempFile(target);
      await withFileSettle('deleteOriginalCopy', () =>
        FileSystem.deleteAsync(target, { idempotent: true }),
      ).catch(() => {});
      if (!resized.uri.startsWith('data:')) {
        registerTempFile(resized.uri, 'makeReadableNativeUri-downscaled', { pin: true });
      }
      return { uri: resized.uri, temporary: true };
    }
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
      await waitForUriFlush(manipulated.uri);
      await waitForFileChannelFlush();
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
      unpinTempFile(source.uri);
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

  // Native: write to temp file and upload via FileSystem.uploadAsync
  if (Platform.OS !== 'web') {
    const tmpPath = await writeBase64ToTempFile(compressedBase64, ext);
    if (tmpPath) {
      const { unpinTempFile, safeDeleteTempFile } = await import('@/lib/tempFileManager');
      try {
        return await uploadUriToSupabase(tmpPath, uploadMime);
      } finally {
        unpinTempFile(tmpPath);
        await safeDeleteTempFile(tmpPath).catch(() => {});
      }
    }
  }

  // Web fallback
  const fileName = `edited-${uniqueSuffix()}.${ext}`;
  const body = base64ToBlob(compressedBase64, uploadMime);
  const { uploadBytesToStorage } = await import('@/lib/imageEdit');
  return uploadBytesToStorage(body, 'scans', fileName, uploadMime);
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
    await waitForUriFlush(manipulated.uri);
    await waitForFileChannelFlush();

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
    await waitForUriFlush(manipulated.uri);
    await waitForFileChannelFlush();

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
        const localPath = `${FileSystem2.cacheDirectory}server-frame-${uniqueSuffix()}.jpg`;
        try {
          await FileSystem2.downloadAsync(result.frameUrl, localPath);
          registerTempFile(localPath, 'extractVideoFrameBase64', { pin: true });
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
      if (source.temporary) {
        unpinTempFile(source.uri);
        await FileSystem.deleteAsync(source.uri, { idempotent: true }).catch(() => {});
      }
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
  const source = await makeReadableNativeUri(uri);
  try {
    if (Platform.OS !== 'web' && !source.uri.startsWith('data:')) {
      registerTempFile(source.uri, 'compressWithUri-source', { pin: true });
    }
    const { width: origW, height: origH } = await getImageSize(source.uri);
    const longer = Math.max(origW, origH);
    const actions =
      longer > maxDimension
        ? origW >= origH
          ? [{ resize: { width: maxDimension } }]
          : [{ resize: { height: maxDimension } }]
        : [];
    const manipulated = await withFileSettle('compressWithUri-manipulate', () =>
      ImageManipulator.manipulateAsync(
        source.uri,
        actions,
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      ),
    );
    await waitForUriFlush(manipulated.uri);
    await waitForFileChannelFlush();
    registerTempFile(manipulated.uri, 'compressWithUri-output', { pin: true });
    return await withFileLock(manipulated.uri, async () => {
      const fileInfo = await withFileSettle('compressWithUri-getInfo', () => FileSystem.getInfoAsync(manipulated.uri));
      if (!fileInfo.exists) throw new Error('이미지 변환 실패');
      assertNativeImageSize(fileInfo.size);
      const base64 = await withFileSettle('compressWithUri-read', () => FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }));
      return { base64, mimeType: 'image/jpeg', compressedUri: manipulated.uri };
    });
  } catch {
    const result = await compressImageToBase64(source.uri, maxDimension, quality);
    return { ...result, compressedUri: null };
  } finally {
    if (Platform.OS !== 'web' && !source.uri.startsWith('data:')) {
      unpinTempFile(source.uri);
      if (source.temporary) {
        await withFileSettle('compressWithUri-deleteSource', () =>
          FileSystem.deleteAsync(source.uri, { idempotent: true }),
        ).catch(() => {});
        await waitForFileChannelFlush();
      }
    }
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
  let lastSize = -1;
  let stableCount = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && (info.size === undefined || info.size > 0)) {
        if (info.size === undefined) return true;
        if (info.size === lastSize && info.size > 0) {
          stableCount += 1;
          if (stableCount >= 2) return true;
        } else {
          stableCount = 0;
          lastSize = info.size;
        }
      }
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

/**
 * Compress/resize a file URI to another file URI — no base64 in JS memory.
 * Returns the URI of the compressed JPEG file in documentDirectory.
 */
export async function compressUriToUri(
  uri: string,
  maxDimension = UPLOAD_MAX_DIMENSION,
  quality = UPLOAD_QUALITY,
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('compressUriToUri is not supported on web');
  }
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
    const manipulated = await withFileSettle('compressUriToUri', () =>
      ImageManipulator.manipulateAsync(
        source.uri,
        actions,
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      ),
    );
    await waitForUriFlush(manipulated.uri);
    await waitForFileChannelFlush();
    registerTempFile(manipulated.uri, 'compressUriToUri', { pin: true });
    const docDir = FileSystem.documentDirectory;
    if (docDir && !manipulated.uri.startsWith(docDir)) {
      const dest = `${docDir}compressed-${uniqueSuffix()}.jpg`;
      await withFileSettle('compressUriToUri-copy', () =>
        FileSystem.copyAsync({ from: manipulated.uri, to: dest }),
      );
      await waitForUriFlush(dest);
      await waitForFileChannelFlush();
      await withFileSettle('compressUriToUri-deleteManip', () =>
        FileSystem.deleteAsync(manipulated.uri, { idempotent: true }),
      ).catch(() => {});
      return dest;
    }
    return manipulated.uri;
  } finally {
    if (!source.uri.startsWith('data:')) {
      unpinTempFile(source.uri);
      if (source.temporary) {
        await withFileSettle('compressUriToUri-deleteSource', () =>
          FileSystem.deleteAsync(source.uri, { idempotent: true }),
        ).catch(() => {});
      }
    }
  }
}

/**
 * Compress a file URI and upload it to Supabase Storage in one shot.
 * On native, the file never enters JS memory as base64 — it goes
 * disk → ImageManipulator → disk → FileSystem.uploadAsync → server.
 */
export async function compressAndUploadUri(
  uri: string,
  maxDimension = UPLOAD_MAX_DIMENSION,
  quality = UPLOAD_QUALITY,
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('compressAndUploadUri is not supported on web');
  }
  const compressedUri = await compressUriToUri(uri, maxDimension, quality);
  try {
    const fileName = `scan-${uniqueSuffix()}.jpg`;
    return await uploadFileDirectNative(compressedUri, 'scans', fileName, 'image/jpeg');
  } finally {
    await safeDeleteTempFile(compressedUri).catch(() => {});
    await waitForFileChannelFlush();
  }
}

/**
 * Upload a file URI directly to Supabase Storage using the native
 * FileSystem.uploadAsync — bypasses JS bridge entirely, no base64.
 */
export async function uploadUriToBucket(
  fileUri: string,
  mimeType: string,
  bucket: string,
  fileName: string,
  upsert = false,
  signal?: AbortSignal,
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('uploadUriToBucket is not supported on web');
  }

  const readableUri = await normalizeUriForRead(fileUri, 'uploadUriToBucket');
  let compressedCleanupUri: string | null = null;
  try {
    const { uri: uploadUri, cleanedUp } = await compressImageUriIfNeeded(readableUri, mimeType);
    if (cleanedUp) compressedCleanupUri = cleanedUp;
    const base64 = await FileSystem.readAsStringAsync(uploadUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) throw new Error('업로드할 파일을 읽을 수 없습니다.');
    const bytes = base64ToUint8Array(base64);
    if (!bytes || bytes.byteLength <= 0) {
      throw new Error('업로드할 파일의 크기가 0바이트이거나 존재하지 않습니다.');
    }
    return await uploadBytesToStorage(bytes, bucket, fileName, mimeType, upsert, signal);
  } finally {
    if (compressedCleanupUri) await FileSystem.deleteAsync(compressedCleanupUri, { idempotent: true }).catch(() => {});
    await cleanupNormalizedUri(fileUri, readableUri);
  }
}

export async function uploadUriToSupabase(
  fileUri: string,
  mimeType: string,
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('uploadUriToSupabase is not supported on web — use uploadBytesToStorage instead');
  }
  const ext = mimeType === 'image/png' ? 'png'
    : mimeType === 'image/webp' ? 'webp'
    : mimeType === 'image/heic' ? 'heic'
    : 'jpg';
  const fileName = `scan-${uniqueSuffix()}.${ext}`;
  return uploadFileDirectNative(fileUri, 'scans', fileName, mimeType);
}

/**
 * [핵심] JS 메모리를 거치지 않고 네이티브 모듈이 직접 서버로 꽂아버리는 바이너리 다이렉트 업로드.
 * expo-file-system의 FileSystem.uploadAsync가 OS 네이티브 네트워킹 스택으로 파일을 스트리밍하므로
 * Hermes JS 엔진 메모리와 RN Bridge를 완전히 우회한다.
 */
const WEB_UPLOAD_TIMEOUT_MS = 15_000;

const MIME_MAGIC_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/heic', bytes: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63] },
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d] },
  { mime: 'video/quicktime', bytes: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74] },
];

function detectMimeFromBytes(bytes: Uint8Array): string | null {
  for (const sig of MIME_MAGIC_SIGNATURES) {
    if (sig.bytes.every((b, i) => bytes[i] === b)) {
      if (sig.mime === 'image/webp') {
        for (let i = 8; i < 12 && i < bytes.length - 3; i++) {
          if (bytes[i] === 0x57 && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x42 && bytes[i + 3] === 0x50) {
            return 'image/webp';
          }
        }
        continue;
      }
      if (sig.mime === 'image/heic' || sig.mime === 'video/mp4' || sig.mime === 'video/quicktime') {
        let ftypIdx = -1;
        for (let i = 0; i < bytes.length - 3; i++) {
          if (bytes[i] === 0x66 && bytes[i + 1] === 0x74 && bytes[i + 2] === 0x79 && bytes[i + 3] === 0x70) {
            ftypIdx = i;
            break;
          }
        }
        if (ftypIdx >= 4 && ftypIdx + 7 < bytes.length) {
          const brand = String.fromCharCode(bytes[ftypIdx + 4], bytes[ftypIdx + 5], bytes[ftypIdx + 6], bytes[ftypIdx + 7]);
          if (brand === 'heic' || brand === 'heix') return 'image/heic';
          if (brand === 'isom' || brand === 'mp41' || brand === 'mp42') return 'video/mp4';
          if (brand === 'qt  ') return 'video/quicktime';
        }
        continue;
      }
      return sig.mime;
    }
  }
  return null;
}

const IMAGE_COMPRESS_THRESHOLD_BYTES = 2_000_000;
const IMAGE_COMPRESS_MAX_DIMENSION = 1280;
const IMAGE_COMPRESS_QUALITY = 0.75;

async function compressImageUriIfNeeded(uri: string, mimeType: string): Promise<{ uri: string; compressed: boolean; cleanedUp?: string }> {
  if (!mimeType.startsWith('image/')) return { uri, compressed: false };
  let size: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    size = info.exists ? info.size : undefined;
  } catch { /* best-effort */ }
  if (size === undefined || size <= IMAGE_COMPRESS_THRESHOLD_BYTES) {
    return { uri, compressed: false };
  }
  try {
    const compressed = await compressUriToUri(uri, IMAGE_COMPRESS_MAX_DIMENSION, IMAGE_COMPRESS_QUALITY);
    return { uri: compressed, compressed: true, cleanedUp: compressed };
  } catch {
    return { uri, compressed: false };
  }
}

async function normalizeUriForRead(fileUri: string, label: string): Promise<string> {
  if (Platform.OS === 'web') return fileUri;
  const docDir = FileSystem.documentDirectory;
  if (!docDir) return fileUri;
  const needsCopy =
    fileUri.startsWith('content://') ||
    (fileUri.startsWith('file://') && !fileUri.startsWith(docDir));
  if (!needsCopy) return fileUri;
  const rawName = fileUri.split('/').pop() || `upload-${uniqueSuffix()}`;
  const baseName = sanitizeStoragePath(rawName);
  const target = `${docDir}${label}-${uniqueSuffix()}-${baseName}`;
  try {
    await withFileSettle(`${label}-copy`, () =>
      FileSystem.copyAsync({ from: fileUri, to: target }),
    );
    await waitForUriFlush(target);
    await waitForFileChannelFlush();
    return target;
  } catch (copyErr) {
    throw new Error(`파일을 업로드 가능한 경로로 복사하지 못했습니다: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`);
  }
}

async function cleanupNormalizedUri(originalUri: string, normalizedUri: string): Promise<void> {
  if (normalizedUri !== originalUri) {
    await FileSystem.deleteAsync(normalizedUri, { idempotent: true }).catch(() => {});
    await waitForFileChannelFlush();
  }
}

export async function uploadFileDirectNative(
  fileUri: string,
  bucket: string,
  path: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('uploadFileDirectNative is not supported on web');
  }

  const readableUri = await normalizeUriForRead(fileUri, 'uploadFileDirectNative');
  let compressedCleanupUri: string | null = null;
  try {
    const { uri: uploadUri, cleanedUp } = await compressImageUriIfNeeded(readableUri, mimeType);
    if (cleanedUp) compressedCleanupUri = cleanedUp;

    const safePath = encodeStoragePath(path);
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${safePath}`;
    const effectiveMime = mimeType.toLowerCase().trim();

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': effectiveMime,
        'x-upsert': 'true',
        'Cache-Control': '360000',
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      const bodyText = typeof uploadResult.body === 'string' ? uploadResult.body : '';
      const err = new Error(`Upload failed (${uploadResult.status}): ${bodyText}`);
      logError(err, { component: 'imageEdit', action: 'uploadFileDirectNative', extra: { path, status: uploadResult.status, body: bodyText } });
      throw err;
    }

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${safePath}`;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');
    const errMsg = err instanceof Error ? err.message : String(err);
    logError(new Error(`uploadFileDirectNative: ${errMsg}`), { component: 'imageEdit', action: 'uploadFileDirectNative', extra: { path, error: errMsg } });
    throw err;
  } finally {
    if (compressedCleanupUri) await FileSystem.deleteAsync(compressedCleanupUri, { idempotent: true }).catch(() => {});
    await cleanupNormalizedUri(fileUri, readableUri);
  }
}

/**
 * Supabase JS SDK를 우회하여 REST API로 스토리지 객체를 삭제한다.
 * SDK의 .remove()는 내부적으로 추가 네트워크 왕복과 JS 객체 생성을 수반하므로,
 * 직접 DELETE 요청으로 대체한다.
 */
export async function deleteStorageObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const deleteUrl = `${supabaseUrl}/storage/v1/object/${bucket}`;
  const resp = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Storage delete failed (${resp.status}): ${text}`);
  }
}

/**
 * Web direct upload: uses fetch() to POST raw bytes straight to the
 * Supabase Storage REST endpoint. Replaces the Supabase JS SDK .upload()
 * method entirely — no Blob conversion, no SDK abstraction layer.
 */
export async function uploadBytesToStorage(
  body: Blob | Uint8Array,
  bucket: string,
  path: string,
  mimeType: string,
  upsert = false,
  signal?: AbortSignal,
  timeoutMs = WEB_UPLOAD_TIMEOUT_MS,
): Promise<string> {
  const safePath = encodeStoragePath(path);
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${safePath}`;
  const normalizedMime = mimeType.toLowerCase().trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${supabaseAnonKey}`,
    'Content-Type': normalizedMime,
    'x-upsert': upsert ? 'true' : 'false',
    'Cache-Control': '360000',
  };

  // On React Native native, the Blob constructor is unreliable — it can
  // mangle binary data or produce a text payload that Supabase Storage
  // rejects with 400. Use ArrayBuffer as the fetch body instead, which
  // RN's networking stack treats as raw bytes. On web, Blob is the
  // correct and efficient choice (avoids copying).
  let fetchBody: BodyInit;
  let bodySize: number;
  if (body instanceof Blob) {
    fetchBody = body;
    bodySize = body.size;
  } else if (Platform.OS === 'web') {
    fetchBody = new Blob([body as BlobPart], { type: normalizedMime });
    bodySize = body.byteLength;
  } else {
    fetchBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    bodySize = body.byteLength;
  }
  if (!bodySize || bodySize <= 0) {
    throw new Error('업로드할 데이터의 크기가 0바이트입니다.');
  }

  // Hermes GC tick: yield to the event loop so the JS engine can collect
  // any intermediate ArrayBuffer/base64 from compression before the
  // native socket opens. Prevents memory spikes and socket deadlocks.
  await new Promise<void>((r) => setTimeout(r, 10));

  const controller = new AbortController();
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('업로드 시간이 초과되었습니다. 네트워크 연결을 확인 후 다시 시도해주세요.'));
    }, timeoutMs);
  });

  let resp: Response;
  try {
    resp = await Promise.race([
      fetch(uploadUrl, { method: 'POST', headers, body: fetchBody, signal: combinedSignal }),
      timeout,
    ]).finally(() => clearTimeout(timer!));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) throw err;
      throw new Error('업로드 시간이 초과되었습니다. 네트워크 연결을 확인 후 다시 시도해주세요.');
    }
    logError(err, { component: 'imageEdit', action: 'uploadBytesToStorage' });
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error(`[UPLOAD FAIL] uploadBytesToStorage status=${resp.status} body=${text}`);
    logError(new Error(`uploadBytesToStorage [${resp.status}] body=${text}`), { component: 'imageEdit', action: 'uploadBytesToStorage', extra: { status: resp.status, body: text } });
    if (resp.status === 403) {
      throw new Error(`업로드 실패 [403] — 권한 거부: ${text || '접근 권한 없음'}`);
    }
    throw new Error(`Upload failed (${resp.status}): ${text}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${safePath}`;
}
