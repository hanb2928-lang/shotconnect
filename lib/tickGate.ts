/**
 * Centralized Synchronized Tick Gate
 *
 * Prevents the "race vortex" where multiple concurrent polling loops
 * (aiVideoPipeline's DB poll, useResultPolling's hybrid poll, the
 * Runway API fallback poll) fire on independent timers with different
 * intervals, creating interference patterns in the JS async queue that
 * cause thread starvation on foreground return.
 *
 * The tick gate serializes poll execution so that at most one poll
 * callback is in-flight at any moment. When a tick fires, it waits for
 * the previous tick to complete before executing, preventing overlapping
 * DB queries and network requests from saturating the bridge.
 */

type TickFn = () => Promise<void>;

function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface TickRegistration {
  id: string;
  fn: TickFn;
  intervalMs: number;
  lastFired: number;
  active: boolean;
}

let registrations: TickRegistration[] = [];
let globalTickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

const GLOBAL_TICK_MS = 500;

function processTick(): void {
  if (tickInFlight) return;
  const now = Date.now();
  const ready = registrations.filter(
    (r) => r.active && now - r.lastFired >= r.intervalMs,
  );
  if (ready.length === 0) return;

  tickInFlight = true;
  (async () => {
    for (const [index, reg] of ready.entries()) {
      if (!reg.active) continue;
      reg.lastFired = now;
      if (index > 0) await yieldToMacrotask();
      try {
        await reg.fn();
      } catch {
        // Swallow errors — each registration handles its own error recovery.
      }
    }
  })().finally(() => {
    tickInFlight = false;
  });
}

function ensureTimer(): void {
  if (globalTickTimer) return;
  globalTickTimer = setInterval(processTick, GLOBAL_TICK_MS);
  // Unref so the timer doesn't keep Node alive in SSR/test environments.
  if (typeof globalTickTimer.unref === 'function') {
    globalTickTimer.unref();
  }
}

function maybeStopTimer(): void {
  if (registrations.length > 0) return;
  if (!globalTickTimer) return;
  clearInterval(globalTickTimer);
  globalTickTimer = null;
}

/**
 * Register a polling function with the centralized tick gate.
 * Returns an unregister function that removes the registration and
 * cleans up the global timer when no registrations remain.
 */
export function registerTick(
  id: string,
  fn: TickFn,
  intervalMs: number,
): () => void {
  const existing = registrations.find((r) => r.id === id);
  if (existing) {
    existing.fn = fn;
    existing.intervalMs = intervalMs;
    existing.active = true;
  } else {
    registrations.push({
      id,
      fn,
      intervalMs,
      lastFired: 0,
      active: true,
    });
  }
  ensureTimer();

  return () => {
    const reg = registrations.find((r) => r.id === id);
    if (reg) reg.active = false;
    registrations = registrations.filter((r) => r.active);
    maybeStopTimer();
  };
}

/**
 * Pause all tick registrations (e.g. on background transition).
 * The global timer keeps running but no ticks fire while paused.
 */
export function pauseAllTicks(): void {
  for (const r of registrations) {
    r.active = false;
  }
}

/**
 * Resume all tick registrations and reset their lastFired so they
 * fire immediately on the next global tick (foreground return burst).
 */
export function resumeAllTicks(): void {
  const resumeAt = Date.now();
  registrations.forEach((r, index) => {
    r.active = true;
    r.lastFired = resumeAt - r.intervalMs + index * 250;
  });
}

/**
 * Check whether a tick for the given ID is currently registered and active.
 */
export function isTickActive(id: string): boolean {
  const reg = registrations.find((r) => r.id === id);
  return !!reg && reg.active;
}
