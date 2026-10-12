/**
 * Foreground bridge-flush guard.
 *
 * Problem: when the app returns from background to foreground the native bridge
 * is still warming up from suspension. Multiple concurrent sources — Realtime
 * websocket reconnect events, queued postgres_changes payloads, and polling
 * timers — can all fire simultaneously within the first few hundred milliseconds,
 * flooding the bridge queue ("reconnect storm") and causing ANR / watchdog kills.
 *
 * Solution: arm a 1-second guard window on every foreground transition.
 * During this window, Realtime postgres_changes callbacks are dropped (they may
 * also be stale). After the window expires, exactly ONE force-sync DB fetch is
 * dispatched by each polling consumer instead of the burst of 3+ simultaneous
 * requests that the unguarded resume path used to fire.
 *
 * API:
 *   armFlushWindow()       — called in the 'immediate' AppState phase (no
 *                            bridge calls; sets a boolean and a timer).
 *   isInFlushWindow()      — checked in every Realtime callback; return early
 *                            if true (drop the stale / duplicate event).
 *   onFlushComplete(cb)    — schedule a single force-sync after the window.
 *                            If the window is already closed, cb fires sync.
 *   _resetForTesting()     — test utility.
 */

import { withBridgeThrottle } from '@/lib/bridgeRateLimiter';

const FLUSH_WINDOW_MS = 1000;

let flushWindowActive = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const completionCallbacks: Array<() => void> = [];
const staggerTimers: Set<ReturnType<typeof setTimeout>> = new Set();

export function armFlushWindow(): void {
  flushWindowActive = true;
  // Expose the flag globally so tickGate can check it without a circular
  // import. tickGate is imported by useResultPolling and aiVideoPipeline,
  // which are loaded before _layout.tsx — a direct import of
  // foregroundFlushGuard from tickGate would create a circular dependency.
  if (typeof globalThis !== 'undefined') {
    (globalThis as typeof globalThis & { __flushWindowActive?: boolean }).__flushWindowActive = true;
  }
  if (flushTimer !== null) clearTimeout(flushTimer);
  // Clear any stale stagger timers from a previous flush window so
  // callbacks from the old window don't interleave with the new one.
  for (const t of staggerTimers) clearTimeout(t);
  staggerTimers.clear();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const cbs = completionCallbacks.splice(0);
    // Stagger callbacks across sequential macrotasks with 150ms spacing so the
    // JS thread yields to the OS between each consumer's DB queries and
    // Realtime subscriptions. 80ms was too tight — the native bridge was
    // still saturated when the next callback fired, causing reconnect storms
    // and ANR/watchdog kills. 150ms ensures each bridge operation fully
    // completes before the next one starts.
    const STAGGER_MS = 150;
    let i = 0;
    const runNext = () => {
      if (i >= cbs.length) {
        flushWindowActive = false;
        if (typeof globalThis !== 'undefined') {
          (globalThis as typeof globalThis & { __flushWindowActive?: boolean }).__flushWindowActive = false;
        }
        return;
      }
      const cb = cbs[i++];
      withBridgeThrottle(() => { try { cb(); } catch { /* non-fatal */ } });
      if (i < cbs.length) {
        const t = setTimeout(runNext, STAGGER_MS);
        staggerTimers.add(t);
      }
      else {
        flushWindowActive = false;
        if (typeof globalThis !== 'undefined') {
          (globalThis as typeof globalThis & { __flushWindowActive?: boolean }).__flushWindowActive = false;
        }
      }
    };
    runNext();
  }, FLUSH_WINDOW_MS);
}

export function isInFlushWindow(): boolean {
  return flushWindowActive;
}

/**
 * Register a callback to run once after the flush window closes.
 * If the window is already closed, the callback runs synchronously on the
 * next microtask (via a zero-length setTimeout to keep it off the hot path).
 */
export function onFlushComplete(cb: () => void): void {
  if (!flushWindowActive) {
    setTimeout(cb, 0);
    return;
  }
  completionCallbacks.push(cb);
}

export function _resetForTesting(): void {
  flushWindowActive = false;
  if (typeof globalThis !== 'undefined') {
    (globalThis as typeof globalThis & { __flushWindowActive?: boolean }).__flushWindowActive = false;
  }
  if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
  for (const t of staggerTimers) clearTimeout(t);
  staggerTimers.clear();
  completionCallbacks.length = 0;
}
