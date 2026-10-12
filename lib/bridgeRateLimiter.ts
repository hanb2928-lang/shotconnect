/**
 * Token-bucket rate limiter for the native bridge IPC queue.
 *
 * Problem: on foreground return, the native bridge IPC queue is hit by
 * a burst of deferred handlers (session refresh, Realtime reconnect,
 * DB force-sync, channel re-subscribe) that fire via setTimeout(0) —
 * effectively within the same millisecond. This saturates the bridge's
 * message bus, causing a hardware-level JS thread freeze.
 *
 * Solution: arm a 500ms throttle window on every foreground transition.
 * During this window, each outgoing bridge call is spaced at least
 * MIN_GAP_MS apart. Calls that arrive faster than the gap are queued
 * and released sequentially. After 500ms, the limiter deactivates and
 * all calls pass through with zero overhead.
 */

const THROTTLE_WINDOW_MS = 500;
const MIN_GAP_MS = 80;

let throttleActive = false;
let lastCallTime = 0;
let queue: Array<() => void> = [];
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let deactivateTimer: ReturnType<typeof setTimeout> | null = null;

export function armBridgeThrottle(): void {
  throttleActive = true;
  lastCallTime = 0;
  if (deactivateTimer) clearTimeout(deactivateTimer);
  deactivateTimer = setTimeout(() => {
    throttleActive = false;
    deactivateTimer = null;
    flushQueue();
  }, THROTTLE_WINDOW_MS);
}

function flushQueue(): void {
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
  }
  const pending = queue;
  queue = [];
  for (const cb of pending) {
    try { cb(); } catch { /* non-fatal */ }
  }
}

function scheduleDrain(): void {
  if (drainTimer || queue.length === 0) return;
  const now = Date.now();
  const elapsed = now - lastCallTime;
  const delay = Math.max(0, MIN_GAP_MS - elapsed);
  drainTimer = setTimeout(() => {
    drainTimer = null;
    if (queue.length === 0) return;
    lastCallTime = Date.now();
    const cb = queue.shift()!;
    try { cb(); } catch { /* non-fatal */ }
    if (queue.length > 0) scheduleDrain();
  }, delay);
}

export function withBridgeThrottle(fn: () => void): void {
  if (!throttleActive) {
    fn();
    return;
  }
  const now = Date.now();
  if (now - lastCallTime >= MIN_GAP_MS) {
    lastCallTime = now;
    fn();
    return;
  }
  queue.push(fn);
  scheduleDrain();
}

export function isBridgeThrottleActive(): boolean {
  return throttleActive;
}

export function _resetBridgeThrottle(): void {
  throttleActive = false;
  lastCallTime = 0;
  queue = [];
  if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
  if (deactivateTimer) { clearTimeout(deactivateTimer); deactivateTimer = null; }
}
