/**
 * Boot-time orphan sweeper.
 *
 * After a force-kill (OOM, swipe-close, crash), in-memory registries are
 * wiped. The existing sweep functions in tempFileManager / mediaCache /
 * offlineCache only clean *registered* entries, so orphans from the
 * previous session survive indefinitely — blob: URLs that can't be
 * revoked (the page is gone), IndexedDB entries with no matching L1
 * cache, and localStorage cache entries that never got a visibility-change
 * sweep.
 *
 * This module runs once at boot, scanning storage directly (not through
 * the in-memory registry) and aggressively deleting anything older than
 * the staleness threshold. It is non-blocking and best-effort.
 */

import { Platform } from 'react-native';
import { addBreadcrumb } from '@/lib/errorLogger';

const BOOT_SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BOOT_SWEEP_IDB_BATCH = 50;
const BOOT_SWEEP_STORAGE_PREFIX = 'cache:';
const BOOT_SWEEP_IDB_DB_NAME = 'media-cache-db';
const BOOT_SWEEP_IDB_STORE = 'media';
const BOOT_SWEEP_IDB_KEY_PREFIX = 'media-cache:';
const BOOT_SWEEP_TAG = 'bootSweeper';

export interface BootSweepResult {
  localStorageRemoved: number;
  indexedDBRemoved: number;
  nativeTempRemoved: number;
  errors: number;
}

/**
 * Sweep localStorage for `cache:` entries older than maxAgeMs.
 * Unlike sweepStaleOfflineCache, this runs unconditionally at boot
 * and uses an aggressive 24h threshold to catch orphans from
 * force-killed sessions that never got a visibility-change sweep.
 */
function sweepLocalStorage(maxAgeMs: number): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  const now = Date.now();
  let removed = 0;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(BOOT_SWEEP_STORAGE_PREFIX)) continue;
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { timestamp?: number };
        if (!parsed.timestamp || now - parsed.timestamp > maxAgeMs) {
          keysToRemove.push(k);
        }
      } catch {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      try {
        window.localStorage.removeItem(k);
        removed++;
      } catch {}
    }
  } catch {}
  return removed;
}

/**
 * Sweep IndexedDB media-cache entries older than maxAgeMs.
 * Opens its own DB connection independently of mediaCache.ts so it
 * works even if the media cache module was never initialized in this
 * session.
 */
function sweepIndexedDB(maxAgeMs: number): Promise<number> {
  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') {
    return Promise.resolve(0);
  }

  return new Promise((resolve) => {
    let deleted = 0;
    let dbHandle: IDBDatabase | null = null;

    try {
      const req = indexedDB.open(BOOT_SWEEP_IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(BOOT_SWEEP_IDB_STORE)) {
          d.createObjectStore(BOOT_SWEEP_IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const d: IDBDatabase = req.result;
        dbHandle = d;
        if (!d.objectStoreNames.contains(BOOT_SWEEP_IDB_STORE)) {
          try { d.close(); } catch {}
          resolve(0);
          return;
        }

        const now = Date.now();
        let processedInBatch = 0;

        const tx = d.transaction(BOOT_SWEEP_IDB_STORE, 'readwrite');
        const store = tx.objectStore(BOOT_SWEEP_IDB_STORE);
        const cursorReq = store.openCursor();

        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;

          const key = cursor.key;
          if (typeof key === 'string' && key.startsWith(BOOT_SWEEP_IDB_KEY_PREFIX)) {
            const value = cursor.value;
            const ts = typeof value === 'object' && value !== null ? value.ts : 0;
            if (ts === 0 || now - ts > maxAgeMs) {
              cursor.delete();
              deleted++;
            }
          }

          processedInBatch++;
          if (processedInBatch >= BOOT_SWEEP_IDB_BATCH) {
            processedInBatch = 0;
          }
          cursor.continue();
        };

        tx.oncomplete = () => {
          try { d.close(); } catch {}
          resolve(deleted);
        };
        tx.onerror = () => {
          try { d.close(); } catch {}
          resolve(deleted);
        };
      };
      req.onerror = () => resolve(0);
    } catch {
      try { (dbHandle as IDBDatabase | null)?.close(); } catch {}
      resolve(0);
    }
  });
}

/**
 * Sweep native filesystem temp directory for stale files.
 * On native, expo-file-system cache directory can accumulate orphaned
 * files from a force-killed session. We scan for files matching the
 * media_cache_ prefix and delete those older than maxAgeMs.
 */
async function sweepNativeTemp(maxAgeMs: number): Promise<number> {
  if (Platform.OS === 'web') return 0;

  try {
    const fs = await import('expo-file-system/legacy');
    const dir = fs.cacheDirectory;
    if (!dir) return 0;

    const now = Date.now();
    let removed = 0;

    try {
      const files = await fs.readDirectoryAsync(dir);
      const cacheFiles = files.filter(
        (f) => f.startsWith('media_cache_') || f.startsWith('temp_render_') || f.startsWith('temp_chunk_'),
      );

      for (const file of cacheFiles) {
        const filePath = `${dir}${file}`;
        try {
          const info = await fs.getInfoAsync(filePath);
          if (!info.exists) continue;
          const modificationTime = (info as { modificationTime?: number }).modificationTime;
          if (modificationTime && now - modificationTime * 1000 > maxAgeMs) {
            await fs.deleteAsync(filePath, { idempotent: true });
            removed++;
          }
        } catch {}
      }
    } catch {}

    return removed;
  } catch {
    return 0;
  }
}

/**
 * Run the full boot-time sweep. Should be called once shortly after
 * app mount. Non-blocking: yields between phases so the UI can render.
 */
export async function runBootSweep(
  maxAgeMs: number = BOOT_SWEEP_MAX_AGE_MS,
): Promise<BootSweepResult> {
  const result: BootSweepResult = {
    localStorageRemoved: 0,
    indexedDBRemoved: 0,
    nativeTempRemoved: 0,
    errors: 0,
  };

  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    result.localStorageRemoved = sweepLocalStorage(maxAgeMs);
  } catch {
    result.errors++;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  try {
    result.indexedDBRemoved = await sweepIndexedDB(maxAgeMs);
  } catch {
    result.errors++;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  try {
    result.nativeTempRemoved = await sweepNativeTemp(maxAgeMs);
  } catch {
    result.errors++;
  }

  const totalRemoved =
    result.localStorageRemoved + result.indexedDBRemoved + result.nativeTempRemoved;
  if (totalRemoved > 0) {
    addBreadcrumb(
      BOOT_SWEEP_TAG,
      `Boot sweep removed ${totalRemoved} orphaned entries (LS:${result.localStorageRemoved}, IDB:${result.indexedDBRemoved}, Native:${result.nativeTempRemoved})`,
      'warning',
    );
  }

  return result;
}

export const BOOT_SWEEP_AGE_MS = BOOT_SWEEP_MAX_AGE_MS;
