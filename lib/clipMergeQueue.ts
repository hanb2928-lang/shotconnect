/**
 * Multi-clip sequential merge queue.
 *
 * Offloads each clip's mux operation to the server-side mux-video-audio
 * edge function (ffmpeg.wasm) instead of running canvas+MediaRecorder
 * encoding on the client JS thread. This eliminates the SIGKILL that
 * occurs when the JS thread is locked by the encoding loop and cannot
 * receive the OS background-transition signal.
 *
 * Each clip is processed sequentially — the next clip does not start
 * until the previous one's server-side mux has completed.
 */

import { supabase } from '@/lib/supabase';
import { flushPostSynthesisMemory } from '@/lib/synthesisGc';

export interface ClipMergeInput {
  id: string;
  videoUrl: string;
  audioUrl: string;
  targetDurationSec?: number;
  audioOffsetSec?: number;
  audioDurationSec?: number;
}

export interface MuxResult {
  url: string;
  revoke: () => void;
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
    if (msg.includes('timeout') || msg.includes('timed out')) return true;
    if (msg.includes('network') || msg.includes('fetch')) return true;
    if (msg.includes('abort')) return true;
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let queueState: QueueState = 'idle';
const pendingClips: ClipMergeInput[] = [];
let progressCallback: MergeQueueProgressCallback | null = null;
let currentAbort: AbortController | null = null;
let completedResults: ClipMergeResult[] = [];

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
  completedResults = [];

  const QUEUE_FAILSAFE_MS = 600_000;
  let failsafeRemainingMs = QUEUE_FAILSAFE_MS;
  let failsafeStartedAt = 0;
  let failsafeTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFailsafe = () => {
    if (failsafeTimer !== null) {
      clearTimeout(failsafeTimer);
      failsafeTimer = null;
    }
  };

  const startFailsafe = () => {
    clearFailsafe();
    failsafeStartedAt = Date.now();
    failsafeTimer = setTimeout(() => {
      if (queueState === 'running') {
        queueState = 'idle';
        progressCallback = null;
        currentAbort?.abort();
        currentAbort = null;
        flushPostSynthesisMemory().catch(() => {});
      }
    }, failsafeRemainingMs);
  };

  const onFailsafeVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      if (failsafeTimer !== null) {
        const elapsed = Date.now() - failsafeStartedAt;
        failsafeRemainingMs = Math.max(0, failsafeRemainingMs - elapsed);
        clearFailsafe();
      }
    } else {
      if (queueState === 'running' && failsafeRemainingMs > 0) {
        startFailsafe();
      }
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onFailsafeVisibilityChange);
  }
  startFailsafe();

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

    let clipResult: ClipMergeResult | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      if (queueState !== 'running') break;

      try {
        progressCallback?.({
          currentIndex: i,
          totalClips: clips.length,
          clipId: clip.id,
          phase: 'rendering',
          progress: 0.3,
        });

        const { data, error: invokeError } = await supabase.functions.invoke('mux-video-audio', {
          body: {
            videoUrl: clip.videoUrl,
            audioUrl: clip.audioUrl,
            scanId: clip.id,
            targetDurationSec: clip.targetDurationSec,
            audioOffsetSec: clip.audioOffsetSec,
            audioDurationSec: clip.audioDurationSec,
          },
          signal: currentAbort?.signal,
        });

        if (invokeError || !data || data.error) {
          throw new Error(data?.error || invokeError?.message || '병합 실패');
        }

        if (data.muxedUrl) {
          clipResult = {
            id: clip.id,
            mux: { url: data.muxedUrl, revoke: () => {} },
            attempts: attempt + 1,
          };
          progressCallback?.({
            currentIndex: i,
            totalClips: clips.length,
            clipId: clip.id,
            phase: 'done',
            progress: 1,
          });
          break;
        } else {
          throw new Error('서버 응답에 muxedUrl이 없습니다.');
        }
      } catch (err) {
        lastError = err;
        const retryable = isRetryableError(err);

        if (attempt < MAX_RETRY_ATTEMPTS && retryable) {
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
      completedResults.push(clipResult);
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
    await flushPostSynthesisMemory();
  }

  queueState = 'idle';
  progressCallback = null;
  completedResults = [];
  clearFailsafe();
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onFailsafeVisibilityChange);
  }

  return results;
}

export function cancelMergeQueue(): void {
  queueState = 'idle';
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  pendingClips.length = 0;
  completedResults = [];
  flushPostSynthesisMemory().catch(() => {});
}

export function getMergeQueueState(): QueueState {
  return queueState;
}
