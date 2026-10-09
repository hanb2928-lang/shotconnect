import { forceResetPipelineLock } from '@/lib/pipelineLock';

export type FailureCategory =
  | 'payload_too_large'
  | 'memory_pressure'
  | 'network_timeout'
  | 'network_unstable'
  | 'rate_limited'
  | 'server_error'
  | 'auth_error'
  | 'unknown';

export interface RetryStrategy {
  shouldRetry: boolean;
  maxAttempts: number;
  delayMs: number;
  reduceQualityBy: number;
  reduceMaxDimensionBy: number;
  triggerMemoryGuard: boolean;
  label: string;
}

const DEFAULT_STRATEGY: RetryStrategy = {
  shouldRetry: false,
  maxAttempts: 0,
  delayMs: 0,
  reduceQualityBy: 0,
  reduceMaxDimensionBy: 0,
  triggerMemoryGuard: false,
  label: '',
};

export function classifyFailure(err: unknown): FailureCategory {
  if (!err) return 'unknown';
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  if (msg.includes('413') || msg.includes('payload too large') || msg.includes('entity too large') || msg.includes('too large')) {
    return 'payload_too_large';
  }
  if (msg.includes('heap') || msg.includes('memory') || msg.includes('oom') || msg.includes('out of memory') || msg.includes('low memory') || msg.includes('lmk') || msg.includes('sigkill')) {
    return 'memory_pressure';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('시간 초과')) {
    return 'network_timeout';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('fetch') && msg.includes('error')) {
    return 'network_unstable';
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return 'rate_limited';
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('server')) {
    return 'server_error';
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('api key')) {
    return 'auth_error';
  }
  return 'unknown';
}

export function getRetryStrategy(category: FailureCategory, attempt: number): RetryStrategy {
  switch (category) {
    case 'payload_too_large':
      return {
        shouldRetry: attempt < 3,
        maxAttempts: 3,
        delayMs: 500,
        reduceQualityBy: 0.15 * attempt,
        reduceMaxDimensionBy: 200 * attempt,
        triggerMemoryGuard: true,
        label: '이미지 크기가 커서 압축률을 높여 재시도합니다',
      };
    case 'memory_pressure':
      return {
        shouldRetry: attempt < 2,
        maxAttempts: 2,
        delayMs: 1500,
        reduceQualityBy: 0.2 * attempt,
        reduceMaxDimensionBy: 300 * attempt,
        triggerMemoryGuard: true,
        label: '메모리 부족 감지 — 쿨다운 후 재시도합니다',
      };
    case 'network_timeout':
      return {
        shouldRetry: attempt < 2,
        maxAttempts: 2,
        delayMs: 2000 * (attempt + 1),
        reduceQualityBy: 0,
        reduceMaxDimensionBy: 0,
        triggerMemoryGuard: false,
        label: '네트워크 타임아웃 — 연결 복구 후 재시도합니다',
      };
    case 'network_unstable':
      return {
        shouldRetry: attempt < 2,
        maxAttempts: 2,
        delayMs: 2000 * (attempt + 1),
        reduceQualityBy: 0,
        reduceMaxDimensionBy: 0,
        triggerMemoryGuard: false,
        label: '네트워크 불안정 — 재연결 후 재시도합니다',
      };
    case 'rate_limited':
      return {
        shouldRetry: attempt < 1,
        maxAttempts: 1,
        delayMs: 5000,
        reduceQualityBy: 0,
        reduceMaxDimensionBy: 0,
        triggerMemoryGuard: false,
        label: '요청이 많아 잠시 대기 후 재시도합니다',
      };
    case 'server_error':
      return {
        shouldRetry: attempt < 2,
        maxAttempts: 2,
        delayMs: 3000 * (attempt + 1),
        reduceQualityBy: 0,
        reduceMaxDimensionBy: 0,
        triggerMemoryGuard: false,
        label: '서버 오류 — 잠시 후 재시도합니다',
      };
    default:
      return { ...DEFAULT_STRATEGY, shouldRetry: false };
  }
}

export interface SafeSnapshot {
  screenPhase: string;
  captureMode: string;
  contentTone: string;
  timestamp: number;
  label: string;
}

let currentSnapshot: SafeSnapshot | null = null;
const listeners = new Set<(snapshot: SafeSnapshot | null) => void>();

export function captureSnapshot(snapshot: Omit<SafeSnapshot, 'timestamp'>): void {
  currentSnapshot = { ...snapshot, timestamp: Date.now() };
  for (const listener of listeners) {
    try { listener(currentSnapshot); } catch { /* ignore */ }
  }
}

export function clearSnapshot(): void {
  currentSnapshot = null;
  for (const listener of listeners) {
    try { listener(null); } catch { /* ignore */ }
  }
}

export function getSnapshot(): SafeSnapshot | null {
  return currentSnapshot;
}

export function onSnapshotChange(listener: (snapshot: SafeSnapshot | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Restores the app to the last safe snapshot after a pipeline error.
 * Force-resets the pipeline lock, clears the snapshot, and returns the
 * snapshot so the caller can restore UI state.
 */
export function rollbackToSnapshot(): SafeSnapshot | null {
  forceResetPipelineLock();
  const snapshot = currentSnapshot;
  currentSnapshot = null;
  return snapshot;
}
