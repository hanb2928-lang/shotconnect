import { getItem, setItem, removeItem } from '@/lib/storage';
import { Platform } from 'react-native';

const CACHE_PREFIX = 'cache:';
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

export async function getStaleCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return entry.data;
  } catch {
    return null;
  }
}

export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached) return cached;

  const fresh = await fetcher();
  await setCached(key, fresh);
  return fresh;
}

/**
 * Sweep LocalStorage / AsyncStorage for `cache:` prefixed entries older
 * than STALE_CACHE_MAX_AGE_MS (7 days). Removes orphaned cache entries
 * left behind by previous sessions that are no longer fresh enough to
 * serve but still occupy storage space.
 *
 * Returns the number of entries removed.
 */
export async function sweepStaleOfflineCache(
  maxAgeMs: number = STALE_CACHE_MAX_AGE_MS,
): Promise<number> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.localStorage) return 0;
    const now = Date.now();
    let removed = 0;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || !k.startsWith(CACHE_PREFIX)) continue;
        try {
          const raw = window.localStorage.getItem(k);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as CacheEntry<unknown>;
          if (now - (parsed.timestamp ?? 0) > maxAgeMs) {
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
    } catch {
      // localStorage access can throw in restricted contexts
    }
    return removed;
  }

  // Native: AsyncStorage overflow eviction is already handled by storage.ts
  // (evictOldestCacheEntriesNative) on write failures, so no separate sweep needed.
  return 0;
}
