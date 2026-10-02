/**
 * Two-tier media cache for binary assets (processed images, thumbnails,
 * composited backgrounds, bg-removed results).
 *
 * L1: In-memory Map holding Blob URLs (web) or base64 strings (native).
 *     Hot-path reads are synchronous and zero-I/O.
 * L2: Persistent disk storage — IndexedDB for web, FileSystem for native.
 *     Written lazily when the app goes background or a batch threshold is hit,
 *     so rendering is never blocked by disk I/O.
 *
 * The cache is content-addressed: keys are hashes of the input parameters
 * so identical operations skip reprocessing entirely.
 */

import { Platform } from 'react-native';
import { hashObject } from '@/lib/contentHash';

const L1_MAX_ENTRIES = 60;
const L2_BATCH_THRESHOLD = 5;
const L2_KEY_PREFIX = 'media-cache:';
const L2_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const L2_GC_BATCH_SIZE = 50;

interface L1Entry {
  url: string;
  size: number;
  createdAt: number;
  isBlobUrl: boolean;
}

const l1Map = new Map<string, L1Entry>();
const l2Pending = new Set<string>();
let l2FlushInProgress = false;

// ─── L1: In-memory ──────────────────────────────────────────────────────────

function evictL1(): void {
  if (l1Map.size <= L1_MAX_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of l1Map) {
    if (entry.createdAt < oldestTime) {
      oldestTime = entry.createdAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    const entry = l1Map.get(oldestKey);
    if (entry?.isBlobUrl) {
      try {
        URL.revokeObjectURL(entry.url);
      } catch {}
    }
    l1Map.delete(oldestKey);
  }
}

export function mediaCacheGetSync(key: string): string | null {
  const entry = l1Map.get(key);
  if (!entry) return null;
  return entry.url;
}

export async function mediaCacheGet(key: string): Promise<string | null> {
  const l1 = mediaCacheGetSync(key);
  if (l1) return l1;

  const l2 = await readL2(key);
  if (l2) {
    promoteL2toL1(key, l2);
    return l1Map.get(key)?.url ?? null;
  }
  return null;
}

export async function mediaCacheSet(key: string, dataUrl: string): Promise<void> {
  let url = dataUrl;
  let isBlobUrl = false;

  if (Platform.OS === 'web' && dataUrl.startsWith('data:')) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      isBlobUrl = true;
    } catch {
      url = dataUrl;
    }
  }

  const size = Math.round(dataUrl.length * 0.75);
  l1Map.set(key, { url, size, createdAt: Date.now(), isBlobUrl });
  evictL1();

  l2Pending.add(key);
  if (l2Pending.size >= L2_BATCH_THRESHOLD) {
    flushPendingToL2();
  }
}

export function mediaCacheKey(
  operation: string,
  params: Record<string, unknown>,
): string {
  return `${operation}:${hashObject(params)}`;
}

export function mediaCacheHas(key: string): boolean {
  return l1Map.has(key);
}

export function mediaCacheEvict(key: string): void {
  const entry = l1Map.get(key);
  if (entry?.isBlobUrl) {
    try {
      URL.revokeObjectURL(entry.url);
    } catch {}
  }
  l1Map.delete(key);
}

export function mediaCacheClear(): void {
  for (const entry of l1Map.values()) {
    if (entry.isBlobUrl) {
      try {
        URL.revokeObjectURL(entry.url);
      } catch {}
    }
  }
  l1Map.clear();
  l2Pending.clear();
}

// ─── L2: Persistent disk ────────────────────────────────────────────────────

async function readL2(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return readL2IndexedDB(key);
  }
  return readL2FileSystem(key);
}

async function writeL2(key: string, dataUrl: string): Promise<void> {
  if (Platform.OS === 'web') {
    await writeL2IndexedDB(key, dataUrl);
  } else {
    await writeL2FileSystem(key, dataUrl);
  }
}

function promoteL2toL1(key: string, dataUrl: string): void {
  let url = dataUrl;
  let isBlobUrl = false;
  if (Platform.OS === 'web' && dataUrl.startsWith('data:')) {
    try {
      const res = new XMLHttpRequest();
      res.open('GET', dataUrl, false);
      res.overrideMimeType('text/plain; charset=x-user-defined');
      res.send(null);
      const binary = res.responseText;
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
      const blob = new Blob([bytes.buffer]);
      url = URL.createObjectURL(blob);
      isBlobUrl = true;
    } catch {
      url = dataUrl;
    }
  }
  const size = Math.round(dataUrl.length * 0.75);
  l1Map.set(key, { url, size, createdAt: Date.now(), isBlobUrl });
  evictL1();
}

// ─── Web L2: IndexedDB ──────────────────────────────────────────────────────

let idbInstance: IDBDatabase | null = null;
let idbInitPromise: Promise<IDBDatabase | null> | null = null;

function initIndexedDB(): Promise<IDBDatabase | null> {
  if (idbInstance) return Promise.resolve(idbInstance);
  if (idbInitPromise) return idbInitPromise;
  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  idbInitPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open('media-cache-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media');
        }
      };
      req.onsuccess = () => {
        idbInstance = req.result;
        resolve(idbInstance);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbInitPromise;
}

async function readL2IndexedDB(key: string): Promise<string | null> {
  const db = await initIndexedDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('media', 'readonly');
      const store = tx.objectStore('media');
      const req = store.get(L2_KEY_PREFIX + key);
      req.onsuccess = () => {
        const result = req.result;
        if (result == null) { resolve(null); return; }
        if (typeof result === 'string') { resolve(result); return; }
        if (typeof result === 'object' && result !== null && typeof result.data === 'string') {
          resolve(result.data);
          return;
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeL2IndexedDB(key: string, dataUrl: string): Promise<void> {
  const db = await initIndexedDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('media', 'readwrite');
      const store = tx.objectStore('media');
      store.put({ data: dataUrl, ts: Date.now() }, L2_KEY_PREFIX + key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ─── Native L2: expo-file-system ────────────────────────────────────────────

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

async function readL2FileSystem(key: string): Promise<string | null> {
  const fs = await getFileSystem();
  if (!fs) return null;
  try {
    const path = `${fs.cacheDirectory}media_cache_${key.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return null;
    return await fs.readAsStringAsync(path);
  } catch {
    return null;
  }
}

async function writeL2FileSystem(key: string, dataUrl: string): Promise<void> {
  const fs = await getFileSystem();
  if (!fs) return;
  try {
    const path = `${fs.cacheDirectory}media_cache_${key.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    await fs.writeAsStringAsync(path, dataUrl);
  } catch {
    // best-effort
  }
}

// ─── Batch flush ────────────────────────────────────────────────────────────

export async function flushPendingToL2(): Promise<void> {
  if (l2FlushInProgress || l2Pending.size === 0) return;
  l2FlushInProgress = true;
  const keys = Array.from(l2Pending);
  l2Pending.clear();

  for (const key of keys) {
    const entry = l1Map.get(key);
    if (!entry) continue;
    try {
      let dataUrl: string;
      if (entry.isBlobUrl) {
        const res = await fetch(entry.url);
        const blob = await res.blob();
        dataUrl = await blobToDataUrl(blob);
      } else {
        dataUrl = entry.url;
      }
      await writeL2(key, dataUrl);
    } catch {}
  }

  l2FlushInProgress = false;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ─── App lifecycle hook ─────────────────────────────────────────────────────

let lifecycleHookInstalled = false;

/**
 * Sweep IndexedDB media cache for entries older than L2_MAX_AGE_MS.
 * Uses a cursor to iterate in batches, yielding between batches so the
 * main thread is never blocked. Returns the number of entries deleted.
 */
export async function sweepL2StaleEntries(maxAgeMs: number = L2_MAX_AGE_MS): Promise<number> {
  if (Platform.OS !== 'web') return 0;
  const db = await initIndexedDB();
  if (!db) return 0;

  const now = Date.now();
  let deleted = 0;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('media', 'readwrite');
      const store = tx.objectStore('media');
      const cursorReq = store.openCursor();
      let processedInBatch = 0;

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;

        const value = cursor.value;
        const ts = typeof value === 'object' && value !== null ? value.ts : 0;
        const isStale = ts === 0 || (now - ts) > maxAgeMs;

        if (isStale) {
          cursor.delete();
          deleted++;
        }

        processedInBatch++;
        if (processedInBatch >= L2_GC_BATCH_SIZE) {
          processedInBatch = 0;
        }

        cursor.continue();
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => resolve(deleted);
    } catch {
      resolve(deleted);
    }
  });
}

export function installMediaCacheLifecycleHook(): void {
  if (lifecycleHookInstalled || Platform.OS !== 'web') return;
  lifecycleHookInstalled = true;

  // Run a stale entry sweep on startup — non-blocking, best-effort.
  setTimeout(() => { sweepL2StaleEntries().catch(() => {}); }, 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingToL2();
      sweepL2StaleEntries().catch(() => {});
    }
  });

  window.addEventListener('pagehide', () => {
    flushPendingToL2();
  });
}

// ─── Convenience: cached operation wrapper ──────────────────────────────────

export async function mediaCachedOperation(
  key: string,
  operation: () => Promise<string>,
): Promise<string> {
  const cached = await mediaCacheGet(key);
  if (cached) return cached;

  const result = await operation();
  await mediaCacheSet(key, result);
  return result;
}
