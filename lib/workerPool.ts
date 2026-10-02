/**
 * Lightweight Web Worker pool for offloading CPU-heavy work from the main thread.
 *
 * On web, creates a small pool of workers from an inline blob URL so the
 * code works with Metro bundling without any special resolver config.
 * On native, all operations fall back to running on the main thread
 * (Hermes/JSC don't support Web Workers).
 */

import { Platform } from 'react-native';

export type WorkerTaskType = 'base64-encode' | 'base64-decode' | 'image-compress' | 'video-luminance' | 'subject-crop';

export interface WorkerTaskRequest {
  id: number;
  type: WorkerTaskType;
  // base64-encode: { bytes: ArrayBuffer }
  // base64-decode: { base64: string }
  // image-compress: { dataUrl: string, maxDim: number, quality: number }
  [key: string]: unknown;
}

export interface WorkerTaskResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

type PendingTask = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  transferables?: Transferable[];
};

const MAX_POOL_SIZE = 3;
let pool: Worker[] = [];
let workerBlobUrls: string[] = [];

let pending = new Map<number, PendingTask>();
let taskIdCounter = 0;
let initialized = false;

/**
 * The worker source code as a string. This runs in a separate thread.
 * It handles base64 encoding/decoding and image compression via
 * OffscreenCanvas (when available).
 */
const WORKER_SOURCE = `
let offscreenCanvas = null;
let offscreenCtx = null;

self.onmessage = function(e) {
  var msg = e.data;
  var id = msg.id;
  var type = msg.type;

  try {
    if (type === 'base64-encode') {
      var bytes = new Uint8Array(msg.bytes);
      var result = encodeBase64(bytes);
      self.postMessage({ id: id, ok: true, result: result }, [bytes.buffer]);
      return;
    }

    if (type === 'base64-decode') {
      var base64 = msg.base64;
      var bytes = decodeBase64(base64);
      self.postMessage({ id: id, ok: true, result: bytes.buffer }, [bytes.buffer]);
      return;
    }

    if (type === 'image-compress') {
      var dataUrl = msg.dataUrl;
      var maxDim = msg.maxDim;
      var quality = msg.quality;
      compressImage(dataUrl, maxDim, quality).then(function(result) {
        self.postMessage({ id: id, ok: true, result: result });
      }).catch(function(err) {
        self.postMessage({ id: id, ok: false, error: String(err) });
      });
      return;
    }

    if (type === 'video-luminance') {
      var bitmap = msg.bitmap;
      var result = computeLuminance(bitmap);
      if (bitmap) bitmap.close();
      self.postMessage({ id: id, ok: true, result: result });
      return;
    }

    if (type === 'subject-crop') {
      var dataUrl = msg.dataUrl;
      cropToSubject(dataUrl).then(function(result) {
        self.postMessage({ id: id, ok: true, result: result });
      }).catch(function(err) {
        self.postMessage({ id: id, ok: false, error: String(err) });
      });
      return;
    }

    self.postMessage({ id: id, ok: false, error: 'Unknown task type: ' + type });
  } catch (err) {
    self.postMessage({ id: id, ok: false, error: String(err) });
  }
};

function encodeBase64(bytes) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var len = bytes.length;
  var result = '';
  var chunkSize = 0x2000;

  for (var i = 0; i < len; i += 3) {
    var b0 = bytes[i];
    var b1 = i + 1 < len ? bytes[i + 1] : 0;
    var b2 = i + 2 < len ? bytes[i + 2] : 0;

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

function decodeBase64(base64) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var lookup = new Uint8Array(256);
  for (var i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  var clean = base64.replace(/\\s/g, '').replace(/^data:[^,]+;base64,/, '');
  var len = clean.length;
  var padding = 0;
  if (len >= 2 && clean[len - 1] === '=') padding++;
  if (len >= 2 && clean[len - 2] === '=') padding++;

  var byteLen = Math.max(0, Math.floor((len / 4) * 3 - padding));
  var bytes = new Uint8Array(byteLen);

  var byteIdx = 0;
  for (var i = 0; i < len; i += 4) {
    var c0 = lookup[clean.charCodeAt(i)] || 0;
    var c1 = lookup[clean.charCodeAt(i + 1)] || 0;
    var c2 = i + 2 < len ? (lookup[clean.charCodeAt(i + 2)] || 0) : 0;
    var c3 = i + 3 < len ? (lookup[clean.charCodeAt(i + 3)] || 0) : 0;

    var triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (byteIdx < byteLen) bytes[byteIdx++] = (triple >> 16) & 0xff;
    if (byteIdx < byteLen) bytes[byteIdx++] = (triple >> 8) & 0xff;
    if (byteIdx < byteLen) bytes[byteIdx++] = triple & 0xff;
  }

  return bytes;
}

function computeLuminance(bitmap) {
  if (!bitmap || typeof OffscreenCanvas === 'undefined') return 0.3;
  var sampleW = 64;
  var sampleH = 48;
  if (!offscreenCanvas) {
    offscreenCanvas = new OffscreenCanvas(sampleW, sampleH);
    offscreenCtx = offscreenCanvas.getContext('2d');
  } else {
    offscreenCanvas.width = sampleW;
    offscreenCanvas.height = sampleH;
  }
  try {
    offscreenCtx.drawImage(bitmap, 0, 0, sampleW, sampleH);
    var imageData = offscreenCtx.getImageData(0, 0, sampleW, sampleH);
    var data = imageData.data;
    var totalLum = 0;
    var pixelCount = 0;
    for (var i = 0; i < data.length; i += 4) {
      totalLum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      pixelCount++;
    }
    return pixelCount > 0 ? totalLum / pixelCount : 0.3;
  } catch (e) {
    return 0.3;
  }
}

function cropToSubject(dataUrl) {
  return new Promise(function(resolve, reject) {
    if (typeof OffscreenCanvas === 'undefined') {
      reject(new Error('OffscreenCanvas not supported in worker'));
      return;
    }
    var img = new Image();
    img.onload = function() {
      var naturalW = img.naturalWidth || img.width;
      var naturalH = img.naturalHeight || img.height;
      var maxDim = 1024;
      var scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
      var w = Math.max(1, Math.round(naturalW * scale));
      var h = Math.max(1, Math.round(naturalH * scale));

      if (!offscreenCanvas) {
        offscreenCanvas = new OffscreenCanvas(w, h);
        offscreenCtx = offscreenCanvas.getContext('2d');
      } else {
        offscreenCanvas.width = w;
        offscreenCanvas.height = h;
      }

      offscreenCtx.clearRect(0, 0, w, h);
      offscreenCtx.drawImage(img, 0, 0, w, h);
      var imageData = offscreenCtx.getImageData(0, 0, w, h);
      var data = imageData.data;

      var minX = w, maxX = 0, minY = h, maxY = 0;
      var foundPixels = 0;

      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = (y * w + x) * 4;
          if (data[idx + 3] > 30) {
            foundPixels++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (foundPixels < 100) {
        resolve(null);
        return;
      }

      var subjectW = maxX - minX;
      var subjectH = maxY - minY;
      var cx = (minX + maxX) / 2;
      var cy = (minY + maxY) / 2;
      var targetSize = Math.max(subjectW, subjectH);
      var padding = Math.round(targetSize * 0.15);
      var cropSize = targetSize + padding * 2;

      var cropCanvas = new OffscreenCanvas(cropSize, cropSize);
      var cropCtx = cropCanvas.getContext('2d');
      var sx = Math.max(0, cx - cropSize / 2);
      var sy = Math.max(0, cy - cropSize / 2);
      cropCtx.drawImage(offscreenCanvas, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);

      cropCanvas.convertToBlob({ type: 'image/png' }).then(function(blob) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = function() { reject(new Error('Failed to read crop blob')); };
        reader.readAsDataURL(blob);
      }).catch(function(err) { reject(err); });
    };
    img.onerror = function() { reject(new Error('Failed to load image in worker')); };
    img.src = dataUrl;
  });
}

function compressImage(dataUrl, maxDim, quality) {  return new Promise(function(resolve, reject) {
    if (typeof OffscreenCanvas === 'undefined') {
      reject(new Error('OffscreenCanvas not supported in worker'));
      return;
    }

    var img = new Image();
    img.onload = function() {
      var naturalW = img.naturalWidth || img.width;
      var naturalH = img.naturalHeight || img.height;
      var scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
      var w = Math.max(1, Math.round(naturalW * scale));
      var h = Math.max(1, Math.round(naturalH * scale));

      if (!offscreenCanvas) {
        offscreenCanvas = new OffscreenCanvas(w, h);
        offscreenCtx = offscreenCanvas.getContext('2d');
      } else {
        offscreenCanvas.width = w;
        offscreenCanvas.height = h;
      }

      offscreenCtx.drawImage(img, 0, 0, w, h);

      offscreenCanvas.convertToBlob({ type: 'image/jpeg', quality: quality }).then(function(blob) {
        var reader = new FileReader();
        reader.onload = function() {
          resolve(reader.result);
        };
        reader.onerror = function() {
          reject(new Error('Failed to read compressed blob'));
        };
        reader.readAsDataURL(blob);
      }).catch(function(err) {
        reject(err);
      });
    };
    img.onerror = function() {
      reject(new Error('Failed to load image in worker'));
    };
    img.src = dataUrl;
  });
}
`;

function createWorkerFromSource(source: string): Worker | null {
  try {
    const blob = new Blob([source], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    workerBlobUrls.push(url);
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (err) => {
      console.warn('Worker pool error:', err.message);
    };
    return worker;
  } catch {
    return null;
  }
}

function handleWorkerMessage(e: MessageEvent<WorkerTaskResponse>) {
  const { id, ok, result, error } = e.data;
  const task = pending.get(id);
  if (!task) return;
  pending.delete(id);

  if (ok) {
    task.resolve(result);
  } else {
    task.reject(new Error(error || 'Worker task failed'));
  }
}

function dispatch(
  request: WorkerTaskRequest,
  transferables?: Transferable[],
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (pool.length === 0) {
      reject(new Error('No workers available'));
      return;
    }
    pending.set(request.id, { resolve, reject, transferables });

    // Find a worker with the fewest pending tasks (simplified: round-robin)
    const worker = pool[request.id % pool.length];
    if (worker) {
      try {
        worker.postMessage(request, transferables || []);
      } catch (err) {
        pending.delete(request.id);
        reject(err instanceof Error ? err : new Error('Worker dispatch failed'));
      }
    } else {
      // No workers available — reject
      pending.delete(request.id);
      reject(new Error('No workers available'));
    }
  });
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  if (Platform.OS !== 'web') return;
  if (typeof Worker === 'undefined') return;

  let numWorkers = 2;
  try {
    numWorkers = Math.min(MAX_POOL_SIZE, navigator.hardwareConcurrency || 2);
  } catch {
    // navigator.hardwareConcurrency can throw in some embedded / restricted contexts
  }

  for (let i = 0; i < numWorkers; i++) {
    try {
      const worker = createWorkerFromSource(WORKER_SOURCE);
      if (worker) pool.push(worker);
    } catch {
      // Individual worker creation failure — skip this slot
    }
  }
  // If no workers were created, callers will fall back to main-thread
  // execution via isWorkerPoolAvailable() returning false.
}

export function isWorkerPoolAvailable(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof Worker === 'undefined') return false;
  try {
    ensureInitialized();
  } catch {
    // If initialization throws for any reason, treat as unavailable
    return false;
  }
  return pool.length > 0;
}

/**
 * Encode an ArrayBuffer to a base64 string in a Web Worker.
 * The ArrayBuffer is transferred (not copied) to the worker.
 * Falls back to main-thread encoding if workers aren't available.
 */
export async function encodeBase64InWorker(bytes: ArrayBuffer): Promise<string> {
  if (!isWorkerPoolAvailable()) {
    // Fallback: encode on main thread
    const { uint8ArrayToBase64 } = await import('./base64');
    return uint8ArrayToBase64(new Uint8Array(bytes));
  }

  const id = ++taskIdCounter;
  return (await dispatch(
    { id, type: 'base64-encode', bytes },
    [bytes],
  )) as string;
}

/**
 * Decode a base64 string to an ArrayBuffer in a Web Worker.
 * Falls back to main-thread decoding if workers aren't available.
 */
export async function decodeBase64InWorker(base64: string): Promise<ArrayBuffer> {
  if (!isWorkerPoolAvailable()) {
    // Fallback: decode on main thread
    const { base64ToUint8Array } = await import('./base64');
    const arr = base64ToUint8Array(base64);
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
  }

  const id = ++taskIdCounter;
  return (await dispatch(
    { id, type: 'base64-decode', base64 },
  )) as ArrayBuffer;
}

/**
 * Compress an image (data URL → smaller data URL) in a Web Worker
 * using OffscreenCanvas. Falls back to main-thread compression
 * if workers or OffscreenCanvas aren't available.
 */
export async function compressImageInWorker(
  dataUrl: string,
  maxDim: number,
  quality: number,
): Promise<string> {
  if (!isWorkerPoolAvailable()) {
    // Fallback: compress on main thread
    const { prepareImageForApi } = await import('./imageEdit');
    return prepareImageForApi(dataUrl, maxDim, quality);
  }

  const id = ++taskIdCounter;
  return (await dispatch(
    { id, type: 'image-compress', dataUrl, maxDim, quality },
  )) as string;
}

/**
 * Sample the average luminance of a video frame in a Web Worker.
 * The caller creates an ImageBitmap from the video element and transfers it;
 * the worker draws it to an OffscreenCanvas and computes the mean luma.
 * Falls back to the synchronous main-thread sampler if workers aren't available.
 */
export async function sampleLuminanceInWorker(
  video: HTMLVideoElement,
  region: 'top' | 'center' | 'bottom',
): Promise<number> {
  if (!isWorkerPoolAvailable() || typeof createImageBitmap === 'undefined') {
    const { sampleVideoLuminance } = await import('./captionStyling');
    return sampleVideoLuminance(video, region);
  }

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

  try {
    const bitmap = await createImageBitmap(video, 0, sy, vw, sh);
    const id = ++taskIdCounter;
    return (await dispatch(
      { id, type: 'video-luminance', bitmap } as WorkerTaskRequest,
      [bitmap],
    )) as number;
  } catch {
    const { sampleVideoLuminance } = await import('./captionStyling');
    return sampleVideoLuminance(video, region);
  }
}

/**
 * Crop an image to its subject's bounding box in a Web Worker.
 * Scans alpha channel for non-transparent pixels, then crops and pads.
 * Returns a PNG data URL, or null if the image has no detectable subject.
 * Falls back to the main-thread implementation if workers aren't available.
 */
export async function cropToSubjectInWorker(
  imageDataUrl: string,
): Promise<string | null> {
  if (!isWorkerPoolAvailable()) {
    const { alignSubjectCenter } = await import('./aiSynthesisEngine');
    return alignSubjectCenter(imageDataUrl);
  }

  const id = ++taskIdCounter;
  return (await dispatch(
    { id, type: 'subject-crop', dataUrl: imageDataUrl } as WorkerTaskRequest,
  )) as string | null;
}

/**
 * Terminate all workers and revoke their Blob URLs. Each worker
 * is backed by a Blob URL that must be explicitly revoked — otherwise
 * the browser keeps the worker source in memory indefinitely.
 */
export function terminateWorkerPool(): void {
  pool.forEach((w) => w.terminate());
  pool = [];
  workerBlobUrls.forEach((url) => {
    try { URL.revokeObjectURL(url); } catch {}
  });
  workerBlobUrls = [];
  pending.clear();
  initialized = false;
}
