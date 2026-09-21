import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export function cleanBase64(base64: string): string {
  if (!base64) return '';
  return base64.replace(/\s/g, '').replace(/^data:image\/\w+;base64,/, '');
}

export function getMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[\w+]+);/);
  return match ? match[1] : 'image/png';
}

export function buildDataUrl(base64: string, mimeType: string): string {
  const clean = cleanBase64(base64);
  return `data:${mimeType};base64,${clean}`;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = cleanBase64(base64);
  if (Platform.OS !== 'web' && typeof atob === 'undefined') {
    return decodeBase64Native(clean);
  }
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64Native(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  const len = base64.length;
  let padding = 0;
  if (len >= 2 && base64[len - 1] === '=') padding++;
  if (len >= 2 && base64[len - 2] === '=') padding++;

  const byteLen = Math.max(0, Math.floor((len / 4) * 3 - padding));
  const bytes = new Uint8Array(byteLen);

  let byteIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = lookup[base64.charCodeAt(i)] || 0;
    const c1 = lookup[base64.charCodeAt(i + 1)] || 0;
    const c2 = i + 2 < len ? (lookup[base64.charCodeAt(i + 2)] || 0) : 0;
    const c3 = i + 3 < len ? (lookup[base64.charCodeAt(i + 3)] || 0) : 0;

    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    if (byteIdx < byteLen) bytes[byteIdx++] = (triple >> 16) & 0xff;
    if (byteIdx < byteLen) bytes[byteIdx++] = (triple >> 8) & 0xff;
    if (byteIdx < byteLen) bytes[byteIdx++] = triple & 0xff;
  }

  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (Platform.OS !== 'web' && typeof btoa === 'undefined') {
    return encodeBase64Native(bytes);
  }
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function encodeBase64Native(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = bytes.length;
  let result = '';

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += chars[b0 >> 2];
    result += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (i + 1 < len) {
      result += chars[((b1 & 0x0f) << 2) | (b2 >> 6)];
    } else {
      result += '=';
    }
    if (i + 2 < len) {
      result += chars[b2 & 0x3f];
    } else {
      result += '=';
    }
  }

  return result;
}

/**
 * Converts an image URL to a data URL so WebView canvas can use it
 * without cross-origin tainting. On web, uses fetch + FileReader.
 * On native, uses fetch + FileSystem.readAsStringAsync.
 */
export async function urlToDataUrl(url: string, timeoutMs = 15000): Promise<string> {
  if (url.startsWith('data:')) return url;
  if (Platform.OS === 'web') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { mode: 'cors', signal: controller.signal });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('image convert failed'));
          reader.readAsDataURL(blob);
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return await imageElementToDataUrl(url, timeoutMs);
    }
  }
  // Native: download to cache, read as base64 via FileSystem
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const localPath = `${FileSystem.cacheDirectory}url-to-data-${Date.now()}.tmp`;
    const downloadRes = await FileSystem.downloadAsync(url, localPath);
    if (downloadRes.status !== 200) throw new Error(`fetch ${downloadRes.status}`);
    const base64 = await FileSystem.readAsStringAsync(downloadRes.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mimeType = downloadRes.headers['Content-Type'] || 'image/jpeg';
    await FileSystem.deleteAsync(downloadRes.uri, { idempotent: true }).catch(() => {});
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    throw new Error(`이미지 로드 실패: ${err instanceof Error ? err.message : 'unknown'}`);
  } finally {
    clearTimeout(timer);
  }
}

async function imageElementToDataUrl(url: string, timeoutMs = 15000): Promise<string> {
  const MAX_DIM = 1024;
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('이미지 로드 시간 초과'));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        const scale = Math.min(1, MAX_DIM / Math.max(naturalW, naturalH));
        const w = Math.max(1, Math.round(naturalW * scale));
        const h = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas 컨텍스트 생성 실패'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
        canvas.width = 0;
        canvas.height = 0;
      } catch {
        reject(new Error('CORS로 인해 이미지를 변환할 수 없습니다'));
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('이미지 로드 실패 (CORS 또는 네트워크 오류)'));
    };
    img.src = url;
  });
}
