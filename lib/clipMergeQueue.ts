/**
 * Multi-clip sequential merge queue.
 *
 * Isolates multi-clip merging from the UI thread by running each clip's
 * mux operation sequentially in a dedicated queue. Between clips, the
 * post-synthesis GC guard flushes all transient memory so the queue's
 * footprint stays flat regardless of how many clips are merged.
 *
 * This prevents the OOM crash that occurs when multiple clips with
 * slightly different resolutions or codec profiles are merged
 * synchronously — each merge runs one at a time, with memory reset
 * to zero before the next clip starts.
 */

import { muxVideoWithAudio, type MuxResult, type MuxProgressCallback } from '@/lib/videoAudioMuxer';
import { flushPostSynthesisMemory } from '@/lib/synthesisGc';
import { withFileLock } from '@/lib/fileLock';

const MEDIA_METADATA_TIMEOUT_MS = 10_000;

/**
 * Wait until a video URL's metadata is fully loaded (loadedmetadata event)
 * before attempting to mux it. This prevents the preview freeze that occurs
 * when muxVideoWithAudio is called on a video whose dimensions and duration
 * are not yet known — the canvas would be created at 0x0 and the recorder
 * would hang indefinitely waiting for frames that never arrive.
 */
function waitForVideoMetadata(url: string): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.src = url;
    probe.muted = true;
    probe.preload = 'metadata';
    let settled = false;

    const cleanup = () => {
      probe.removeAttribute('src');
      probe.load();
    };

    const onLoaded = () => {
      if (settled) return;
      if (probe.readyState >= 1 && probe.videoWidth > 0 && isFinite(probe.duration)) {
        settled = true;
        clearTimeout(timer);
        probe.removeEventListener('loadedmetadata', onLoaded);
        probe.removeEventListener('error', onError);
        cleanup();
        resolve(true);
      }
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.removeEventListener('loadedmetadata', onLoaded);
      probe.removeEventListener('error', onError);
      cleanup();
      resolve(false);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      probe.removeEventListener('loadedmetadata', onLoaded);
      probe.removeEventListener('error', onError);
      cleanup();
      resolve(false);
    }, MEDIA_METADATA_TIMEOUT_MS);

    probe.addEventListener('loadedmetadata', onLoaded);
    probe.addEventListener('error', onError, { once: true });
  });
}

export interface ClipMergeInput {
  id: string;
  videoUrl: string;
  audioUrl: string;
}

export interface ClipMergeResult {
  id: string;
  mux: MuxResult | null;
  error?: string;
  retryable?: boolean;
  attempts?: number;
}

export interface MergeQueueProgress {
  currentIndex: number;
  totalClips: number;
  clipId: string;
  phase: 'preparing' | 'rendering' | 'finalizing' | 'done' | 'error';
  progress: number;
}

export type MergeQueueProgressCallback = (p: MergeQueueProgress) => void;

type QueueState = 'idle' | 'running' | 'paused';

const MAX_RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Network timeouts, transient fetch failures, and media load issues
    // are worth retrying. Permanent failures (no MediaRecorder, no audio
    // track) are not.
    if (msg.includes('timeout') || msg.includes('timed out')) return true;
    if (msg.includes('network') || msg.includes('fetch')) return true;
    if (msg.includes('media load')) return true;
    if (msg.includes('abort')) return true;
  }
  // null mux result (unsupported environment) is not retryable
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let queueState: QueueState = 'idle';
const pendingClips: ClipMergeInput[] = [];
let progressCallback: MergeQueueProgressCallback | null = null;
let currentAbort: AbortController | null = null;

/**
 * Enqueue multiple clips for sequential merging.
 * Each clip is muxed one at a time — the next clip does not start
 * until the previous one's memory has been flushed.
 *
 * Returns a promise that resolves with all results once every clip
 * has been processed (or rejected if the queue is already running).
 */
export async function mergeClipsSequentially(
  clips: ClipMergeInput[],
  onProgress?: MergeQueueProgressCallback,
): Promise<ClipMergeResult[]> {
  if (queueState === 'running') {
    throw new Error('병합 큐가 이미 실행 중입니다. 현재 작업이 완료된 후 다시 시도해주세요.');
  }

  if (clips.length === 0) return [];

  queueState = 'running';
  progressCallback ??= onProgress ?? null;

  const results: ClipMergeResult[] = [];

  for (let i = 0; i < clips.length; i++) {
    if (queueState !== 'running') break;

    const clip = clips[i];
    currentAbort = new AbortController();

    progressCallback?.({
      currentIndex: i,
      totalClips: clips.length,
      clipId: clip.id,
      phase: 'preparing',
      progress: 0,
    });

    const clipProgress: MuxProgressCallback = (p) => {
      progressCallback?.({
        currentIndex: i,
        totalClips: clips.length,
        clipId: clip.id,
        phase: p.phase,
        progress: p.progress,
      });
    };

    let clipResult: ClipMergeResult | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      if (queueState !== 'running') break;

      try {
        // Guard: wait for the video URL's metadata to load before
        // attempting to mux. Without this, muxVideoWithAudio may
        // create a 0x0 canvas and hang the recorder indefinitely.
        const metaReady = await waitForVideoMetadata(clip.videoUrl);
        if (!metaReady) {
          throw new Error('비디오 메타데이터 로딩 실패 (timeout)');
        }

        const mux = await muxVideoWithAudio(clip.videoUrl, clip.audioUrl, clipProgress, currentAbort?.signal);

        if (mux) {
          clipResult = { id: clip.id, mux, attempts: attempt + 1 };
          progressCallback?.({
            currentIndex: i,
            totalClips: clips.length,
            clipId: clip.id,
            phase: 'done',
            progress: 1,
          });
          break;
        } else {
          lastError = new Error('병합 실패');
          // null mux = environment doesn't support it — not retryable
          clipResult = {
            id: clip.id,
            mux: null,
            error: '이 기기에서는 병합을 지원하지 않습니다.',
            retryable: false,
            attempts: attempt + 1,
          };
          break;
        }
      } catch (err) {
        lastError = err;
        const retryable = isRetryableError(err);

        if (attempt < MAX_RETRY_ATTEMPTS && retryable) {
          // Retry after backoff — the queue continues with the same clip
          progressCallback?.({
            currentIndex: i,
            totalClips: clips.length,
            clipId: clip.id,
            phase: 'preparing',
            progress: 0,
          });
          await delay(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        // Exhausted retries or non-retryable — record the failure and
        // move on to the next clip. The queue does NOT stop.
        clipResult = {
          id: clip.id,
          mux: null,
          error: err instanceof Error ? err.message : '알 수 없는 오류',
          retryable,
          attempts: attempt + 1,
        };
        progressCallback?.({
          currentIndex: i,
          totalClips: clips.length,
          clipId: clip.id,
          phase: 'error',
          progress: 0,
        });
        break;
      }
    }

    if (clipResult) {
      results.push(clipResult);
    } else {
      results.push({
        id: clip.id,
        mux: null,
        error: lastError instanceof Error ? lastError.message : '알 수 없는 오류',
        retryable: false,
        attempts: MAX_RETRY_ATTEMPTS + 1,
      });
    }

    currentAbort = null;

    // Flush all transient memory between clips so the queue's
    // footprint stays flat regardless of clip count.
    await flushPostSynthesisMemory();
  }

  queueState = 'idle';
  progressCallback = null;

  return results;
}

/**
 * Cancel the current merge queue. The in-progress clip's mux is
 * aborted immediately — the recorder stops, the RAF loop cancels,
 * and all temp Blob URLs and worker resources are released.
 */
export function cancelMergeQueue(): void {
  queueState = 'idle';
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  pendingClips.length = 0;
}

export function getMergeQueueState(): QueueState {
  return queueState;
}
