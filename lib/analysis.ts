import { Platform } from 'react-native';
import type { AnalysisResult } from '@/types/database';
import { supabase, ANALYSIS_FUNCTION_URL, TTS_FUNCTION_URL, supabaseAnonKey, supabaseUrl, EXTRACT_VIDEO_FRAME_URL } from '@/lib/supabase';
import { safeFetch } from '@/lib/apiClient';
import { generateAffiliateLinks } from '@/lib/affiliate';
import { getUserSettings } from '@/lib/settings';
import { base64ToUint8Array, buildDataUrl, uint8ArrayToBase64 } from '@/lib/base64';
import { enqueueAndWait } from '@/lib/jobQueue';
import { deductCredits, refundCredits } from '@/lib/credits';
import { compressBase64ForUpload, prepareImageForApi, base64ToBlob, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY, UPLOAD_MAX_PAYLOAD_BYTES, compressDataUrlToMaxBytes, uploadBytesToStorage } from '@/lib/imageEdit';
import { compressUriToUri, uploadFileDirectNative } from '@/lib/imageEdit';
import { compressForEdgeFunction } from '@/lib/parallelImageCompress';
import { aiCachedCall } from '@/lib/aiCache';
import { hashObject } from '@/lib/contentHash';
import { cleanBase64 } from '@/lib/base64';
import { getOpenAiVoiceParams } from '@/lib/ttsVoices';
import { sanitizeEncodedText } from '@/lib/textSanitizer';
import { nativeHeapCooldownGuard } from '@/lib/imageEdit';
import { waitForFileChannelFlush } from '@/lib/smartResize';
import { isUploadCircuitOpen, recordUploadSuccess, recordUploadFailure } from '@/lib/uploadCircuitBreaker';
import { logUploadStart, logUploadEvent } from '@/lib/uploadDebugLogger';

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const abortError = () => {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
  };
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

const UPLOAD_TIMEOUT_MS = 60_000;
const COMPRESS_TIMEOUT_MS = 20_000;
const UPLOAD_RETRY_MAX = 3;
const UPLOAD_RETRY_BASE_MS = 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} (시간 초과)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function withUploadTimeout<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (signal) { try { signal.dispatchEvent(new Event('abort')); } catch { /* ignore */ } }
      reject(new Error('이미지 업로드 시간이 초과되었습니다. 네트워크 연결을 확인 후 다시 시도해주세요.'));
    }, UPLOAD_TIMEOUT_MS);
  });
  const base = signal ? raceWithAbort(promise, signal) : promise;
  return Promise.race([base, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Retry an upload with exponential backoff. Each image in a multi-angle
 * chain uploads independently — a single timeout on a flaky network should
 * not collapse the entire analysis pipeline.
 */
export async function uploadWithRetry(
  b64: string,
  mimeType: string,
  signal?: AbortSignal,
  alreadyCompressed = false,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < UPLOAD_RETRY_MAX; attempt++) {
    if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');
    if (isUploadCircuitOpen()) {
      throw new Error('네트워크 연결이 불안정하여 업로드가 일시 중단되었습니다. 잠시 후 다시 시도해주세요.');
    }
    try {
      const result = await uploadImage(b64, mimeType, signal, alreadyCompressed);
      recordUploadSuccess();
      return result;
    } catch (error) {
      lastError = error;
      recordUploadFailure();
      if (signal?.aborted) throw error;
      if (attempt < UPLOAD_RETRY_MAX - 1) {
        const delayMs = UPLOAD_RETRY_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

export async function uploadImage(
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
  alreadyCompressed = false,
): Promise<string> {
  let compressedBase64 = base64;
  let compressedMime = mimeType;
  if (!alreadyCompressed) {
    const result = await compressBase64ForUpload(base64, mimeType);
    compressedBase64 = result.base64;
    compressedMime = result.mimeType;
  }
  if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');

  await waitForFileChannelFlush();

  const uploadMime = compressedMime || 'image/jpeg';
  const ext = uploadMime === 'image/png' ? 'png'
    : uploadMime === 'image/webp' ? 'webp'
    : uploadMime === 'image/heic' ? 'heic'
    : 'jpg';

  // Native: write base64 to a temp file and upload via FileSystem.uploadAsync,
  // bypassing the JS bridge entirely. The JS bridge serializes binary data
  // through Hermes, which causes memory spikes and bridge timeouts on large
  // images. FileSystem.uploadAsync streams the file natively.
  if (Platform.OS !== 'web') {
    const { writeBase64ToTempFile } = await import('@/lib/imageEdit');
    const { unpinTempFile, safeDeleteTempFile } = await import('@/lib/tempFileManager');
    const tmpPath = await writeBase64ToTempFile(compressedBase64, ext);
    compressedBase64 = '';
    if (tmpPath) {
      try {
        const ext2 = uploadMime === 'image/png' ? 'png'
          : uploadMime === 'image/webp' ? 'webp'
          : uploadMime === 'image/heic' ? 'heic'
          : 'jpg';
        const fileName2 = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext2}`;
        const publicUrl = await withUploadTimeout(
          uploadFileDirectNative(tmpPath, 'scans', fileName2, uploadMime),
          signal,
        );
        return publicUrl;
      } finally {
        unpinTempFile(tmpPath);
        await safeDeleteTempFile(tmpPath).catch(() => {});
        await waitForFileChannelFlush();
      }
    }
  }

  // Web: upload raw bytes directly via fetch to Supabase Storage REST API
  const uploadBlob = base64ToBlob(compressedBase64, uploadMime);
  const uploadSize = uploadBlob instanceof Blob ? uploadBlob.size : (uploadBlob as Uint8Array).byteLength;
  compressedBase64 = '';

  const fileName = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/scans/${fileName}`;
  const finishLog = logUploadStart({
    path: 'rest_fetch',
    url: uploadUrl,
    mimeType: uploadMime,
    fileSize: uploadSize,
  });

  try {
    const publicUrl = await withUploadTimeout(
      uploadBytesToStorage(uploadBlob, 'scans', fileName, uploadMime),
      signal,
    );
    finishLog({ status: 200 });
    return publicUrl;
  } catch (err) {
    finishLog({ error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function uploadImageBlob(
  blob: Blob | Uint8Array,
  mimeType: string,
  alreadyCompressed = false,
  signal?: AbortSignal,
): Promise<string> {
  // If the blob is already small enough, upload as-is to avoid double-compression
  const MAX_RAW_BLOB_BYTES = 800_000; // ~800KB threshold
  let uploadBlob: Blob | Uint8Array = blob;
  let uploadMime = mimeType;

  if (!alreadyCompressed && blob instanceof Blob && blob.size > MAX_RAW_BLOB_BYTES && mimeType.startsWith('image/')) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      let compressed = await prepareImageForApi(dataUrl, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      const b64 = cleanBase64(compressed);
      const payloadBytes = Math.floor((b64.length * 3) / 4);
      if (payloadBytes > UPLOAD_MAX_PAYLOAD_BYTES) {
        compressed = await compressDataUrlToMaxBytes(dataUrl, UPLOAD_MAX_PAYLOAD_BYTES, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      }
      const compressedBase64 = cleanBase64(compressed);
      const compressedMime = compressed.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
      uploadBlob = base64ToBlob(compressedBase64, compressedMime);
      uploadMime = compressedMime;
    } catch {
      // If re-compression fails, proceed with the original blob
    }
  }

  const ext = uploadMime === 'image/png' ? 'png'
    : uploadMime === 'image/webp' ? 'webp'
    : uploadMime === 'image/heic' ? 'heic'
    : 'jpg';

  // Native: write bytes to a temp file and upload via FileSystem.uploadAsync,
  // bypassing the JS bridge. This avoids the Hermes bridge bottleneck that
  // causes memory spikes and session timeouts on binary uploads.
  if (Platform.OS !== 'web') {
    const FileSystem = await import('expo-file-system/legacy');
    const { registerTempFile, unpinTempFile, safeDeleteTempFile } = await import('@/lib/tempFileManager');
    const docDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (docDir) {
      const tmpPath = `${docDir}blob-up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      try {
        // Convert blob/Uint8Array to base64 for writeAsStringAsync
        let bytes: Uint8Array;
        if (uploadBlob instanceof Uint8Array) {
          bytes = uploadBlob;
        } else {
          const ab = await (uploadBlob as Blob).arrayBuffer();
          bytes = new Uint8Array(ab);
        }
        const b64 = uint8ArrayToBase64(bytes);
        await FileSystem.writeAsStringAsync(tmpPath, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        registerTempFile(tmpPath, 'uploadImageBlob', { pin: true });

        const ext2 = uploadMime === 'image/png' ? 'png'
          : uploadMime === 'image/webp' ? 'webp'
          : uploadMime === 'image/heic' ? 'heic'
          : 'jpg';
        const fileName2 = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext2}`;
        const publicUrl = await withUploadTimeout(
          uploadFileDirectNative(tmpPath, 'scans', fileName2, uploadMime),
          signal,
        );
        return publicUrl;
      } finally {
        unpinTempFile(tmpPath);
        await safeDeleteTempFile(tmpPath).catch(() => {});
        await waitForFileChannelFlush();
      }
    }
  }

  // Web: upload raw bytes directly via fetch to Supabase Storage REST API
  const fileName = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/scans/${fileName}`;
  const blobSize = uploadBlob instanceof Blob ? uploadBlob.size : (uploadBlob as Uint8Array).byteLength;
  const finishLog = logUploadStart({
    path: 'rest_fetch',
    url: uploadUrl,
    mimeType: uploadMime,
    fileSize: blobSize,
  });

  try {
    const publicUrl = await withUploadTimeout(
      uploadBytesToStorage(uploadBlob, 'scans', fileName, uploadMime),
      signal,
    );
    finishLog({ status: 200 });
    return publicUrl;
  } catch (err) {
    finishLog({ error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/**
 * Upload a file URI directly to Supabase Storage without ever converting
 * to base64. On native, compresses the file to a smaller JPEG file via
 * ImageManipulator, then uploads via FileSystem.uploadAsync — the native
 * networking module streams the file directly, never touching JS memory.
 */
export async function uploadCompressedUri(
  fileUri: string,
  signal?: AbortSignal,
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('uploadCompressedUri is not supported on web');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < UPLOAD_RETRY_MAX; attempt++) {
    if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');
    if (isUploadCircuitOpen()) {
      throw new Error('네트워크 연결이 불안정하여 업로드가 일시 중단되었습니다. 잠시 후 다시 시도해주세요.');
    }
    let compressedUri: string | null = null;
    try {
      compressedUri = await compressUriToUri(fileUri, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      const FileSystem = await import('expo-file-system/legacy');
      const info = await FileSystem.getInfoAsync(compressedUri);
      if (!info.exists || (info.size !== undefined && info.size > UPLOAD_MAX_PAYLOAD_BYTES)) {
        // Re-compress at lower quality if file is too large
        const reCompressed = await compressUriToUri(fileUri, 480, 0.5);
        await FileSystem.deleteAsync(compressedUri, { idempotent: true }).catch(() => {});
        compressedUri = reCompressed;
      }
      if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');
      let fileSize: number | undefined;
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const info = await FileSystem.getInfoAsync(compressedUri);
        if (info.exists) fileSize = info.size;
      } catch { /* best-effort */ }
      const uploadUrl = `${supabaseUrl}/storage/v1/object/scans/scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const finishLog = logUploadStart({
        path: 'native_uploadAsync',
        url: uploadUrl,
        fileUri: compressedUri,
        fileSize,
        mimeType: 'image/jpeg',
        attempt,
      });
      const uploadFileName = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      try {
        const publicUrl = await withUploadTimeout(
          uploadFileDirectNative(compressedUri, 'scans', uploadFileName, 'image/jpeg'),
          signal,
        );
        finishLog({ status: 200 });
        recordUploadSuccess();
        return publicUrl;
      } catch (err) {
        finishLog({ error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    } catch (error) {
      lastError = error;
      recordUploadFailure();
      if (signal?.aborted) throw error;
      if (attempt < UPLOAD_RETRY_MAX - 1) {
        const delayMs = UPLOAD_RETRY_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
    } finally {
      if (compressedUri) {
        const FileSystem = await import('expo-file-system/legacy');
        await FileSystem.deleteAsync(compressedUri, { idempotent: true }).catch(() => {});
      }
    }
  }
  throw lastError;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Blob 변환 실패'));
      reader.readAsDataURL(blob);
    });
  }
  // Native: FileReader doesn't exist on Hermes/JSC
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = uint8ArrayToBase64(bytes);
  const mimeType = blob.type || 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

const VIDEO_UPLOAD_TIMEOUT_MS = 120_000;

export async function uploadVideoBlob(
  uri: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  const ext = mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const fileName = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Native: use FileSystem.uploadAsync to stream the file directly from disk
  // to Supabase Storage, completely bypassing the JS bridge. Reading the
  // entire video into JS memory as base64/Uint8Array causes OOM and bridge
  // timeouts on large videos.
  if (Platform.OS !== 'web') {
    const FileSystem = await import('expo-file-system/legacy');
    let readableUri = uri;
    let tempCopy: string | null = null;
    if (uri.startsWith('content://')) {
      const upDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!upDir) throw new Error('임시 저장 공간을 사용할 수 없습니다.');
      tempCopy = `${upDir}video-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
      const COPY_TIMEOUT_MS = 60_000;
      let copyTimer: ReturnType<typeof setTimeout>;
      const copyTimeout = new Promise<never>((_, reject) => {
        copyTimer = setTimeout(() => reject(new Error('동영상 파일 복사 시간이 초과되었습니다.')), COPY_TIMEOUT_MS);
      });
      await Promise.race([
        FileSystem.copyAsync({ from: uri, to: tempCopy }),
        copyTimeout,
      ]).finally(() => clearTimeout(copyTimer!));
      readableUri = tempCopy;
    }
    try {
      const info = await FileSystem.getInfoAsync(readableUri);
      if (!info.exists || info.size <= 0) {
        throw new Error('동영상 파일을 찾을 수 없습니다.');
      }
      if (info.size > 30_000_000) {
        throw new Error('영상 파일이 너무 큽니다. 30MB 이하의 짧은 영상으로 다시 촬영해주세요.');
      }

      const uploadUrl = `${supabaseUrl}/storage/v1/object/scans/${fileName}`;
      const finishLog = logUploadStart({
        path: 'native_uploadAsync',
        url: uploadUrl,
        mimeType,
        fileSize: info.size,
      });

      // Primary: BINARY_CONTENT. Fallback: MULTIPART for OEM stacks that
      // mishandle raw binary POST bodies (same rationale as uploadFileDirectNative).
      let result: { status: number; body?: string } | null = null;
      try {
        const uploadPromise = FileSystem.uploadAsync(uploadUrl, readableUri, {
          httpMethod: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': mimeType,
            'x-upsert': 'false',
          },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });
        let timer: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('동영상 업로드 시간이 초과되었습니다.')), VIDEO_UPLOAD_TIMEOUT_MS);
        });
        const base = signal ? raceWithAbort(uploadPromise, signal) : uploadPromise;
        result = await Promise.race([base, timeout]).finally(() => clearTimeout(timer!));
        if (result.status >= 400) result = null;
      } catch {
        result = null;
      }

      if (!result) {
        const uploadPromise = FileSystem.uploadAsync(uploadUrl, readableUri, {
          httpMethod: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType,
          parameters: { upsert: 'false' },
        });
        let timer: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('동영상 업로드 시간이 초과되었습니다.')), VIDEO_UPLOAD_TIMEOUT_MS);
        });
        const base = signal ? raceWithAbort(uploadPromise, signal) : uploadPromise;
        result = await Promise.race([base, timeout]).finally(() => clearTimeout(timer!));
      }

      if (result.status >= 400) {
        finishLog({ error: `HTTP ${result.status}` });
        throw new Error(`동영상 업로드 실패 (${result.status})`);
      }

      finishLog({ status: 200 });
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/scans/${fileName}`;
      return publicUrl;
    } finally {
      if (tempCopy) await FileSystem.deleteAsync(tempCopy, { idempotent: true }).catch(() => {});
    }
  }

  // Web fallback: read via fetch and upload through supabase JS SDK
  const resp = await fetch(uri);
  let body: Uint8Array;
  try {
    const buf = await resp.arrayBuffer();
    body = new Uint8Array(buf);
  } finally {
    if (resp.body) resp.body.cancel().catch(() => {});
  }

  const videoUploadUrl = `${supabaseUrl}/storage/v1/object/scans/${fileName}`;
  const finishLog = logUploadStart({
    path: 'rest_fetch',
    url: videoUploadUrl,
    mimeType,
    fileSize: body.byteLength,
  });

  const uploadPromise = uploadBytesToStorage(body, 'scans', fileName, mimeType);

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('동영상 업로드 시간이 초과되었습니다.')), VIDEO_UPLOAD_TIMEOUT_MS);
  });
  const base = signal ? raceWithAbort(uploadPromise, signal) : uploadPromise;
  await Promise.race([base, timeout]).finally(() => clearTimeout(timer!));

  finishLog({ status: 200 });
  return `${supabaseUrl}/storage/v1/object/public/scans/${fileName}`;
}

export async function extractVideoFrameFromServer(
  videoUrl: string,
  maxDimension: number,
  quality: number,
  signal?: AbortSignal,
): Promise<{ base64: string; mimeType: string; frameUrl?: string }> {
  const response = await safeFetch(EXTRACT_VIDEO_FRAME_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ videoUrl, maxDimension, quality }),
    timeoutMs: 90000,
    signal,
  });

  try {
    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: '프레임 추출 서버 오류' }));
      throw new Error(errData.error || `프레임 추출 실패 (${response.status})`);
    }

    const data = await response.json();
    if (data?.error) throw new Error(data.error);
    if (!data?.base64 && !data?.frameUrl) throw new Error('프레임 추출 결과가 없습니다.');

    return {
      base64: data.base64 || '',
      mimeType: 'image/jpeg',
      ...(data.frameUrl ? { frameUrl: data.frameUrl } : {}),
    };
  } finally {
    if (response.body) response.body.cancel().catch(() => {});
  }
}

export async function analyzeImage(
  imageDataUrl: string,
  fileName: string,
  mimeType: string,
  mode: 'single' | 'multi' = 'multi',
): Promise<AnalysisResult> {
  const compressed = await withTimeout(compressForEdgeFunction(imageDataUrl), COMPRESS_TIMEOUT_MS, '이미지 압축');
  const b64 = cleanBase64(compressed.dataUrl);
  const cacheInput = { task: 'analyze-photo', mode, imageHash: hashObject({ b64 }).slice(0, 16) };

  const { data } = await aiCachedCall<AnalysisResult>(
    'analyze-photo',
    cacheInput,
    async () => {
      await deductCredits('photo_analysis');
      try {
      const imageUrl = await uploadWithRetry(b64, compressed.mimeType, undefined, true);
      const response = await safeFetch(ANALYSIS_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ imageUrl, fileName, mimeType: compressed.mimeType, mode }),
      timeoutMs: 115000,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'AI 분석 서버 오류가 발생했습니다.' }));
      throw new Error(errData.error || `AI 분석 실패 (${response.status})`);
    }

    const respData = await response.json().catch(() => ({} as Record<string, unknown>));
    if (respData?.error) throw new Error(respData.error);

    return normalizeAnalysis(respData);
      } catch (err) {
        await refundCredits('photo_analysis');
        throw err;
      }
  },
    'gpt-4o',
  );
  return data;
}

export async function analyzeMultiShot(
  base64Images: string[],
  fileName: string,
): Promise<AnalysisResult> {
  // Stream each image through compress→upload→release so only one
  // image's base64 is live at a time, preventing heap OOM on mobile.
  const imageHashes: string[] = [];
  const imageUrls: string[] = [];
  const srcCopy = [...base64Images];

  for (let i = 0; i < srcCopy.length; i++) {
    const dataUrl = buildDataUrl(srcCopy[i], 'image/jpeg');
    srcCopy[i] = ''; // release source string for GC
    const compressed = await withTimeout(compressForEdgeFunction(dataUrl), COMPRESS_TIMEOUT_MS, `이미지 압축 (${i + 1}/${srcCopy.length})`);
    const b64 = cleanBase64(compressed.dataUrl);
    imageHashes.push(hashObject({ b64 }).slice(0, 16));
    const url = await uploadWithRetry(b64, compressed.mimeType, undefined, true);
    imageUrls.push(url);
    if (i < srcCopy.length - 1) await nativeHeapCooldownGuard();
  }

  const cacheInput = {
    task: 'multi-shot',
    imageHashes,
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'multi-shot',
    cacheInput,
    async () => {
      await deductCredits('multi_shot_analysis');
      try {
      const response = await safeFetch(ANALYSIS_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ images: imageUrls, fileName, mode: 'multi-shot' }),
        timeoutMs: 115000,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'AI 다각도 분석 서버 오류가 발생했습니다.' }));
        throw new Error(errData.error || `AI 다각도 분석 실패 (${response.status})`);
      }

      const respData = await response.json().catch(() => ({} as Record<string, unknown>));
      if (respData?.error) throw new Error(respData.error);

      return normalizeAnalysis(respData);
      } catch (err) {
        await refundCredits('multi_shot_analysis');
        throw err;
      }
    },
    'gpt-4o',
  );
  return data;
}

const UNKNOWN_PRODUCT_NAMES = new Set([
  '',
  '알 수 없음',
  '알수없음',
  'unknown',
  'unknown product',
  'identified product',
  'product captured',
]);
const FALLBACK_PRODUCT_NAME = '지금 가장 핫한 추천 아이템';
const FALLBACK_COMMERCE_PHRASE = '시선 집중! 지금 바로 확인하세요';

const UNKNOWN_PATTERNS = [
  /알\s*수\s*없/gi,
  /알수없/gi,
  /unknown/gi,
  /미확인/gi,
  /미상/gi,
  /unidentified/gi,
  /not\s*identified/gi,
];

function sanitizeText(value: string): string {
  if (!value) return value;
  let result = value;
  for (const pattern of UNKNOWN_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, FALLBACK_COMMERCE_PHRASE);
  }
  return result;
}

function normalizeProductName(name: string | undefined): string {
  const trimmed = (name || '').trim();
  if (UNKNOWN_PRODUCT_NAMES.has(trimmed.toLowerCase())) {
    return FALLBACK_PRODUCT_NAME;
  }
  for (const pattern of UNKNOWN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(trimmed)) {
      return FALLBACK_PRODUCT_NAME;
    }
  }
  return trimmed;
}

function normalizeAnalysis(data: Record<string, unknown>): AnalysisResult {
  const productName = sanitizeEncodedText(normalizeProductName(data.productName as string));
  const rawOneLiner = sanitizeEncodedText(sanitizeText((data.oneLiner as string) || ''));
  const rawSummary = sanitizeEncodedText(sanitizeText((data.summary as string) || ''));
  const rawTitle = sanitizeEncodedText(sanitizeText((data.title as string) || 'Product Captured'));
  const rawHook = sanitizeEncodedText(sanitizeText((data.hook as string) || ''));
  const rawCaption = sanitizeEncodedText(sanitizeText((data.caption as string) || ''));
  return {
    title: rawTitle,
    summary: rawSummary,
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    productName,
    productCategory: (data.productCategory as string) || 'product',
    priceEstimate: (data.priceEstimate as string) || '',
    oneLiner: rawOneLiner,
    shoppingMatches: Array.isArray(data.shoppingMatches) ? data.shoppingMatches : [],
    templateData: (data.templateData as AnalysisResult['templateData']) || {
      priceLabel: (data.priceEstimate as string) || '',
      oneLiner: rawOneLiner,
      category: (data.productCategory as string) || '',
      accentColor: '#2f9dff',
      hook: rawHook,
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
      productAdvantages: Array.isArray(data.productAdvantages) ? data.productAdvantages : [],
      caption: rawCaption,
      psychologyInsight: null,
    },
    detectedProducts: Array.isArray(data.detectedProducts) ? data.detectedProducts : [],
  };
}

export async function saveScan(
  imageUrl: string,
  analysis: AnalysisResult,
  additionalImageUrls: string[] = [],
  scanSource: 'single' | 'multi' | 'template' = 'single',
): Promise<string> {
  const settings = await getUserSettings();
  const affiliateLinks = generateAffiliateLinks(analysis, settings);

  const scanPayload: Record<string, unknown> = {
    image_url: imageUrl,
    scan_source: scanSource,
    title: analysis.title,
    summary: analysis.summary,
    contacts: analysis.contacts,
    tags: analysis.tags,
    product_name: analysis.productName,
    product_category: analysis.productCategory,
    price_estimate: analysis.priceEstimate,
    one_liner: analysis.oneLiner,
    shopping_matches: analysis.shoppingMatches,
    affiliate_links: affiliateLinks,
    template_data: analysis.templateData,
    detected_products: analysis.detectedProducts,
  };

  if (additionalImageUrls.length > 0) {
    scanPayload.additional_image_urls = additionalImageUrls;
  }

  const { data, error } = await supabase
    .from('scans')
    .insert(scanPayload)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to save scan: ${error.message}`);

  const hookText = analysis.templateData?.hook || analysis.oneLiner || '';
  if (hookText) {
    generateAndUploadTTS(data.id, hookText).catch(() => {});
  }

  return data.id;
}

async function generateAndUploadTTS(scanId: string, text: string): Promise<void> {
  let voice = 'alloy';
  let speed = 1.0;
  let pitch = 0;
  let ttsApiKey: string | null = null;
  try {
    const settings = await getUserSettings();
    if (settings?.default_tts_voice) {
      const params = getOpenAiVoiceParams(settings.default_tts_voice, settings.tts_speed);
      voice = params.voice;
      speed = params.speed;
    }
    if (settings?.tts_pitch != null) pitch = settings.tts_pitch;
    ttsApiKey = settings?.tts_api_key ?? null;
  } catch {
    // use defaults
  }
  const response = await safeFetch(TTS_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ text, voice, speed, pitch, ttsApiKey }),
    timeoutMs: 115000,
  });
  if (!response.ok) return;
  let data: { audioBase64?: string };
  try {
    data = await response.json();
  } catch {
    return;
  }
  if (!data?.audioBase64) return;

  const audioBytes = base64ToUint8Array(data.audioBase64);
  const fileName = `tts-${scanId}-${Date.now()}.mp3`;
  let ttsPublicUrl = '';

  // Native: write audio to temp file and upload via FileSystem.uploadAsync
  if (Platform.OS !== 'web') {
    try {
      const { writeBase64ToTempFile, uploadFileDirectNative: nativeUpload } = await import('@/lib/imageEdit');
      const { unpinTempFile, safeDeleteTempFile } = await import('@/lib/tempFileManager');
      const tmpPath = await writeBase64ToTempFile(data.audioBase64, 'mp3');
      if (tmpPath) {
        try {
          ttsPublicUrl = await nativeUpload(tmpPath, 'scans', fileName, 'audio/mpeg');
        } finally {
          unpinTempFile(tmpPath);
          await safeDeleteTempFile(tmpPath).catch(() => {});
        }
      }
    } catch { /* fall back to JS SDK */ }
  }

  if (!ttsPublicUrl) {
    try {
      const { uploadBytesToStorage } = await import('@/lib/imageEdit');
      ttsPublicUrl = await uploadBytesToStorage(audioBytes, 'scans', fileName, 'audio/mpeg');
    } catch {
      return;
    }
  }

  if (!ttsPublicUrl) return;

  const { error: ttsUpdateError } = await supabase.from('scans').update({ tts_url: ttsPublicUrl }).eq('id', scanId);
  if (ttsUpdateError) return;
}

export async function saveManualScan(
  imageUrl: string,
): Promise<string> {
  const DB_TIMEOUT_MS = 45_000;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('스캔 저장 시간이 초과되었습니다.')), DB_TIMEOUT_MS);
  });
  const { data, error } = await Promise.race([
    supabase
      .from('scans')
      .insert({
        image_url: imageUrl,
        scan_source: 'template',
        title: '직접 만든 템플릿',
        summary: '',
        contacts: [],
        tags: [],
        product_name: '',
        product_category: '',
        price_estimate: '',
        one_liner: '',
        shopping_matches: [],
        affiliate_links: [],
        template_data: {
          priceLabel: '',
          oneLiner: '',
          category: '',
          accentColor: '#2f9dff',
          hook: '',
          hashtags: [],
          productAdvantages: [],
          caption: '',
          psychologyInsight: null,
        },
        detected_products: [],
      })
      .select('id')
      .single(),
    timeout,
  ]).finally(() => clearTimeout(timer!));

  if (error) throw new Error(`Failed to save scan: ${error.message}`);
  return data.id;
}

export async function deleteScan(id: string): Promise<void> {
  const { error } = await supabase.from('scans').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete: ${error.message}`);
}

function trimText(text: string, max: number): string {
  if (text.length <= max) return text;
  let trimmed = text.slice(0, max);
  // If the cut landed between a surrogate pair, back up one unit
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    trimmed = trimmed.slice(0, -1);
  }
  return sanitizeEncodedText(trimmed.trimEnd() + '\u2026');
}

export async function updateScanWithAnalysis(
  scanId: string,
  analysis: AnalysisResult,
): Promise<void> {
  const settings = await getUserSettings();
  const affiliateLinks = generateAffiliateLinks(analysis, settings);

  const td = analysis.templateData;
  const cleanTemplateData = td ? {
    priceLabel: td.priceLabel,
    oneLiner: trimText(td.oneLiner, 80),
    category: td.category,
    accentColor: td.accentColor,
    hook: trimText(td.hook, 60),
    hashtags: (td.hashtags || []).slice(0, 8),
    productAdvantages: (td.productAdvantages || []).slice(0, 3).map((a) => trimText(a, 60)),
    caption: trimText(td.caption, 120),
    ...(td.platformVariants ? { platformVariants: td.platformVariants } : {}),
  } : undefined;

  const { error } = await supabase.from('scans').update({
    title: trimText(analysis.title, 40),
    summary: trimText(analysis.summary, 200),
    contacts: analysis.contacts,
    tags: (analysis.tags || []).slice(0, 8),
    product_name: analysis.productName,
    product_category: analysis.productCategory,
    price_estimate: analysis.priceEstimate,
    one_liner: trimText(analysis.oneLiner, 80),
    shopping_matches: analysis.shoppingMatches,
    affiliate_links: affiliateLinks,
    ...(cleanTemplateData ? { template_data: cleanTemplateData } : {}),
    detected_products: analysis.detectedProducts,
    scan_source: 'single',
  }).eq('id', scanId);

  if (error) throw new Error(`Failed to update scan: ${error.message}`);

  const hookText = td?.hook || analysis.oneLiner || '';
  if (hookText) {
    generateAndUploadTTS(scanId, hookText).catch(() => {});
  }
}

export async function analyzeImageWithProductContext(
  imageDataUrl: string,
  fileName: string,
  mimeType: string,
  mode: 'single' | 'multi' = 'multi',
  productContext?: { productName?: string; description?: string; price?: string; brand?: string; platform?: string },
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const compressed = await withTimeout(compressForEdgeFunction(imageDataUrl), COMPRESS_TIMEOUT_MS, '이미지 압축');
  const b64 = cleanBase64(compressed.dataUrl);
  const cacheInput = {
    task: 'analyze-photo-context',
    mode,
    imageHash: hashObject({ b64 }).slice(0, 16),
    productContext: productContext || {},
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'analyze-photo-context',
    cacheInput,
    async () => {
      await deductCredits('photo_analysis');
      try {
      const imageUrl = await uploadWithRetry(b64, compressed.mimeType, signal);
      const response = await safeFetch(ANALYSIS_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ imageUrl, fileName, mimeType: compressed.mimeType, mode, productContext }),
        timeoutMs: 115000,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'AI 분석 서버 오류가 발생했습니다.' }));
        throw new Error(errData.error || `AI 분석 실패 (${response.status})`);
      }

      const respData = await response.json().catch(() => ({} as Record<string, unknown>));
      if (respData?.error) throw new Error(respData.error);

      return normalizeAnalysis(respData);
      } catch (err) {
        await refundCredits('photo_analysis');
        throw err;
      }
    },
    'gpt-4o',
  );
  return data;
}

export async function extractProductMeta(
  url: string,
): Promise<{
  productName: string;
  description: string;
  price: string;
  originPrice: string;
  discountRate: string;
  currency: string;
  image: string;
  imageBase64: string;
  imageMimeType: string;
  platform: string;
  brand: string;
  availability: string;
  searchUrl: string;
  productId: string;
  extractionMethod: string;
}> {
  const extractUrl = `${supabaseUrl}/functions/v1/extract-product-meta`;
  const response = await safeFetch(extractUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ url }),
    timeoutMs: 115000,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: '상품 정보 추출 서버 오류가 발생했습니다.' }));
    throw new Error(errData.error || `상품 정보 추출 실패 (${response.status})`);
  }

  const data = await response.json().catch(() => ({}));
  if (data?.error) throw new Error(data.error);
  if (!data?.productMeta) throw new Error('상품 정보를 불러오지 못했습니다.');
  return data.productMeta;
}

export async function analyzeImageQueued(
  imageDataUrl: string,
  fileName: string,
  mimeType: string,
  mode: 'single' | 'multi' = 'multi',
  preferredStyle?: string,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const compressed = await withTimeout(compressForEdgeFunction(imageDataUrl), COMPRESS_TIMEOUT_MS, '이미지 압축');
  const b64 = cleanBase64(compressed.dataUrl);
  const cacheInput = {
    task: 'analyze-photo-queued',
    mode,
    imageHash: hashObject({ b64 }).slice(0, 16),
    preferredStyle: preferredStyle || '',
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'analyze-photo-queued',
    cacheInput,
    async () => {
      await deductCredits('photo_analysis');
      try {
      const imageUrl = await uploadWithRetry(b64, compressed.mimeType, signal);
      const result = await enqueueAndWait<Record<string, unknown>>(
        'analyze-photo',
        { imageUrl, fileName, mimeType: compressed.mimeType, mode, ...(preferredStyle ? { preferredStyle } : {}) },
        { timeoutMs: 115000 },
      );

      if (!result.success || !result.result) {
        throw new Error(result.error ?? 'AI 분석 작업이 실패했습니다.');
      }
      return normalizeAnalysis(result.result);
      } catch (err) {
        await refundCredits('photo_analysis');
        throw err;
      }
    },
    'gpt-4o',
  );
  return data;
}

export async function analyzeMultiShotQueued(
  base64Images: string[],
  fileName: string,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  // Stream each image through compress→upload→release to avoid holding
  // all compressed data URLs in memory simultaneously (heap OOM on mobile).
  const imageHashes: string[] = [];
  const imageUrls: string[] = [];
  const srcCopy = [...base64Images];

  for (let i = 0; i < srcCopy.length; i++) {
    if (signal?.aborted) throw new Error('다각도 분석이 취소되었습니다.');
    const dataUrl = buildDataUrl(srcCopy[i], 'image/jpeg');
    srcCopy[i] = ''; // release source string for GC
    const compressed = await withTimeout(compressForEdgeFunction(dataUrl), COMPRESS_TIMEOUT_MS, `이미지 압축 (${i + 1}/${srcCopy.length})`);
    const b64 = cleanBase64(compressed.dataUrl);
    imageHashes.push(hashObject({ b64 }).slice(0, 16));
    const url = await uploadWithRetry(b64, compressed.mimeType, signal);
    imageUrls.push(url);
    if (i < srcCopy.length - 1) await nativeHeapCooldownGuard();
  }

  const cacheInput = {
    task: 'multi-shot-queued',
    imageHashes,
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'multi-shot-queued',
    cacheInput,
    async () => {
      await deductCredits('multi_shot_analysis');
      try {
      const result = await enqueueAndWait<Record<string, unknown>>(
        'analyze-photo',
        { images: imageUrls, fileName, mode: 'multi-shot' },
        { timeoutMs: 115000 },
      );

      if (!result.success || !result.result) {
        throw new Error(result.error ?? 'AI 다각도 분석 작업이 실패했습니다.');
      }
      return normalizeAnalysis(result.result);
      } catch (err) {
        await refundCredits('multi_shot_analysis');
        throw err;
      }
    },
    'gpt-4o',
  );
  return data;
}
