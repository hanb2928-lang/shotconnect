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

interface Disposable {
  revoke?: () => void;
  close?: () => void;
  disconnect?: () => void;
}

const pendingDisposables: Disposable[] = [];

export function registerDisposable(d: Disposable): void {
  pendingDisposables.push(d);
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
