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

export interface ClipMergeInput {
  id: string;
  videoUrl: string;
  audioUrl: string;
}

export interface ClipMergeResult {
  id: string;
  mux: MuxResult | null;
  error?: string;
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

    try {
      const mux = await muxVideoWithAudio(clip.videoUrl, clip.audioUrl, clipProgress);

      if (mux) {
        results.push({ id: clip.id, mux });
        progressCallback?.({
          currentIndex: i,
          totalClips: clips.length,
          clipId: clip.id,
          phase: 'done',
          progress: 1,
        });
      } else {
        results.push({ id: clip.id, mux: null, error: '병합 실패' });
        progressCallback?.({
          currentIndex: i,
          totalClips: clips.length,
          clipId: clip.id,
          phase: 'error',
          progress: 0,
        });
      }
    } catch (err) {
      results.push({
        id: clip.id,
        mux: null,
        error: err instanceof Error ? err.message : '알 수 없는 오류',
      });
      progressCallback?.({
        currentIndex: i,
        totalClips: clips.length,
        clipId: clip.id,
        phase: 'error',
        progress: 0,
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
 * Cancel the current merge queue. The in-progress clip will finish
 * (muxVideoWithAudio doesn't support mid-stream abort), but no
 * further clips will be processed.
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
