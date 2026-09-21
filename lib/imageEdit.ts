import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Image as RNImage } from 'react-native';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { base64ToUint8Array, cleanBase64 } from '@/lib/base64';
import { safeFetch } from '@/lib/apiClient';

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
  return new Promise((resolve, reject) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new Error('이미지 크기를 불러올 수 없습니다')),
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
  return `data:${data?.mimeType || 'image/png'};base64,${base64}`;
}

export function base64ToBlob(base64: string, mimeType: string): Blob | Uint8Array {
  const bytes = base64ToUint8Array(base64);
  if (Platform.OS !== 'web') {
    return bytes;
  }
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
}

export async function compressImage(uri: string, maxWidth = 1080, quality = 0.8): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export const UPLOAD_MAX_DIMENSION = 1080;
export const UPLOAD_QUALITY = 0.68;
const CAPTURE_MAX_DIMENSION = 1080;
const CAPTURE_QUALITY = 0.78;

export async function compressCaptureFrameToBlob(
  base64: string,
  mimeType: string,
): Promise<{ blob: Blob | Uint8Array; base64: string; mimeType: string }> {
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
  const dataUrl = `data:${mimeType};base64,${base64}`;

  if (Platform.OS === 'web') {
    try {
      const compressed = await prepareImageForApi(dataUrl, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      const compressedMime = compressed.startsWith('data:image/webp') ? 'image/webp' : mimeType;
      return { base64: cleanBase64(compressed), mimeType: compressedMime };
    } catch {
      return { base64, mimeType };
    }
  }

  try {
    const compressed = await prepareImageForApi(dataUrl, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
    return { base64: cleanBase64(compressed), mimeType: 'image/jpeg' };
  } catch {
    return { base64, mimeType };
  }
}

export async function compressImageToBase64(
  uri: string,
  maxDimension = 1080,
  quality = 0.7,
): Promise<{ base64: string; mimeType: string }> {
  const { width: origW, height: origH } = await getImageSize(uri);
  const longer = Math.max(origW, origH);
  const actions =
    longer > maxDimension
      ? origW >= origH
        ? [{ resize: { width: maxDimension } }]
        : [{ resize: { height: maxDimension } }]
      : [];
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    actions,
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mimeType: 'image/jpeg' };
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
  const bgUrl = `/bg-${bgStyle}.webp`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return compositeOnBackgroundWeb(productDataUrl, bgUrl);
  }

  return compositeOnBackgroundNative(productDataUrl, bgUrl);
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

  return canvas.toDataURL('image/png', 0.95);
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
  maxDimension = 1024,
  quality = 0.8,
  moodFilter: MoodFilterType = 'none',
): Promise<string> {
  const normalizedDataUrl = normalizeImageDataUrl(dataUrl);
  if (Platform.OS === 'web') {
    try {
      const img = await loadImageElement(normalizedDataUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      // Round dimensions to multiples of 8 for better JPEG/WebP block encoding efficiency
      const rawW = Math.round(img.naturalWidth * scale);
      const rawH = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = rawW - (rawW % 8);
      canvas.height = rawH - (rawH % 8);
      const ctx = canvas.getContext('2d');
      if (!ctx) return normalizedDataUrl;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (moodFilter !== 'none') {
        applyMoodOverlay(ctx, canvas.width, canvas.height, moodFilter);
      }
      // Use WebP when the browser supports it (smaller payload), fall back to JPEG
      const result = canvas.toDataURL('image/webp', quality);
      canvas.width = 0;
      canvas.height = 0;
      return result;
    } catch {
      return normalizedDataUrl;
    }
  }

  const { width: origW, height: origH } = await getImageSize(normalizedDataUrl);
  const longer = Math.max(origW, origH);
  const actions =
    longer > maxDimension
      ? origW >= origH
        ? [{ resize: { width: maxDimension } }]
        : [{ resize: { height: maxDimension } }]
      : [];
  const manipulated = await ImageManipulator.manipulateAsync(
    normalizedDataUrl,
    actions,
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );

  const fileInfo = await FileSystem.getInfoAsync(manipulated.uri);
  if (!fileInfo.exists) throw new Error('이미지 변환 실패');
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/jpeg;base64,${base64}`;
}

export async function prepareImageForEdit(
  dataUrl: string,
  maxDimension = 1024,
): Promise<string> {
  const normalizedDataUrl = normalizeImageDataUrl(dataUrl);
  if (Platform.OS === 'web') {
    try {
      const img = await loadImageElement(normalizedDataUrl);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return normalizedDataUrl;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/png');
      canvas.width = 0;
      canvas.height = 0;
      return result;
    } catch {
      return normalizedDataUrl;
    }
  }

  const { width: origW, height: origH } = await getImageSize(normalizedDataUrl);
  const longer = Math.max(origW, origH);
  const actions =
    longer > maxDimension
      ? origW >= origH
        ? [{ resize: { width: maxDimension } }]
        : [{ resize: { height: maxDimension } }]
      : [];
  const manipulated = await ImageManipulator.manipulateAsync(
    normalizedDataUrl,
    actions,
    { compress: 1, format: ImageManipulator.SaveFormat.PNG },
  );

  const fileInfo = await FileSystem.getInfoAsync(manipulated.uri);
  if (!fileInfo.exists) throw new Error('이미지 변환 실패');
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/png;base64,${base64}`;
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
  maxDimension = 1080,
  quality = 0.7,
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
    const w = Math.round(rawW * scale);
    const h = Math.round(rawH * scale);

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
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  return { base64, mimeType };
}
