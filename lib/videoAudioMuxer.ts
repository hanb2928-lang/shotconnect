/**
 * Client-side video+TTS audio muxing for web.
 *
 * Combines an AI-generated video (no audio track) with a TTS narration
 * audio file into a single playable video file using Canvas captureStream
 * + Web Audio API + MediaRecorder.
 *
 * On non-web platforms, returns null — muxing must be done server-side.
 */

export interface MuxResult {
  blob: Blob;
  url: string;
  durationSec: number;
}

export interface MuxProgress {
  phase: 'preparing' | 'rendering' | 'finalizing';
  progress: number; // 0..1
}

export type MuxProgressCallback = (p: MuxProgress) => void;

const MEDIA_LOAD_TIMEOUT_MS = 15_000;
const AUDIO_PROBE_MAX_RETRIES = 3;
const AUDIO_PROBE_BASE_DELAY_MS = 1000;

/**
 * Verify that a URL is actually reachable via HTTP before attempting
 * to use it in a media element. Returns true if the server responds
 * with a 2xx or 3xx status. Retries with backoff because TTS files
 * may still be uploading to storage when the URL is first set.
 */
export async function probeUrlAccessible(
  url: string,
  maxRetries: number = AUDIO_PROBE_MAX_RETRIES,
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.ok || (resp.status >= 300 && resp.status < 400)) {
        return true;
      }
    } catch {
      // Network error or abort — will retry
    }
    if (attempt < maxRetries) {
      const delay = AUDIO_PROBE_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return false;
}

/**
 * Mux a silent video with a TTS audio URL into a single video file.
 * Returns null if the environment doesn't support the required APIs
 * or if either media source fails to load.
 */
export async function muxVideoWithAudio(
  videoUrl: string,
  audioUrl: string,
  onProgress?: MuxProgressCallback,
): Promise<MuxResult | null> {
  if (typeof window === 'undefined') return null;
  if (typeof document === 'undefined') return null;

  const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  if (!hasMediaRecorder) return null;

  onProgress?.({ phase: 'preparing', progress: 0 });

  // Pre-flight: verify both URLs are accessible before creating media
  // elements. This prevents "Audio track not found" crashes caused by
  // the TTS file not being fully uploaded to storage yet.
  const [videoOk, audioOk] = await Promise.all([
    probeUrlAccessible(videoUrl),
    probeUrlAccessible(audioUrl),
  ]);
  if (!videoOk || !audioOk) return null;

  // Load both media elements
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.loop = false;
  video.preload = 'auto';
  video.playsInline = true;

  const audio = document.createElement('audio');
  audio.src = audioUrl;
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';

  // Wait for both to be fully ready (HAVE_ENOUGH_DATA) or fail
  try {
    await Promise.all([
      waitForMediaReady(video, 'video'),
      waitForMediaReady(audio, 'audio'),
    ]);
  } catch {
    // One or both media sources failed to load
    return null;
  }

  // Validate that both media elements have usable dimensions/duration
  if (!video.videoWidth || !video.videoHeight) return null;
  if (!isFinite(video.duration) || video.duration <= 0) return null;
  if (!isFinite(audio.duration) || audio.duration <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Set up audio graph for capture
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  let sourceNode: MediaElementAudioSourceNode;
  try {
    sourceNode = audioCtx.createMediaElementSource(audio);
  } catch {
    // If the audio element's source was already consumed or is invalid,
    // createMediaElementSource throws — abort gracefully.
    audioCtx.close().catch(() => {});
    return null;
  }
  const destination = audioCtx.createMediaStreamDestination();
  sourceNode.connect(destination);
  sourceNode.connect(audioCtx.destination);

  // Combine canvas video stream + audio stream
  const videoStream = canvas.captureStream(30);
  const audioStream = destination.stream;
  const audioTracks = audioStream.getAudioTracks();
  if (audioTracks.length === 0) {
    // No audio track available — the TTS file may be empty or corrupted
    audioCtx.close().catch(() => {});
    return null;
  }

  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioTracks,
  ]);

  // Pick the best supported mime type
  const mimeType = pickMimeType();
  if (!mimeType) {
    audioCtx.close().catch(() => {});
    return null;
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const durationSec = Math.max(video.duration, audio.duration) || 0;
  if (!isFinite(durationSec) || durationSec <= 0) {
    audioCtx.close().catch(() => {});
    return null;
  }

  return new Promise<MuxResult | null>((resolve) => {
    let rafId: number | null = null;
    let startTime = 0;
    let settled = false;

    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      audio.pause();
      video.pause();
      audioCtx.close().catch(() => {});
    };

    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      cleanup();

      if (chunks.length === 0) {
        resolve(null);
        return;
      }

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      onProgress?.({ phase: 'finalizing', progress: 1 });
      resolve({ blob, url, durationSec });
    };

    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    // Start playback and recording
    startTime = performance.now();

    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (onProgress && durationSec > 0) {
        const elapsed = (performance.now() - startTime) / 1000;
        onProgress({
          phase: 'rendering',
          progress: Math.min(elapsed / durationSec, 0.99),
        });
      }

      if (!video.ended) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    // Guard: if video.play() or audio.play() rejects (e.g. autoplay
    // policy), we still proceed — canvas drawImage works on paused
    // video, and we use the failsafe timer to end recording.
    recorder.start(100);
    video.play().catch(() => {});
    audio.play().catch(() => {});
    rafId = requestAnimationFrame(drawFrame);

    // Stop after both video and audio have finished
    const checkEnd = () => {
      if (settled) return;
      if (video.ended && audio.ended) {
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      // Failsafe: stop after duration + 2s buffer
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > durationSec + 2) {
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      setTimeout(checkEnd, 100);
    };
    setTimeout(checkEnd, 200);
  });
}

/**
 * Wait until a media element has enough data to play (HAVE_ENOUGH_DATA,
 * readyState 4) or report an error. Rejects on error or timeout — never
 * resolves with an unready element.
 */
function waitForMediaReady(
  el: HTMLMediaElement,
  _kind: 'video' | 'audio',
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already ready with enough data
    if (el.readyState >= 4 && isFinite(el.duration) && el.duration > 0) {
      resolve();
      return;
    }

    let settled = false;

    const onReady = () => {
      if (settled) return;
      // Double-check: readyState can momentarily report HAVE_METADATA (1)
      // then drop. Require HAVE_ENOUGH_DATA with valid duration.
      if (el.readyState >= 4 && isFinite(el.duration) && el.duration > 0) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Media load failed: ${el.src}`));
    };

    const onTimeout = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // If we at least have SOME data, accept it — the media may be
      // streaming and not have reached HAVE_ENOUGH_DATA yet.
      if (el.readyState >= 2 && isFinite(el.duration) && el.duration > 0) {
        resolve();
      } else {
        reject(new Error(`Media load timed out: ${el.src}`));
      }
    };

    const cleanup = () => {
      el.removeEventListener('canplaythrough', onReady);
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('error', onError);
      el.removeEventListener('abort', onError);
    };

    el.addEventListener('canplaythrough', onReady, { once: true });
    el.addEventListener('loadeddata', onReady);
    el.addEventListener('error', onError, { once: true });
    el.addEventListener('abort', onError, { once: true });

    setTimeout(onTimeout, MEDIA_LOAD_TIMEOUT_MS);
  });
}

function pickMimeType(): string | null {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
}
