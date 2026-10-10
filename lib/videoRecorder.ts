import { Platform } from 'react-native';
import { uint8ArrayToBase64 } from '@/lib/base64';
import { encodeBase64InWorker } from '@/lib/workerPool';
import { getDeviceTier, getAdaptiveRenderParams, onMemoryPressureChange, getMemoryPressure, type DeviceTier } from '@/lib/devicePerformance';
import { addBreadcrumb, logWarning } from '@/lib/errorLogger';

export interface VideoRecordingOptions {
  maxDurationMs?: number;
  videoBitsPerSecond?: number;
  width?: number;
  height?: number;
}

export interface VideoRecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

// Bitrate scales with device tier and runtime memory pressure to reduce
// OOM risk on low-end phones. The adaptive params function checks both
// the static device tier and runtime conditions (JS heap usage, battery).
function resolveDefaultBitrate(): number {
  return getAdaptiveRenderParams().videoBitrate;
}

const DEFAULT_VIDEO_BITRATE = resolveDefaultBitrate();
const DEFAULT_MAX_DURATION_MS = 30_000;
const CHUNK_SIZE_WARN_BYTES = 15_000_000; // 15 MB accumulated chunks — log a warning
const CHUNK_SIZE_CRITICAL_BYTES = 40_000_000; // 40 MB — log error-level telemetry

function pickVideoMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

export function createVideoRecorder(
  stream: MediaStream,
  options: VideoRecordingOptions = {},
): MediaRecorder | null {
  if (Platform.OS !== 'web' || typeof MediaRecorder === 'undefined') return null;

  const mimeType = pickVideoMimeType();
  const videoBitsPerSecond = options.videoBitsPerSecond ?? DEFAULT_VIDEO_BITRATE;
  const audioBitsPerSecond = 128_000;

  try {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return new MediaRecorder(stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond });
    }
    return new MediaRecorder(stream, { videoBitsPerSecond, audioBitsPerSecond });
  } catch {
    try {
      return new MediaRecorder(stream);
    } catch {
      return null;
    }
  }
}

export function startVideoRecording(
  stream: MediaStream,
  options: VideoRecordingOptions = {},
): { recorder: MediaRecorder; promise: Promise<VideoRecordingResult> } | null {
  const recorder = createVideoRecorder(stream, options);
  if (!recorder) return null;

  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const startTime = Date.now();

  const promise = new Promise<VideoRecordingResult>((resolve, reject) => {
    const chunks: Blob[] = [];
    let accumulatedBytes = 0;
    let warnedAtSize = false;
    let criticalLogged = false;
    let settled = false;

    // Background guard: when the page is hidden, the OS forcefully reclaims
    // the hardware codec session. Calling recorder.stop() on the dead C++
    // encoder triggers a native SIGABRT that bypasses JS try-catch and kills
    // the process. Do NOT call any MediaRecorder method — just set the flag
    // and let the browser GC the dead recorder on foreground return.
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden && !settled) {
        settled = true;
        pressureUnsub();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        // Resolve with whatever chunks were collected so far — the caller
        // can decide whether to use the partial recording or re-record.
        const mimeType = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: mimeType });
        chunks.length = 0;
        resolve({ blob, mimeType, durationMs: Date.now() - startTime });
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
        accumulatedBytes += e.data.size;

        if (accumulatedBytes >= CHUNK_SIZE_CRITICAL_BYTES && !criticalLogged) {
          criticalLogged = true;
          addBreadcrumb('video', `Recording chunk memory spike: ${(accumulatedBytes / 1_000_000).toFixed(1)}MB`, 'error', {
            chunkCount: chunks.length,
            bitrate: recorder.videoBitsPerSecond ?? null,
          });
          logWarning(`Video recording memory spike: ${(accumulatedBytes / 1_000_000).toFixed(1)}MB accumulated`, {
            component: 'videoRecorder',
            action: 'chunk-accumulation',
            extra: { chunkCount: chunks.length, bytes: accumulatedBytes },
          });
        } else if (accumulatedBytes >= CHUNK_SIZE_WARN_BYTES && !warnedAtSize) {
          warnedAtSize = true;
          addBreadcrumb('video', `Recording chunk memory high: ${(accumulatedBytes / 1_000_000).toFixed(1)}MB`, 'warning', {
            chunkCount: chunks.length,
          });
        }
      }
    };

    // If memory pressure spikes to severe during recording, request
    // smaller timeslices from the MediaRecorder to reduce peak memory.
    const pressureUnsub = onMemoryPressureChange((level) => {
      if (level === 'severe') {
        addBreadcrumb('video', 'Severe memory pressure during recording — requesting 500ms timeslices', 'error');
        logWarning('Severe memory pressure during active video recording', {
          component: 'videoRecorder',
          action: 'pressure-spike-during-record',
          extra: { accumulatedBytes, chunkCount: chunks.length },
        });
        try {
          // Request data more frequently to keep chunk sizes small
          recorder.requestData();
        } catch {
          // requestData can throw if recorder is in wrong state
        }
      }
    });

    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      pressureUnsub();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      const mimeType = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: mimeType });
      chunks.length = 0;
      resolve({ blob, mimeType, durationMs: Date.now() - startTime });
    };

    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      pressureUnsub();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      reject(new Error('비디오 녹화 중 오류가 발생했습니다.'));
    };

    const stopTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, maxDurationMs);

    const originalOnStop = recorder.onstop;
    recorder.onstop = (e: Event) => {
      clearTimeout(stopTimer);
      if (typeof originalOnStop === 'function') {
        (originalOnStop as (ev: Event) => void)(e);
      }
    };
  });

  recorder.start(1000);
  return { recorder, promise };
}

export function stopVideoRecording(recorder: MediaRecorder): void {
  if (recorder.state !== 'inactive') {
    recorder.stop();
  }
}

// Not used — recording duration is tracked by the caller via recordingTimerRef.
export function getRecordingTimeMs(_recorder: MediaRecorder | null): number {
  return 0;
}

export async function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  const mimeType = blob.type || 'video/webm';
  if (Platform.OS === 'web') {
    // On web, try to offload base64 encoding to a Web Worker to avoid
    // blocking the main thread. The ArrayBuffer is transferred (zero-copy)
    // to the worker. Falls back to FileReader if workers aren't available.
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = await encodeBase64InWorker(arrayBuffer);
      return { base64, mimeType };
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const commaIdx = result.indexOf(',');
          const header = result.slice(5, commaIdx);
          const detectedType = header.split(';')[0] || 'video/webm';
          const base64 = result.slice(commaIdx + 1);
          resolve({ base64, mimeType: detectedType });
        };
        reader.onerror = () => reject(new Error('비디오 변환 실패'));
        reader.readAsDataURL(blob);
      });
    }
  }
  // Native: no Web Worker support. Encode in chunks with yields between
  // them so the UI thread can process bridge messages and React Native
  // timers between chunks. Without this, encoding a 15MB+ video blob
  // synchronously can block for seconds and trigger an ANR.
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK_SIZE = 49_152; // 48KB → 64KB base64 output per chunk
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, bytes.length);
    parts.push(uint8ArrayToBase64(bytes.subarray(offset, end)));
    // Yield to the event loop every ~256KB of input to let pending
    // bridge messages and timers fire.
    if ((offset / CHUNK_SIZE) % 5 === 4) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  return { base64: parts.join(''), mimeType };
}
