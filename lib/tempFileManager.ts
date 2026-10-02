/**
 * Centralized temp file manager with lock-aware garbage collection.
 *
 * Every temp file created by a rendering pipeline, editor, or upload helper
 * should be registered here. When a garbage collection sweep runs, any file
 * currently locked via `withFileLock` / `acquireFileLock` is skipped —
 * preventing the race where a GC sweep deletes a file that a pipeline
 * is still reading or writing.
 *
 * Additionally, files can be pinned (kept alive regardless of age) for
 * long-running operations like video rendering that span multiple minutes.
 */

import { Platform } from 'react-native';
import { isFileLocked } from '@/lib/fileLock';

interface TempFileEntry {
  path: string;
  registeredAt: number;
  lastTouched: number;
  pinned: boolean;
  source: string;
}

const registry = new Map<string, TempFileEntry>();

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const SWEEP_BATCH_SIZE = 20;

let FileSystemModule: typeof import('expo-file-system/legacy') | null = null;

async function getFileSystem(): Promise<typeof import('expo-file-system/legacy') | null> {
  if (FileSystemModule) return FileSystemModule;
  if (Platform.OS === 'web') return null;
  try {
    FileSystemModule = await import('expo-file-system/legacy');
    return FileSystemModule;
  } catch {
    return null;
  }
}

export function registerTempFile(
  path: string,
  source: string,
  options?: { pin?: boolean },
): void {
  const now = Date.now();
  const existing = registry.get(path);
  if (existing) {
    existing.lastTouched = now;
    if (options?.pin) existing.pinned = true;
    return;
  }
  registry.set(path, {
    path,
    registeredAt: now,
    lastTouched: now,
    pinned: options?.pin ?? false,
    source,
  });
}

export function touchTempFile(path: string): void {
  const entry = registry.get(path);
  if (entry) entry.lastTouched = Date.now();
}

export function pinTempFile(path: string): void {
  const entry = registry.get(path);
  if (entry) entry.pinned = true;
}

export function unpinTempFile(path: string): void {
  const entry = registry.get(path);
  if (entry) entry.pinned = false;
}

export function unregisterTempFile(path: string): void {
  registry.delete(path);
}

export function getRegisteredTempFiles(): string[] {
  return Array.from(registry.keys());
}

export function isTempFileLocked(path: string): boolean {
  return isFileLocked(path);
}

/**
 * Delete a single temp file, respecting any active lock.
 * Returns true if the file was deleted, false if it was locked or deletion failed.
 */
export async function safeDeleteTempFile(path: string): Promise<boolean> {
  if (isFileLocked(path)) return false;

  if (Platform.OS === 'web') {
    if (path.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(path);
        registry.delete(path);
        return true;
      } catch {
        return false;
      }
    }
    registry.delete(path);
    return true;
  }

  const fs = await getFileSystem();
  if (!fs) {
    registry.delete(path);
    return false;
  }

  try {
    await fs.deleteAsync(path, { idempotent: true });
    registry.delete(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a garbage collection sweep over all registered temp files.
 * Files that are locked, pinned, or younger than maxAgeMs are skipped.
 * Deletion is batched to avoid blocking the main thread.
 *
 * Returns the number of files deleted.
 */
export async function sweepTempFiles(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<number> {
  const now = Date.now();
  const candidates: string[] = [];

  for (const entry of registry.values()) {
    if (entry.pinned) continue;
    if (isFileLocked(entry.path)) continue;
    if (now - entry.lastTouched < maxAgeMs) continue;
    candidates.push(entry.path);
  }

  let deleted = 0;
  for (let i = 0; i < candidates.length; i += SWEEP_BATCH_SIZE) {
    const batch = candidates.slice(i, i + SWEEP_BATCH_SIZE);
    await Promise.all(
      batch.map(async (path) => {
        if (await safeDeleteTempFile(path)) deleted++;
      }),
    );
    // Yield between batches so the main thread isn't blocked.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  return deleted;
}

/**
 * Delete all registered temp files for a specific source (e.g. a pipeline
 * session ID), respecting locks. Called when a pipeline finishes and wants
 * to clean up its own temp files.
 */
export async function cleanupTempFilesBySource(
  source: string,
): Promise<number> {
  const candidates: string[] = [];
  for (const entry of registry.values()) {
    if (entry.source === source) candidates.push(entry.path);
  }

  let deleted = 0;
  await Promise.all(
    candidates.map(async (path) => {
      if (await safeDeleteTempFile(path)) deleted++;
    }),
  );
  return deleted;
}

/**
 * Convenience: register a temp file, run an operation, then clean it up.
 * The file is pinned for the duration of the operation so that GC sweeps
 * don't collect it mid-operation even if the lock is briefly released
 * between sub-steps.
 */
export async function withTempFile<T>(
  path: string,
  source: string,
  fn: () => Promise<T>,
): Promise<T> {
  registerTempFile(path, source, { pin: true });
  try {
    return await fn();
  } finally {
    unpinTempFile(path);
    await safeDeleteTempFile(path);
  }
}
