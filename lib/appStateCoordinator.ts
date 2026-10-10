/**
 * Serialized AppState transition coordinator with microtask drain gate.
 *
 * Problem: when the app transitions to background/inactive, the OS locks
 * the native bridge within milliseconds. If multiple AppState handlers fire
 * synchronously and each enqueues bridge calls (supabase.removeChannel,
 * setItem, abort on in-flight invokes), the microtask queue explodes with
 * pending bridge traffic at the exact moment the bridge is locked. The JS
 * thread deadlocks waiting for bridge responses that will never arrive,
 * triggering a watchdog timeout and SIGKILL.
 *
 * A second, subtler problem: the immediate phase aborts AbortControllers
 * and clears timers. Those aborts trigger `.catch()` and `.finally()`
 * microtasks from every in-flight promise that was watching the signal.
 * When dozens of promises abort simultaneously, their rejection handlers
 * flood the microtask queue in a single drain — and any handler that
 * touches the bridge (logging, state cleanup, removeChannel) does so while
 * the bridge is already locking. This is the "microtask explosion window"
 * between the immediate phase and the first deferred macrotask.
 *
 * Solution: three-phase dispatch with a microtask drain gate.
 *
 *  1. Immediate phase: only in-process, synchronous, bridge-free work
 *     (AbortController.abort(), clearing timers, setting flags). This
 *     runs instantly with no bridge contact.
 *
 *  2. Drain phase: a single `queueMicrotask` yields to let all abort-
 *     triggered rejection handlers settle. A suspension gate flag is set
 *     BEFORE this drain so that any new microtask that tries to enqueue
 *     deferred bridge work is silently dropped instead of piling up.
 *     The drain completes within one microtask checkpoint — typically
 *     under 1ms — before the OS bridge lock takes effect.
 *
 *  3. Deferred phase: any work that touches the native bridge (network
 *     calls, removeChannel, setItem) is deferred to sequential macrotasks
 *     via setTimeout(0). Each deferred task runs in its own event loop
 *     turn, so the JS thread yields to the OS between tasks. If the OS
 *     suspends the process, pending timers simply don't fire — they don't
 *     pile up on the bridge.
 *
 * Handlers register as either 'immediate' or 'deferred'. The coordinator
 * runs all immediate handlers synchronously, drains the microtask queue
 * once, then schedules deferred handlers one at a time.
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

// Suspension gate: when true, the coordinator is in the drain phase
// between immediate handlers and deferred macrotasks. Any attempt to
// dispatch a new state change during this window is dropped to prevent
// re-entrant microtask flooding.
let suspending = false;

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
  // Re-entrant dispatch during the drain window would re-trigger
  // immediate handlers and flood the microtask queue again. Drop it.
  if (suspending) return;

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

  // Phase 2: collect deferred handlers. The suspension gate is set
  // before the microtask drain so that abort-triggered rejection
  // handlers that try to re-dispatch are silently dropped.
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

  if (deferredQueue.length === 0) return;

  // Set the suspension gate, then yield once via queueMicrotask to let
  // all abort-triggered rejection/finally handlers drain. These handlers
  // are pure JS (no bridge calls) — they settle within one microtask
  // checkpoint, typically under 1ms. After the drain, clear the gate
  // and schedule the deferred macrotasks.
  suspending = true;
  queueMicrotask(() => {
    suspending = false;
    if (deferredQueue.length > 0) {
      deferredTimer = setTimeout(processDeferredQueue, 0);
    }
  });
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
  suspending = false;
}

export function _resetForTesting(): void {
  handlers.clear();
  deferredQueue = [];
  if (deferredTimer !== null) {
    clearTimeout(deferredTimer);
    deferredTimer = null;
  }
  lastDispatchedState = null;
  suspending = false;
}
