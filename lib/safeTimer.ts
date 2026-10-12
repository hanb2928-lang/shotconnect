/**
 * Tracked timer utilities that auto-cancel pending timers on unmount.
 * Prevents setTimeout(0) queues from accumulating when components
 * rapidly unmount or re-enter, which can trigger native watchdog
 * SIGKILLs when the OS suspends the app with a backlog of timers.
 */

export interface SafeTimerSet {
  timers: Set<ReturnType<typeof setTimeout>>;
  intervals: Set<ReturnType<typeof setInterval>>;
}

export function createSafeTimerSet(): SafeTimerSet {
  return { timers: new Set(), intervals: new Set() };
}

export function safeSetTimeout(
  s: SafeTimerSet,
  fn: () => void,
  ms: number,
): ReturnType<typeof setTimeout> {
  const id = setTimeout(() => {
    s.timers.delete(id);
    fn();
  }, ms);
  s.timers.add(id);
  return id;
}

export function safeSetInterval(
  s: SafeTimerSet,
  fn: () => void,
  ms: number,
): ReturnType<typeof setInterval> {
  const id = setInterval(fn, ms);
  s.intervals.add(id);
  return id;
}

export function clearSafeTimer(s: SafeTimerSet, id: ReturnType<typeof setTimeout>): void {
  clearTimeout(id);
  s.timers.delete(id);
}

export function clearSafeInterval(s: SafeTimerSet, id: ReturnType<typeof setInterval>): void {
  clearInterval(id);
  s.intervals.delete(id);
}

export function clearAllSafeTimers(s: SafeTimerSet): void {
  for (const id of s.timers) clearTimeout(id);
  for (const id of s.intervals) clearInterval(id);
  s.timers.clear();
  s.intervals.clear();
}
