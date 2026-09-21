import { Platform } from 'react-native';

export interface PickedImage {
  base64: string;
  uri: string;
  mimeType: string;
}

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.65;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

type ResizeOptions = {
  resizeWidth?: number;
  resizeHeight?: number;
};

function hasCreateImageBitmap(): boolean {
  return typeof createImageBitmap === 'function';
}

function calculateTargetSize(naturalW: number, naturalH: number, maxSize: number): { width: number; height: number } {
  let width = naturalW;
  let height = naturalH;
  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  return { width, height };
}

async function resizeWithImageBitmap(file: File): Promise<{ base64: string; uri: string; mimeType: string }> {
  const opts: ResizeOptions = {};
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { ...opts, imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    bitmap = await createImageBitmap(file);
  }

  const { width, height } = calculateTargetSize(bitmap.width, bitmap.height, MAX_DIMENSION);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('이미지 처리를 할 수 없습니다');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const isWebpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  const mimeType = isWebpSupported ? 'image/webp' : file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, JPEG_QUALITY);
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  canvas.width = 0;
  canvas.height = 0;

  return { base64, uri: dataUrl, mimeType };
}

function resizeWithImageElement(file: File): Promise<{ base64: string; uri: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const { width, height } = calculateTargetSize(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('이미지 처리를 할 수 없습니다'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const isWebpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      const mimeType = isWebpSupported ? 'image/webp' : file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, JPEG_QUALITY);
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

      canvas.width = 0;
      canvas.height = 0;

      resolve({ base64, uri: dataUrl, mimeType });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('이미지를 불러올 수 없습니다'));
    };
    img.src = objUrl;
  });
}

async function resizeImage(file: File): Promise<{ base64: string; uri: string; mimeType: string }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('이미지 크기가 너무 큽니다. 25MB 이하의 이미지를 선택해주세요.');
  }
  if (hasCreateImageBitmap()) {
    try {
      return await resizeWithImageBitmap(file);
    } catch {
      // fall through to legacy path
    }
  }
  return resizeWithImageElement(file);
}

export async function pickImageWeb(multiple = false, maxCount = 4, useCamera = false): Promise<PickedImage[]> {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'web') {
      reject(new Error('웹에서만 사용할 수 있는 기능입니다'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCamera) {
      (input as HTMLInputElement & { capture?: string }).capture = 'environment';
    }
    if (multiple) {
      input.multiple = true;
    }
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      input.onchange = null;
      input.onerror = null;
      window.removeEventListener('focus', onFocus);
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    };
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          settled = true;
          cleanup();
          resolve([]);
        }
      }, 800);
    };

    input.onchange = async () => {
      settled = true;
      cleanup();
      const files = Array.from(input.files || []);
      if (files.length === 0) {
        resolve([]);
        return;
      }
      try {
        const limited = files.slice(0, multiple ? maxCount : 1);
        const results: { base64: string; uri: string; mimeType: string }[] = [];
        for (const f of limited) {
          results.push(await resizeImage(f));
        }
        resolve(results);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('이미지 선택에 실패했습니다'));
      }
    };
    input.onerror = () => {
      settled = true;
      cleanup();
      reject(new Error('파일 선택창을 열 수 없습니다'));
    };

    setTimeout(() => {
      window.addEventListener('focus', onFocus);
    }, 300);

    input.click();
  });
}

export function isWebPlatform(): boolean {
  return Platform.OS === 'web';
}
