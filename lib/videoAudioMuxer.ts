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

/**
 * Mux a silent video with a TTS audio URL into a single video file.
 * Returns null if the environment doesn't support the required APIs.
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

  // Wait for both to be ready
  await Promise.all([
    waitForMediaReady(video),
    waitForMediaReady(audio),
  ]);

  if (!video.videoWidth || !video.videoHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Set up audio graph for capture
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const sourceNode = audioCtx.createMediaElementSource(audio);
  const destination = audioCtx.createMediaStreamDestination();
  sourceNode.connect(destination);
  sourceNode.connect(audioCtx.destination);

  // Combine canvas video stream + audio stream
  const videoStream = canvas.captureStream(30);
  const audioStream = destination.stream;
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioStream.getAudioTracks(),
  ]);

  // Pick the best supported mime type
  const mimeType = pickMimeType();
  if (!mimeType) return null;

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
  if (!isFinite(durationSec) || durationSec <= 0) return null;

  return new Promise<MuxResult | null>((resolve) => {
    let rafId: number | null = null;
    let startTime = 0;

    recorder.onstop = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      audio.pause();
      video.pause();
      audioCtx.close().catch(() => {});

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      onProgress?.({ phase: 'finalizing', progress: 1 });
      resolve({ blob, url, durationSec });
    };

    recorder.onerror = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      audio.pause();
      video.pause();
      audioCtx.close().catch(() => {});
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

    recorder.start(100);
    video.play().catch(() => {});
    audio.play().catch(() => {});
    rafId = requestAnimationFrame(drawFrame);

    // Stop after both video and audio have finished
    const checkEnd = () => {
      if (video.ended && audio.ended) {
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      // Failsafe: stop after duration + 1s buffer
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > durationSec + 1) {
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      setTimeout(checkEnd, 100);
    };
    setTimeout(checkEnd, 200);
  });
}

function waitForMediaReady(el: HTMLMediaElement): Promise<void> {
  return new Promise((resolve) => {
    if (el.readyState >= 2) {
      resolve();
      return;
    }
    const onReady = () => {
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('canplay', onReady);
      resolve();
    };
    el.addEventListener('loadeddata', onReady, { once: true });
    el.addEventListener('canplay', onReady, { once: true });

    // Failsafe timeout — resolve anyway after 10s
    setTimeout(() => {
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('canplay', onReady);
      resolve();
    }, 10000);
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
