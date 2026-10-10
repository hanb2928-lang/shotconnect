/**
 * Serialized AppState transition coordinator.
 *
 * Problem: when the app transitions to background/inactive, the OS locks
 * the native bridge within milliseconds. If multiple AppState handlers fire
 * synchronously and each enqueues bridge calls (supabase.removeChannel,
 * setItem, abort on in-flight invokes), the microtask queue explodes with
 * pending bridge traffic at the exact moment the bridge is locked. The JS
 * thread deadlocks waiting for bridge responses that will never arrive,
 * triggering a watchdog timeout and SIGKILL.
 *
 * Solution: instead of dispatching all handlers synchronously via forEach,
 * the coordinator separates handler work into two phases:
 *
 *  1. Immediate phase: only in-process, synchronous, bridge-free work
 *     (AbortController.abort(), clearing timers, setting flags). This
 *     runs instantly with no bridge contact.
 *
 *  2. Deferred phase: any work that touches the native bridge (network
 *     calls, removeChannel, setItem) is deferred to sequential macrotasks
 *     via setTimeout(0). Each deferred task runs in its own event loop
 *     turn, so the JS thread yields to the OS between tasks. If the OS
 *     suspends the process, pending timers simply don't fire — they don't
 *     pile up on the bridge.
 *
 * Handlers register as either 'immediate' or 'deferred'. The coordinator
 * runs all immediate handlers synchronously, then schedules deferred
 * handlers one at a time.
 */

export type AppStatePhase = 'immediate' | 'deferred';
export type AppStateHandler = (nextState: string) => void;

interface RegisteredHandler {
  phase: AppStatePhase;
  fn: AppStateHandler;
}

const handlers = new Set<RegisteredHandler>();
let deferredQueue: (() => void)[] = [];
let deferredTimer: ReturnType<typeof setTimeout> | null = null;
let lastDispatchedState: string | null = null;

export function registerAppStateHandler(
  phase: AppStatePhase,
  fn: AppStateHandler,
): () => void {
  const entry: RegisteredHandler = { phase, fn };
  handlers.add(entry);
  return () => {
    handlers.delete(entry);
  };
}

function processDeferredQueue(): void {
  deferredTimer = null;
  const task = deferredQueue.shift();
  if (!task) return;
  try {
    task();
  } catch {
    // Handler errors are non-fatal.
  }
  if (deferredQueue.length > 0) {
    deferredTimer = setTimeout(processDeferredQueue, 0);
  }
}

export function dispatchAppStateChange(nextState: string): void {
  lastDispatchedState = nextState;

  // Phase 1: immediate handlers run synchronously — abort controllers,
  // timer clears, flag flips. No bridge calls allowed here.
  for (const entry of handlers) {
    if (entry.phase === 'immediate') {
      try {
        entry.fn(nextState);
      } catch {
        // Non-fatal.
      }
    }
  }

  // Phase 2: collect deferred handlers, then run them one per macrotask.
  // This prevents the microtask queue from flooding the bridge during
  // the transition window.
  deferredQueue = [];
  for (const entry of handlers) {
    if (entry.phase === 'deferred') {
      deferredQueue.push(() => {
        try {
          entry.fn(nextState);
        } catch {
          // Non-fatal.
        }
      });
    }
  }

  if (deferredTimer !== null) {
    clearTimeout(deferredTimer);
  }
  if (deferredQueue.length > 0) {
    deferredTimer = setTimeout(processDeferredQueue, 0);
  }
}

export function getLastDispatchedState(): string | null {
  return lastDispatchedState;
}

export function cancelPendingDeferred(): void {
  if (deferredTimer !== null) {
    clearTimeout(deferredTimer);
    deferredTimer = null;
  }
  deferredQueue = [];
}

export function _resetForTesting(): void {
  handlers.clear();
  deferredQueue = [];
  if (deferredTimer !== null) {
    clearTimeout(deferredTimer);
    deferredTimer = null;
  }
  lastDispatchedState = null;
}
