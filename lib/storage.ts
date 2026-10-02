import { Platform } from 'react-native';

type Setter = (key: string, value: string) => Promise<void> | void;
type Getter = (key: string) => Promise<string | null> | string | null;
type Remover = (key: string) => Promise<void> | void;
type AllKeysGetter = () => Promise<readonly string[]> | readonly string[];

let webStorage: Storage | null = null;
let nativeGetItem: Getter | null = null;
let nativeSetItem: Setter | null = null;
let nativeRemoveItem: Remover | null = null;
let nativeGetAllKeys: AllKeysGetter | null = null;
let initPromise: Promise<void> | null = null;
let initDone = false;
let initAttempted = false;

// In-memory fallback used when both localStorage and AsyncStorage are
// unavailable (private browsing, sandboxed iframe, native bridge failure).
const memoryStore = new Map<string, string>();

// Write-through read cache: every successful read or write populates this
// map so subsequent reads are O(1) synchronous lookups with no I/O.
// This eliminates the async round-trip that caused perceptible delays
// on app boot when multiple consumers read settings sequentially.
const readCache = new Map<string, string>();

export function isStorageReady(): boolean {
  return initDone;
}

const STORAGE_INIT_TIMEOUT_MS = 3000;

// Lazy-load AsyncStorage so module-eval never touches the native binding.
async function loadAsyncStorage(): Promise<typeof import('@react-native-async-storage/async-storage') | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), STORAGE_INIT_TIMEOUT_MS),
    );
    const mod = await Promise.race([
      import('@react-native-async-storage/async-storage'),
      timeout,
    ]);
    return mod;
  } catch {
    return null;
  }
}

export function initStorage(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          webStorage = window.localStorage;
          // Warm the read cache with all existing localStorage entries.
          // This makes the first read of any previously-stored key instant.
          for (let i = 0; i < webStorage.length; i++) {
            const k = webStorage.key(i);
            if (!k) continue;
            try {
              const v = webStorage.getItem(k);
              if (v !== null) readCache.set(k, v);
            } catch {}
          }
        }
      } catch {
        // localStorage access can throw in private browsing or restricted contexts
      }
      initDone = true;
      initAttempted = true;
      return;
    }

    try {
      const AsyncStorage = await loadAsyncStorage();
      if (AsyncStorage?.default) {
        const impl = AsyncStorage.default;
        if (typeof impl.getItem === 'function') nativeGetItem = (key: string) => impl.getItem(key);
        if (typeof impl.setItem === 'function') nativeSetItem = (key: string, value: string) => impl.setItem(key, value);
        if (typeof impl.removeItem === 'function') nativeRemoveItem = (key: string) => impl.removeItem(key);
        if (typeof impl.getAllKeys === 'function') nativeGetAllKeys = () => impl.getAllKeys();

        // Warm the read cache by bulk-reading all persisted keys.
        // AsyncStorage.multiGet is a single native bridge call — much
        // faster than N sequential getItem calls for boot-time hydration.
        if (typeof impl.multiGet === 'function') {
          try {
            const allKeys = await impl.getAllKeys();
            if (allKeys && allKeys.length > 0) {
              const pairs = await impl.multiGet(allKeys as readonly string[]);
              for (const [k, v] of pairs) {
                if (v !== null) readCache.set(k, v);
              }
            }
          } catch {
            // multiGet failed — reads will populate cache lazily
          }
        }
      }
    } catch {
      // AsyncStorage not available — getItem/setItem will return null/no-op
    }
    initDone = true;
    initAttempted = true;
  })().catch(() => {
    initDone = true;
    initAttempted = true;
  });

  setTimeout(() => {
    if (!initDone) {
      initDone = true;
      initAttempted = true;
    }
  }, STORAGE_INIT_TIMEOUT_MS + 500);

  return initPromise;
}

/**
 * Synchronous read from the in-memory read cache.
 * Returns null if the key is not cached or storage hasn't initialized yet.
 * Use this for hot-path consumers (theme, language, mascot settings) that
 * need values during the first render frame without awaiting a Promise.
 */
export function getItemSync(key: string): string | null {
  return readCache.get(key) ?? null;
}

export async function getItem(key: string): Promise<string | null> {
  // Fast path: value already in read cache — no I/O needed.
  const cached = readCache.get(key);
  if (cached !== undefined) return cached;

  try {
    if (initPromise) {
      await Promise.race([
        initPromise,
        new Promise<void>((resolve) => setTimeout(resolve, STORAGE_INIT_TIMEOUT_MS + 1000)),
      ]);
    } else if (!initDone) {
      await initStorage();
    }
  } catch {
    // init failed or timed out — proceed with fallback
  }

  // Check cache again after init (init may have warmed it).
  const cachedAfterInit = readCache.get(key);
  if (cachedAfterInit !== undefined) return cachedAfterInit;

  if (webStorage) {
    try {
      const val = webStorage.getItem(key);
      if (val !== null) readCache.set(key, val);
      return val;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }
  if (nativeGetItem) {
    try {
      const val = await nativeGetItem(key);
      if (val !== null) readCache.set(key, val);
      return val;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }

  const memVal = memoryStore.get(key);
  if (memVal !== undefined) {
    readCache.set(key, memVal);
    return memVal;
  }
  return null;
}

export async function setItem(key: string, value: string): Promise<void> {
  // Write-through: update the read cache immediately so the next
  // sync or async read sees the new value without I/O.
  readCache.set(key, value);

  try {
    if (initPromise) {
      await Promise.race([
        initPromise,
        new Promise<void>((resolve) => setTimeout(resolve, STORAGE_INIT_TIMEOUT_MS + 1000)),
      ]);
    } else if (!initDone) {
      await initStorage();
    }
  } catch {
    // init failed or timed out — proceed with fallback
  }

  if (webStorage) {
    try {
      webStorage.setItem(key, value);
    } catch {
      try {
        evictOldestCacheEntries();
        webStorage.setItem(key, value);
      } catch {
        memoryStore.set(key, value);
      }
    }
    return;
  }
  if (nativeSetItem) {
    try {
      await nativeSetItem(key, value);
    } catch {
      try {
        await evictOldestCacheEntriesNative();
        await nativeSetItem(key, value);
      } catch {
        memoryStore.set(key, value);
      }
    }
    return;
  }
  memoryStore.set(key, value);
}

export async function removeItem(key: string): Promise<void> {
  readCache.delete(key);

  try {
    if (initPromise) {
      await Promise.race([
        initPromise,
        new Promise<void>((resolve) => setTimeout(resolve, STORAGE_INIT_TIMEOUT_MS + 1000)),
      ]);
    } else if (!initDone) {
      await initStorage();
    }
  } catch {
    // init failed or timed out — proceed with fallback
  }

  if (webStorage) {
    try {
      webStorage.removeItem(key);
    } catch {
      memoryStore.delete(key);
    }
    return;
  }
  if (nativeRemoveItem) {
    try {
      await nativeRemoveItem(key);
    } catch {
      memoryStore.delete(key);
    }
    return;
  }
  memoryStore.delete(key);
}

function evictOldestCacheEntries(): void {
  if (webStorage) {
    const entries: { key: string; timestamp: number }[] = [];
    for (let i = 0; i < webStorage.length; i++) {
      const k = webStorage.key(i);
      if (!k || !k.startsWith('cache:')) continue;
      try {
        const raw = webStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        entries.push({ key: k, timestamp: parsed?.timestamp ?? 0 });
      } catch {
        entries.push({ key: k, timestamp: 0 });
      }
    }
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = Math.max(1, Math.ceil(entries.length / 4));
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      try {
        webStorage.removeItem(entries[i].key);
        readCache.delete(entries[i].key);
      } catch {}
    }
  }
}

async function evictOldestCacheEntriesNative(): Promise<void> {
  if (!nativeGetAllKeys || !nativeRemoveItem) return;
  try {
    const allKeys = await nativeGetAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith('cache:'));
    const entries: { key: string; timestamp: number }[] = [];
    for (const k of cacheKeys) {
      try {
        const raw = await getItem(k);
        if (!raw) { entries.push({ key: k, timestamp: 0 }); continue; }
        const parsed = JSON.parse(raw);
        entries.push({ key: k, timestamp: parsed?.timestamp ?? 0 });
      } catch {
        entries.push({ key: k, timestamp: 0 });
      }
    }
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = Math.max(1, Math.ceil(entries.length / 4));
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      try {
        await nativeRemoveItem(entries[i].key);
        readCache.delete(entries[i].key);
      } catch {}
    }
  } catch {}
}
