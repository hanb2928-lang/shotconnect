const PIPELINE_LOCK_TIMEOUT_MS = 30_000;

let lockedBy: string | null = null;
let lockedAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearLockTimer(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

export function acquirePipelineLock(owner = 'default'): boolean {
  if (lockedBy !== null) return false;
  lockedBy = owner;
  lockedAt = Date.now();
  clearLockTimer();
  pendingTimer = setTimeout(() => {
    if (lockedBy === owner) {
      lockedBy = null;
    }
    pendingTimer = null;
  }, PIPELINE_LOCK_TIMEOUT_MS);
  return true;
}

export function releasePipelineLock(owner?: string): void {
  if (owner !== undefined && lockedBy !== null && lockedBy !== owner) return;
  lockedBy = null;
  clearLockTimer();
}

export function isPipelineLocked(): boolean {
  return lockedBy !== null;
}

export function getLockOwner(): string | null {
  return lockedBy;
}

export function getLockAgeMs(): number {
  return lockedBy !== null ? Date.now() - lockedAt : 0;
}

export function forceResetPipelineLock(): void {
  lockedBy = null;
  clearLockTimer();
}
