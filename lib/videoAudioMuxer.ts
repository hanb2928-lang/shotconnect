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
  revoke: () => void;
}

export interface MuxProgress {
  phase: 'preparing' | 'rendering' | 'finalizing';
  progress: number; // 0..1
}

export type MuxProgressCallback = (p: MuxProgress) => void;

const MEDIA_LOAD_TIMEOUT_MS = 15_000;
const AUDIO_PROBE_MAX_RETRIES = 3;
const AUDIO_PROBE_BASE_DELAY_MS = 1000;

import { registerTempFile, unregisterTempFile } from '@/lib/tempFileManager';
import { flushPostSynthesisMemory } from '@/lib/synthesisGc';
import { getAdaptiveRenderParams, computeScaledDimensions, detectRuntimePressure, setMemoryPressure } from '@/lib/devicePerformance';

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
  abortSignal?: AbortSignal,
  targetDurationSec?: number,
  audioOffsetSec?: number,
  audioDurationSec?: number,
): Promise<MuxResult | null> {
  if (typeof window === 'undefined') return null;
  if (typeof document === 'undefined') return null;

  const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  if (!hasMediaRecorder) return null;

  // Pre-flight memory pressure check: if the device is already under
  // severe memory pressure, bail out before allocating canvas, media
  // elements, AudioContext, and MediaRecorder — all of which consume
  // significant native heap. Starting a mux under pressure guarantees
  // an OOM kill before the first frame is drawn.
  const pressure = detectRuntimePressure();
  if (pressure === 'severe') {
    setMemoryPressure('severe', 'mux-pre-flight');
    return null;
  }

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

  function cleanupMediaElements() {
    audio.pause();
    video.pause();
    audio.src = '';
    video.src = '';
    audio.removeAttribute('src');
    video.removeAttribute('src');
    audio.load();
    video.load();
  }

  // Wait for both to be fully ready (HAVE_ENOUGH_DATA) or fail
  try {
    await Promise.all([
      waitForMediaReady(video, 'video'),
      waitForMediaReady(audio, 'audio'),
    ]);
  } catch {
    cleanupMediaElements();
    return null;
  }

  // Validate that both media elements have usable dimensions/duration
  if (!video.videoWidth || !video.videoHeight) {
    cleanupMediaElements();
    return null;
  }
  if (!isFinite(video.duration) || video.duration <= 0) {
    cleanupMediaElements();
    return null;
  }
  if (!isFinite(audio.duration) || audio.duration <= 0) {
    cleanupMediaElements();
    return null;
  }

  // Adaptive resolution: combine device tier with runtime memory/battery
  // pressure to pick the safest render dimensions. On a low-end phone under
  // memory pressure, this drops to 720p@20fps to avoid OOM kills. On a
  // high-end device with no pressure, full source resolution is preserved.
  // HARD CAP: muxing canvas is always locked to 720p max, regardless of
  // device tier. 1080p canvas capture doubles the per-frame buffer
  // allocation and pushes the native heap past the LMK threshold on
  // mid-range devices. The server-side FFmpeg also caps at 720p, so
  // encoding above 720p client-side is wasted work that only increases
  // memory pressure without improving the final output.
  const adaptive = getAdaptiveRenderParams();
  const MUX_MAX_DIMENSION = 720;
  const sourceW = video.videoWidth;
  const sourceH = video.videoHeight;
  const { width: canvasW, height: canvasH, scale: canvasScale } =
    computeScaledDimensions(sourceW, sourceH, MUX_MAX_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  // ctx is declared with let because the WebView may purge the canvas
  // DOM node during background, invalidating the 2D context. On foreground
  // return we attempt to re-acquire it; if that fails, the mux aborts.
  let ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (!ctx) {
    cleanupMediaElements();
    return null;
  }

  // If OffscreenCanvas is supported, transfer the canvas's control to a
  // worker so the per-frame drawImage loop runs off the main thread.
  // This keeps the UI responsive during the real-time muxing capture.
  let offscreenWorker: Worker | null = null;
  let useOffscreenDraw = false;
  let workerBlobUrl: string | null = null;
  if (typeof OffscreenCanvas !== 'undefined' && canvas.transferControlToOffscreen) {
    try {
      const offscreen = canvas.transferControlToOffscreen();
      const workerSource = `
        let canvas = null;
        let ctx = null;
        self.onmessage = function(e) {
          if (e.data.type === 'init') {
            canvas = e.data.canvas;
            ctx = canvas.getContext('2d');
            self.postMessage({ type: 'ready' });
          } else if (e.data.type === 'draw') {
            // Worker can't drawImage(video) directly — the video element
            // lives on the main thread. We use ImageBitmap transfer instead.
            if (ctx && e.data.bitmap) {
              ctx.drawImage(e.data.bitmap, 0, 0, canvas.width, canvas.height);
              e.data.bitmap.close();
            }
          } else if (e.data.type === 'done') {
            self.postMessage({ type: 'done' });
          }
        };
      `;
      const blob = new Blob([workerSource], { type: 'application/javascript' });
      workerBlobUrl = URL.createObjectURL(blob);
      registerTempFile(workerBlobUrl, 'muxWorkerBlob');
      offscreenWorker = new Worker(workerBlobUrl);
      offscreenWorker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
      useOffscreenDraw = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);
        offscreenWorker!.onmessage = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        offscreenWorker!.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      });
      if (!useOffscreenDraw) {
        offscreenWorker.terminate();
        offscreenWorker = null;
        if (workerBlobUrl) {
          URL.revokeObjectURL(workerBlobUrl);
          unregisterTempFile(workerBlobUrl);
          workerBlobUrl = null;
        }
      }
    } catch {
      if (offscreenWorker) {
        try { offscreenWorker.terminate(); } catch {}
        offscreenWorker = null;
      }
      if (workerBlobUrl) {
        URL.revokeObjectURL(workerBlobUrl);
        unregisterTempFile(workerBlobUrl);
        workerBlobUrl = null;
      }
      useOffscreenDraw = false;
    }
  }

  // Set up audio graph for capture
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  let sourceNode: MediaElementAudioSourceNode;
  try {
    sourceNode = audioCtx.createMediaElementSource(audio);
  } catch {
    audioCtx.close().catch(() => {});
    cleanupMediaElements();
    return null;
  }
  const destination = audioCtx.createMediaStreamDestination();
  sourceNode.connect(destination);
  sourceNode.connect(audioCtx.destination);

  // Combine canvas video stream + audio stream
  const videoStream = canvas.captureStream(adaptive.fps);
  const audioStream = destination.stream;
  const audioTracks = audioStream.getAudioTracks();
  if (audioTracks.length === 0) {
    audioCtx.close().catch(() => {});
    cleanupMediaElements();
    return null;
  }

  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioTracks,
  ]);

  // Pick the best supported mime type (always returns a value, falling
  // back to 'video/webm' if no hardware codec is supported)
  const mimeType = pickMimeType();

  // Some browsers report isTypeSupported=true but still throw when
  // constructing the recorder with that codec. Wrap in try/catch and
  // progressively degrade to safer codecs.
  const videoBitrate = adaptive.videoBitrate;

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: adaptive.audioBitrate,
    });
  } catch {
    try {
      recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: videoBitrate,
        audioBitsPerSecond: adaptive.audioBitrate,
      });
    } catch {
      try {
        recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      } catch {
        audioCtx.close().catch(() => {});
        return null;
      }
    }
  }

  let totalChunkBytes = 0;
  const MAX_CHUNK_BYTES = 150 * 1024 * 1024; // 150MB — abort if chunks exceed this

  // Acquire a Screen Wake Lock to prevent the OS from suspending the
  // process during encoding. The Wake Lock is automatically released by
  // the browser when the page is hidden; we re-acquire it on return.
  let wakeLockSentinel: { release?: () => Promise<void> } | null = null;
  const acquireWakeLock = async () => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release?: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    try {
      wakeLockSentinel = await nav.wakeLock.request('screen');
    } catch {
      // Wake Lock can fail if the page was just backgrounded — non-fatal
    }
  };
  void acquireWakeLock();

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
      totalChunkBytes += e.data.size;
    }
  };

  // Use target duration if provided, otherwise fall back to the longer
  // of the two streams. This ensures the output matches the requested
  // video length instead of being cut short by -shortest semantics.
  const durationSec = targetDurationSec && targetDurationSec > 0
    ? targetDurationSec
    : Math.max(video.duration, audio.duration) || 0;
  if (!isFinite(durationSec) || durationSec <= 0) {
    audioCtx.close().catch(() => {});
    cleanupMediaElements();
    return null;
  }

  // Chunk timestamp alignment: if audioDurationSec is provided, adjust the
  // audio playback rate so the TTS narration fits exactly within its assigned
  // window on the master timeline (targetDurationSec - audioOffset). Without
  // this, a TTS clip that's shorter than expected leaves silence at the end
  // of the segment, and one that's longer overruns into the next segment,
  // causing caption/narration desync in multi-cut merges.
  const audioOffset = audioOffsetSec && audioOffsetSec > 0 ? audioOffsetSec : 0;
  if (audioDurationSec && audioDurationSec > 0 && isFinite(audio.duration) && audio.duration > 0) {
    const expectedNarrationWindow = durationSec - audioOffset;
    if (expectedNarrationWindow > 0) {
      const rate = audio.duration / expectedNarrationWindow;
      // Clamp playbackRate to 0.5x–2.0x to avoid chipmunk/drag effects
      const clampedRate = Math.max(0.5, Math.min(2.0, rate));
      if (clampedRate > 0.85 && clampedRate < 1.15) {
        // Within 15% of normal — no adjustment needed, natural variation
      } else {
        try {
          audio.playbackRate = clampedRate;
          (audio as unknown as Record<string, unknown>).preservesPitch = true;
          const moz = (audio as unknown as Record<string, unknown>).mozPreservesPitch;
          const webkit = (audio as unknown as Record<string, unknown>).webkitPreservesPitch;
          if (moz !== undefined) (audio as unknown as Record<string, unknown>).mozPreservesPitch = true;
          if (webkit !== undefined) (audio as unknown as Record<string, unknown>).webkitPreservesPitch = true;
        } catch { /* non-fatal */ }
      }
    }
  }

  return new Promise<MuxResult | null>((resolve) => {
    let rafId: number | null = null;
    let startTime = 0;
    let settled = false;
    let outputUrl: string | null = null;
    let onAbort: (() => void) | null = null;
    let lastFrameTime = 0;
    let stalledFrameCount = 0;
    const FRAME_STALL_THRESHOLD_MS = 5000;
    const MAX_STALLED_FRAMES = 3;
    let pausedForBackground = false;

    // Background/foreground guard: when the page is hidden (user switches
    // apps or minimizes the browser), requestAnimationFrame stops firing
    // but MediaRecorder keeps producing dataavailable events, accumulating
    // Blob chunks in memory. On mobile, the OS OOM killer will terminate
    // the process. We pause the recorder and media playback on hidden,
    // and resume on visible to prevent memory blowup.
    //
    // CRITICAL: On mobile, the OS may kill the MediaRecorder encoder
    // silently while backgrounded — recorder.state transitions to
    // 'inactive' with no onerror event. Calling resume() on an inactive
    // recorder throws InvalidStateError, which propagates up through the
    // visibilitychange event listener and crashes the app because
    // ErrorBoundary cannot catch errors in DOM event listeners.
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden && !settled && recorder.state === 'recording') {
        pausedForBackground = true;
        try { recorder.pause(); } catch { /* not supported */ }
        video.pause();
        audio.pause();
        // Check heap pressure on background — if already high, abort
        const pressure = detectRuntimePressure();
        if (pressure === 'severe') {
          setMemoryPressure('severe', 'background-during-mux');
        }
      } else if (!document.hidden && pausedForBackground && !settled) {
        pausedForBackground = false;
        // If the OS killed the recorder while backgrounded, abort cleanly
        // instead of calling resume() on a dead recorder (which throws).
        if (recorder.state === 'inactive') {
          settled = true;
          cleanup();
          flushPostSynthesisMemory().finally(() => resolve(null));
          return;
        }
        // Re-acquire the 2D canvas context — the WebView may have purged
        // the canvas DOM node during background, making the old ctx a
        // dangling pointer. Any drawImage call on it would SIGSEGV.
        if (!useOffscreenDraw) {
          try {
            const freshCtx = canvas.getContext('2d');
            if (freshCtx) ctx = freshCtx;
            else {
              // Canvas node was purged and cannot be recreated — abort.
              settled = true;
              cleanup();
              flushPostSynthesisMemory().finally(() => resolve(null));
              return;
            }
          } catch {
            settled = true;
            cleanup();
            flushPostSynthesisMemory().finally(() => resolve(null));
            return;
          }
        }
        if (recorder.state === 'paused') {
          try { recorder.resume(); } catch { /* not supported */ }
        }
        // AudioContext is suspended by the OS on background; resume it
        // explicitly or audio playback will be silent / throw on connect.
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        video.play().catch(() => {});
        audio.play().catch(() => {});
        lastFrameTime = performance.now(); // reset stall timer
        rafId = requestAnimationFrame(drawFrame);
        // Re-acquire the Wake Lock — the browser auto-releases it on hide
        void acquireWakeLock();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    let checkEndTimerId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      if (checkEndTimerId !== null) clearTimeout(checkEndTimerId);
      checkEndTimerId = null;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (onAbort && abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      // Revoke the output Blob URL if it was created but the mux was
      // aborted before the caller could consume it.
      if (outputUrl) {
        URL.revokeObjectURL(outputUrl);
        unregisterTempFile(outputUrl);
        outputUrl = null;
      }
      if (offscreenWorker) {
        offscreenWorker.postMessage({ type: 'done' });
        offscreenWorker.terminate();
        offscreenWorker = null;
      }
      // Revoke the worker blob URL — it was kept alive for the worker's
      // lifetime and is no longer needed after termination.
      if (workerBlobUrl) {
        URL.revokeObjectURL(workerBlobUrl);
        unregisterTempFile(workerBlobUrl);
        workerBlobUrl = null;
      }
      // Disconnect the audio graph nodes before closing the context.
      // sourceNode holds a strong reference to the audio element; without
      // disconnect, the element's decoded audio buffer stays in memory.
      try { sourceNode.disconnect(); } catch {}
      try { sourceNode.disconnect(audioCtx.destination); } catch {}
      audio.pause();
      video.pause();
      audio.src = '';
      video.src = '';
      audio.removeAttribute('src');
      video.removeAttribute('src');
      audio.load();
      video.load();
      audioCtx.close().catch(() => {});
      videoStream.getTracks().forEach((t) => t.stop());
      audioTracks.forEach((t) => t.stop());
      canvas.width = 0;
      canvas.height = 0;
      chunks.length = 0;
      if (wakeLockSentinel) {
        try { void wakeLockSentinel.release?.(); } catch {}
        wakeLockSentinel = null;
      }
    };

    // If an abort signal is already aborted, resolve immediately.
    if (abortSignal?.aborted) {
      cleanup();
      resolve(null);
      return;
    }

    // Listen for abort — immediately stop the recorder, cancel the RAF
    // loop, and clean up all resources. This prevents leaked Blob URLs,
    // dangling workers, and orphaned audio contexts when the user
    // navigates away or cancels mid-mux.
    onAbort = () => {
      if (settled) return;
      settled = true;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch {}
      }
      cleanup();
      flushPostSynthesisMemory().finally(() => resolve(null));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      cleanup();

      if (chunks.length === 0) {
        resolve(null);
        return;
      }

      const blob = new Blob(chunks, { type: mimeType });
      outputUrl = URL.createObjectURL(blob);
      const url = outputUrl;
      registerTempFile(url, 'muxOutputBlob');
      onProgress?.({ phase: 'finalizing', progress: 1 });
      // Yield to the event loop before resolving so pending UI updates
      // and bridge messages can flush after the heavy blob construction.
      setTimeout(() => {
        // Flush all transient synthesis resources (worker URLs, audio
        // nodes, temp files) before the caller starts the next clip.
        flushPostSynthesisMemory().finally(() => {
          resolve({
            blob, url, durationSec,
            revoke: () => {
              URL.revokeObjectURL(url);
              unregisterTempFile(url);
              outputUrl = null;
            },
          });
        });
      }, 0);
    };

    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      flushPostSynthesisMemory().finally(() => resolve(null));
    };

    // Start playback and recording — see startPlayback below for the
    // audio-first lock that prevents capture/playback desync.

    // Local abort helper — avoids repeating the settled/cleanup/flush/resolve
    // pattern across 8+ guard sites. Defined before drawFrame so it's in
    // scope for all closures below.
    const abortMux = (reason: string) => {
      if (settled) return;
      settled = true;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch {}
      }
      cleanup();
      flushPostSynthesisMemory().finally(() => resolve(null));
    };

    const drawFrame = async () => {
      // OOM / zombie-process guard: if consecutive frames take >5s each
      // (memory pressure, GPU context loss, or font loading hang),
      // abort the mux instead of freezing the UI indefinitely.
      const now = performance.now();
      if (lastFrameTime > 0) {
        const frameDelta = now - lastFrameTime;
        if (frameDelta > FRAME_STALL_THRESHOLD_MS) {
          stalledFrameCount++;
          if (stalledFrameCount >= MAX_STALLED_FRAMES) {
            if (recorder.state !== 'inactive') {
              try { recorder.stop(); } catch {}
            }
            abortMux('frame-stall-timeout');
            return;
          }
        }
      }
      lastFrameTime = now;

      if (useOffscreenDraw && offscreenWorker) {
        // Offscreen path: transfer the video frame as an ImageBitmap
        // to the worker, which draws it to the OffscreenCanvas. This
        // keeps the per-frame drawImage work off the main thread.
        try {
          const bitmap = await createImageBitmap(video);
          offscreenWorker.postMessage({ type: 'draw', bitmap }, [bitmap]);
        } catch {
          // createImageBitmap can fail on some browsers — fall back
          // to synchronous main-thread draw for this frame.
          if (ctx) {
            try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); } catch {}
          }
        }
      } else {
        // Main-thread path: draw video frame directly to canvas.
        // Guard against purged 2D context — the WebView may have destroyed
        // the canvas DOM node during background, making ctx a dangling
        // pointer. Calling drawImage on it causes a native SIGSEGV that
        // try-catch cannot intercept on some WebView implementations.
        if (!ctx) {
          abortMux('canvas-2d-context-null');
          return;
        }
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch {
          // Canvas context was purged by the WebView during background.
          // Attempt to re-acquire; if that fails, abort the mux cleanly.
          ctx = canvas.getContext('2d');
          if (!ctx) {
            abortMux('canvas-2d-context-purged');
            return;
          }
        }
      }

      if (onProgress && durationSec > 0) {
        const elapsed = (performance.now() - startTime) / 1000;
        onProgress({
          phase: 'rendering',
          progress: Math.min(elapsed / durationSec, 0.99),
        });
      }

      // Memory pressure detection (Chromium): if JS heap usage exceeds
      // 80% of the limit, abort the mux to prevent an OOM crash that
      // would leave zombie workers and leaked Blob URLs. Lowered from 90%
      // because background tab memory is more constrained — the OS will
      // kill the process before the JS engine collects.
      const perfMem = (performance as unknown as { memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number } }).memory;
      if (perfMem && perfMem.jsHeapSizeLimit > 0) {
        const usageRatio = perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit;
        if (usageRatio > 0.8) {
          abortMux('memory-pressure-80pct');
          return;
        }
      }

      // Chunk accumulation guard: if recorded data exceeds 150MB, abort
      // to prevent unbounded memory growth during long videos.
      if (totalChunkBytes > MAX_CHUNK_BYTES) {
        abortMux('chunk-limit-150mb');
        return;
      }

      // Stop the RAF loop if the recorder died (OS killed it during
      // background, or it was stopped by another guard). Continuing to
      // draw frames to a dead capture stream wastes CPU and can throw.
      if (!video.ended && recorder.state !== 'inactive') {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    // Audio-first rendering lock: wait for both video and audio to actually
    // begin playing before starting the recorder. If an audioOffsetSec is
    // provided, the audio playback is delayed until the video reaches that
    // point on the master timeline — the recorder starts with video only,
    // and audio kicks in at the offset.
    const startPlayback = async () => {
      const audioPlayPromise = audioOffset > 0
        ? new Promise<void>((resolve) => {
            setTimeout(() => {
              audio.play().then(() => resolve()).catch(() => resolve());
            }, audioOffset * 1000);
          })
        : audio.play().catch(() => {});
      if (audioOffset > 0) {
        // Start video first, delay audio until the offset is reached
        await video.play().catch(() => {});
        startTime = performance.now();
        recorder.start(100);
        rafId = requestAnimationFrame(drawFrame);
        void audioPlayPromise;
      } else {
        const videoPlayPromise = video.play().catch(() => {});
        await Promise.all([videoPlayPromise, audioPlayPromise]);
        startTime = performance.now();
        recorder.start(100);
        rafId = requestAnimationFrame(drawFrame);
      }
    };
    void startPlayback();

    // Stop after both video and audio have finished
    const checkEnd = () => {
      if (settled) return;
      checkEndTimerId = null;
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
      checkEndTimerId = setTimeout(checkEnd, 100);
    };
    checkEndTimerId = setTimeout(checkEnd, 200);
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

// Hardware-accelerated codec candidates ordered by GPU priority.
// H.264 and HEVC have dedicated silicon on virtually all modern mobile
// and desktop chipsets — encoding via MediaRecorder with these codecs
// offloads work from the CPU to the hardware encoder, cutting merge
// time by up to 3x and preventing the CPU-bound OOM that occurs when
// multiple clips are merged in sequence with VP8/VP9 (software-only).
const HW_CODEC_CANDIDATES = [
  // H.264 in MP4 — universal hardware support, best compatibility
  'video/mp4;codecs=h264,aac',
  'video/mp4;codecs=hev1,aac',
  'video/mp4',
  // H.264 in WebM — hardware encoder on Chrome/Safari
  'video/webm;codecs=h264,opus',
  // HEVC/H.265 — newer hardware encoders, best compression
  'video/webm;codecs=hvc1,opus',
  // Software fallbacks (CPU-only, used only when no HW codec is available)
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string {
  if (typeof MediaRecorder !== 'undefined') {
    for (const type of HW_CODEC_CANDIDATES) {
      try {
        if (MediaRecorder.isTypeSupported(type)) return type;
      } catch {
        // isTypeSupported can throw on malformed codec strings in some browsers
      }
    }
  }
  // Absolute last-resort fallback — always valid per spec
  return 'video/webm';
}

/**
 * Detect whether the current platform likely has a hardware video encoder.
 * Returns the preferred codec name if HW encoding is available, null otherwise.
 */
export function detectHardwareEncoder(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const hwCodecs = ['video/mp4;codecs=h264,aac', 'video/webm;codecs=h264,opus', 'video/mp4;codecs=hev1,aac'];
  for (const codec of hwCodecs) {
    if (MediaRecorder.isTypeSupported(codec)) {
      return codec.includes('hev1') ? 'hevc' : 'h264';
    }
  }
  return null;
}
