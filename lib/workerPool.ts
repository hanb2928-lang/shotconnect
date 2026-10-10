import { Platform } from 'react-native';
import { uint8ArrayToBase64 } from '@/lib/base64';

type WorkerTask =
  | { type: 'compress'; dataUrl: string; maxDimension: number; quality: number }
  | { type: 'base64'; buffer: ArrayBuffer }
  | { type: 'luminance'; video: HTMLVideoElement; region: 'top' | 'center' | 'bottom' }
  | { type: 'cropSubject'; dataUrl: string };

let workerInstance: Worker | null = null;
let workerAvailable = false;

try {
  workerAvailable = Platform.OS === 'web' && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
} catch {
  workerAvailable = false;
}

const workerCode = `
self.onmessage = async (e) => {
  const { type, id, payload } = e.data;
  try {
    if (type === 'compress') {
      const { dataUrl, maxDimension, quality } = payload;
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);
      const outBlob = await canvas.convertToBlob({ type: 'image/webp', quality });
      const reader = new FileReader();
      const result = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(outBlob);
      });
      self.postMessage({ id, result });
    } else if (type === 'base64') {
      const { buffer } = payload;
      const bytes = new Uint8Array(buffer);
      const CHUNK = 49152;
      let result = '';
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
        result += self.btoa(String.fromCharCode(...chunk));
      }
      self.postMessage({ id, result });
    } else if (type === 'cropSubject') {
      const { dataUrl } = payload;
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      let minR = w, maxR = 0, minC = h, maxC = 0;
      const threshold = 30;
      let found = false;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const alpha = data[idx + 3];
          if (alpha > threshold) {
            found = true;
            if (x < minR) minR = x;
            if (x > maxR) maxR = x;
            if (y < minC) minC = y;
            if (y > maxC) maxC = y;
          }
        }
      }
      if (!found) {
        const outBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
        const reader = new FileReader();
        const result = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(outBlob);
        });
        self.postMessage({ id, result });
        return;
      }
      const pad = 16;
      minR = Math.max(0, minR - pad);
      minC = Math.max(0, minC - pad);
      maxR = Math.min(w, maxR + pad);
      maxC = Math.min(h, maxC + pad);
      const cropW = maxR - minR;
      const cropH = maxC - minC;
      const side = Math.max(cropW, cropH);
      const sqCanvas = new OffscreenCanvas(side, side);
      const sqCtx = sqCanvas.getContext('2d');
      const ox = Math.round((side - cropW) / 2);
      const oy = Math.round((side - cropH) / 2);
      sqCtx.drawImage(canvas, minR, minC, cropW, cropH, ox, oy, cropW, cropH);
      const outBlob = await sqCanvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
      const reader = new FileReader();
      const result = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(outBlob);
      });
      self.postMessage({ id, result });
    }
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : 'worker error' });
  }
};
`;

const blobUrlCache: string | null = null;

function getWorker(): Worker | null {
  if (!workerAvailable) return null;
  if (workerInstance) return workerInstance;
  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = blobUrlCache ?? URL.createObjectURL(blob);
    workerInstance = new Worker(url);
    return workerInstance;
  } catch {
    return null;
  }
}

const pendingTasks = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let nextTaskId = 0;

function dispatchToWorker<T>(payload: Record<string, unknown>): Promise<T> {
  const worker = getWorker();
  if (!worker) return Promise.reject(new Error('Worker pool unavailable'));
  const id = ++nextTaskId;
  return new Promise<T>((resolve, reject) => {
    pendingTasks.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker.postMessage({ id, ...payload });
  });
}

if (workerAvailable) {
  try {
    const worker = getWorker();
    if (worker) {
      worker.onmessage = (e: MessageEvent) => {
        const { id, result, error } = e.data;
        const task = pendingTasks.get(id);
        if (task) {
          pendingTasks.delete(id);
          if (error) task.reject(new Error(error));
          else task.resolve(result);
        }
      };
      worker.onerror = () => {
        pendingTasks.forEach((task) => task.reject(new Error('Worker error')));
        pendingTasks.clear();
      };
    }
  } catch {
    workerAvailable = false;
  }
}

export function isWorkerPoolAvailable(): boolean {
  return workerAvailable && getWorker() !== null;
}

export async function compressImageInWorker(
  dataUrl: string,
  maxDimension: number,
  quality: number,
): Promise<string> {
  return dispatchToWorker<string>({ type: 'compress', payload: { dataUrl, maxDimension, quality } });
}

export async function encodeBase64InWorker(buffer: ArrayBuffer): Promise<string> {
  return dispatchToWorker<string>({ type: 'base64', payload: { buffer }, transfer: [buffer] } as Record<string, unknown>);
}

export async function cropToSubjectInWorker(dataUrl: string): Promise<string> {
  return dispatchToWorker<string>({ type: 'cropSubject', payload: { dataUrl } });
}

export async function sampleLuminanceInWorker(
  video: HTMLVideoElement,
  region: 'top' | 'center' | 'bottom',
): Promise<number> {
  if (Platform.OS !== 'web') return 0.3;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return 0.3;

  let sy = 0;
  let sh = vh;
  if (region === 'top') {
    sy = 0;
    sh = Math.round(vh * 0.25);
  } else if (region === 'center') {
    sy = Math.round(vh * 0.3);
    sh = Math.round(vh * 0.4);
  } else {
    sy = Math.round(vh * 0.75);
    sh = Math.round(vh * 0.25);
  }

  const canvas = document.createElement('canvas');
  const sampleW = 64;
  const sampleH = 48;
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0.3;

  try {
    ctx.drawImage(video, 0, sy, vw, sh, 0, 0, sampleW, sampleH);
    const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imageData.data;
    let totalLum = 0;
    let pixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalLum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      pixelCount++;
    }
    return pixelCount > 0 ? totalLum / pixelCount : 0.3;
  } catch {
    return 0.3;
  }
}
