import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export function initStorage(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        webStorage = window.localStorage;
      }
      initDone = true;
      return;
    }

    try {
      nativeGetItem = (key: string) => AsyncStorage.getItem(key);
      nativeSetItem = (key: string, value: string) => AsyncStorage.setItem(key, value);
      nativeRemoveItem = (key: string) => AsyncStorage.removeItem(key);
      nativeGetAllKeys = () => AsyncStorage.getAllKeys();
    } catch {
      // AsyncStorage not available — getItem/setItem will return null/no-op
    }
    initDone = true;
  })();

  return initPromise;
}

export async function getItem(key: string): Promise<string | null> {
  if (!initDone) {
    await initStorage();
  }

  if (webStorage) {
    try {
      return webStorage.getItem(key);
    } catch {
      return null;
    }
  }
  if (nativeGetItem) {
    try {
      return await nativeGetItem(key);
    } catch {
      return null;
    }
  }
  return null;
}

export async function setItem(key: string, value: string): Promise<void> {
  if (!initDone) {
    await initStorage();
  }

  if (webStorage) {
    try {
      webStorage.setItem(key, value);
    } catch {
      try {
        evictOldestCacheEntries();
        webStorage.setItem(key, value);
      } catch {
        // storage full even after eviction — give up silently
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
        // storage full even after eviction — give up silently
      }
    }
  }
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
      try { webStorage.removeItem(entries[i].key); } catch {}
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
      try { await nativeRemoveItem(entries[i].key); } catch {}
    }
  } catch {}
}
