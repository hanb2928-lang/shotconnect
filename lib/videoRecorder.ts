import { Platform } from 'react-native';
import { uint8ArrayToBase64 } from '@/lib/base64';

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

const DEFAULT_VIDEO_BITRATE = 4_000_000;
const DEFAULT_MAX_DURATION_MS = 30_000;

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

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: mimeType });
      resolve({ blob, mimeType, durationMs: Date.now() - startTime });
    };

    recorder.onerror = () => {
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

export function getRecordingTimeMs(recorder: MediaRecorder | null): number {
  return recorder && recorder.state === 'recording' ? Date.now() - (recorder as any)._startTime : 0;
}

export async function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const commaIdx = result.indexOf(',');
        const header = result.slice(5, commaIdx);
        const mimeType = header.split(';')[0] || 'video/webm';
        const base64 = result.slice(commaIdx + 1);
        resolve({ base64, mimeType });
      };
      reader.onerror = () => reject(new Error('비디오 변환 실패'));
      reader.readAsDataURL(blob);
    });
  }
  // Native: FileReader doesn't exist on Hermes/JSC
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = uint8ArrayToBase64(bytes);
  const mimeType = blob.type || 'video/webm';
  return { base64, mimeType };
}
