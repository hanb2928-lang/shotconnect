/**
 * Proactive memory flush guard for mobile WebView environments.
 *
 * Mobile browsers delay GC until the heap is nearly full, then kill the
 * process instead of collecting. This module bridges the existing heap
 * pressure detector (devicePerformance.ts) to the cache/resource cleanup
 * functions so that when JS heap usage crosses 80%, we immediately:
 *
 *  1. Revoke all idle Blob URLs (mediaCache L1)
 *  2. Release all idle WebGL contexts (glRenderer context pool)
 *  3. Sweep expired temp files (tempFileManager)
 *  4. Flush pending L2 writes and sweep stale IndexedDB entries (mediaCache)
 *
 * This runs as a side-effect of the pressure level changing, not on every
 * poll — so it adds zero overhead when memory is healthy.
 */

import { onMemoryPressureChange, getMemoryPressure, isMobileWebView } from '@/lib/devicePerformance';
import { addBreadcrumb, logWarning } from '@/lib/errorLogger';

export interface FlushResult {
  flushed: boolean;
  level: 'none' | 'moderate' | 'severe';
  actions: string[];
}

type FlushFn = () => void | Promise<void>;

const flushHandlers: { name: string; fn: FlushFn }[] = [];
let installed = false;
let lastFlushAt = 0;
const MIN_FLUSH_INTERVAL_MS = 10_000;

let runningFlush: Promise<FlushResult> | null = null;

/**
 * Register a flush handler. When memory pressure crosses the threshold,
 * all registered handlers are invoked in order. Each handler should be
 * fast and idempotent — it may be called multiple times.
 */
export function registerFlushHandler(name: string, fn: FlushFn): void {
  flushHandlers.push({ name, fn });
}

/**
 * Run all registered flush handlers immediately. Returns a summary of
 * which handlers ran. Safe to call manually (e.g. before a heavy
 * operation) — it respects the min interval to avoid thrashing.
 */
export async function runProactiveFlush(force = false): Promise<FlushResult> {
  if (runningFlush) return runningFlush;

  const now = Date.now();
  if (!force && now - lastFlushAt < MIN_FLUSH_INTERVAL_MS) {
    return { flushed: false, level: getMemoryPressure(), actions: [] };
  }

  runningFlush = (async () => {
    const actions: string[] = [];
    const level = getMemoryPressure();

    for (const { name, fn } of flushHandlers) {
      try {
        await fn();
        actions.push(name);
      } catch {
        // Best-effort: a failing handler shouldn't block the rest.
      }
    }

    lastFlushAt = Date.now();

    if (actions.length > 0) {
      addBreadcrumb(
        'memory',
        `Proactive flush: ${actions.length} handlers ran (level: ${level})`,
        level === 'severe' ? 'error' : 'warning',
        { actions, level },
      );
      if (level === 'severe') {
        logWarning(`Proactive memory flush (severe): ${actions.join(', ')}`, {
          component: 'proactiveMemoryFlush',
          action: 'severeFlush',
        });
      }
    }

    return { flushed: actions.length > 0, level, actions };
  })();

  try {
    return await runningFlush;
  } finally {
    runningFlush = null;
  }
}

/**
 * Install the proactive flush guard. Listens to memory pressure changes
 * from devicePerformance and triggers flush handlers when pressure
 * escalates to moderate or severe.
 *
 * Should be called once at app startup (from _layout.tsx).
 */
export function installProactiveMemoryFlush(): () => void {
  if (installed) return () => {};
  installed = true;

  const unsub = onMemoryPressureChange((level) => {
    if (level === 'moderate' || level === 'severe') {
      runProactiveFlush().catch(() => {});
    }
  });

  return () => {
    installed = false;
    unsub();
  };
}

/**
 * Check whether the proactive flush guard should be active.
 * Only meaningful in WebView environments where performance.memory is
 * available — on native, the OS handles memory pressure directly.
 */
export function isProactiveFlushAvailable(): boolean {
  if (typeof performance === 'undefined') return false;
  return typeof (performance as any).memory !== 'undefined' || isMobileWebView();
}

/**
 * Get current heap usage ratio (0–1), or null if performance.memory
 * is unavailable.
 */
export function getHeapUsageRatio(): number | null {
  if (typeof performance === 'undefined') return null;
  const mem = (performance as any).memory;
  if (!mem || !mem.jsHeapSizeLimit) return null;
  return mem.usedJSHeapSize / mem.jsHeapSizeLimit;
}

/**
 * Whether the last flush was triggered recently (within the min
 * interval). Useful for tests to verify throttling.
 */
export function wasRecentlyFlushed(): boolean {
  return Date.now() - lastFlushAt < MIN_FLUSH_INTERVAL_MS;
}

export function _resetForTesting(): void {
  flushHandlers.length = 0;
  installed = false;
  lastFlushAt = 0;
  runningFlush = null;
}
