/**
 * Post-synthesis memory release guard.
 *
 * After TTS generation and video muxing complete, large byte buffers
 * (audio data, video chunks, blob URLs, ImageBitmaps) may still be
 * referenced by closures or media elements. This utility batches the
 * release of all transient resources in a single pass, then schedules
 * a microtask yield so the JS engine can reclaim freed memory before
 * the next clip begins processing.
 */

import { sweepTempFiles } from '@/lib/tempFileManager';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { Platform } from 'react-native';

interface Disposable {
  revoke?: () => void;
  close?: () => void;
  disconnect?: () => void;
}

const pendingDisposables: Disposable[] = [];

let flushRegistered = false;
function registerBackgroundFlush(): void {
  if (flushRegistered) return;
  flushRegistered = true;
  if (Platform.OS === 'web') return;
  // Register an immediate AppState handler to release disposables on
  // background. Without this, Blob URLs and GL contexts from failed
  // synthesis runs accumulate indefinitely in the JS heap — the
  // primary cause of OOM kills after repeated background transitions.
  registerAppStateHandler('immediate', (nextState: string) => {
    if (nextState === 'background' || nextState === 'inactive') {
      while (pendingDisposables.length > 0) {
        const d = pendingDisposables.pop()!;
        try { d.revoke?.(); } catch {}
        try { d.close?.(); } catch {}
        try { d.disconnect?.(); } catch {}
      }
    }
  });
}
registerBackgroundFlush();

export function registerDisposable(d: Disposable): void {
  pendingDisposables.push(d);
  // Safety cap: if disposables accumulate beyond 50 (e.g. synthesis
  // failed without calling flushPostSynthesisMemory), release the
  // oldest ones to prevent unbounded memory growth.
  if (pendingDisposables.length > 50) {
    const stale = pendingDisposables.splice(0, pendingDisposables.length - 50);
    for (const d of stale) {
      try { d.revoke?.(); } catch {}
      try { d.close?.(); } catch {}
      try { d.disconnect?.(); } catch {}
    }
  }
}

export function releaseDisposable(d: Disposable): void {
  try { d.revoke?.(); } catch {}
  try { d.close?.(); } catch {}
  try { d.disconnect?.(); } catch {}
  const idx = pendingDisposables.indexOf(d);
  if (idx >= 0) pendingDisposables.splice(idx, 1);
}

/**
 * Flush all pending disposables and run a temp file GC sweep.
 * Call this after a synthesis/mux pipeline completes (success or failure)
 * to reset memory occupancy to zero before the next clip starts.
 *
 * Returns the number of temp files deleted.
 */
export async function flushPostSynthesisMemory(): Promise<number> {
  while (pendingDisposables.length > 0) {
    const d = pendingDisposables.pop()!;
    try { d.revoke?.(); } catch {}
    try { d.close?.(); } catch {}
    try { d.disconnect?.(); } catch {}
  }

  const deleted = await sweepTempFiles();

  // Yield to the event loop so the engine can GC freed allocations
  // before the caller starts the next clip's allocation.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  return deleted;
}
