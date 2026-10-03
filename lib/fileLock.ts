/**
 * In-memory file lock to prevent concurrent access conflicts on temp files.
 *
 * When an editor or pipeline is actively reading/writing a temp file, the
 * path is registered here. A background garbage collector can call
 * `isFileLocked` / `filterLockedPaths` to skip those files during cleanup.
 */

const activeFileLocks = new Map<string, number>();
const ACQUIRE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 50;

/**
 * Acquire a lock on a file path. Returns a release function.
 * If the path is already locked, waits until it is released or
 * the timeout expires. Throws on timeout to prevent permanent deadlock.
 */
export async function acquireFileLock(filePath: string): Promise<() => void> {
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  while (activeFileLocks.has(filePath)) {
    if (Date.now() >= deadline) {
      activeFileLocks.delete(filePath);
      throw new Error(`파일 잠금 대기 시간이 초과되었습니다: ${filePath}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  activeFileLocks.set(filePath, Date.now());

  return () => {
    activeFileLocks.delete(filePath);
  };
}

/**
 * Run an async callback while holding the lock on a file path.
 * The lock is always released on completion or error.
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireFileLock(filePath);
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Check whether a file path is currently locked.
 */
export function isFileLocked(filePath: string): boolean {
  return activeFileLocks.has(filePath);
}

/**
 * Filter out locked paths from a list of candidate paths.
 * Used by garbage collectors to skip active files.
 */
export function filterLockedPaths(paths: string[]): string[] {
  return paths.filter((p) => !activeFileLocks.has(p));
}

/**
 * Get all currently locked file paths (for diagnostics).
 */
export function getLockedPaths(): string[] {
  return Array.from(activeFileLocks.keys());
}
