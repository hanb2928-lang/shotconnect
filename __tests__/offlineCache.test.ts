import { getCached, setCached, getStaleCached, fetchWithCache, sweepStaleOfflineCache } from '@/lib/offlineCache';

const mockStorage = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    mockStorage.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

describe('offlineCache', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe('setCached / getCached', () => {
    it('데이터를 저장하고 조회한다', async () => {
      await setCached('test_key', { name: 'test' });
      const result = await getCached<{ name: string }>('test_key');
      expect(result).toEqual({ name: 'test' });
    });

    it('저장되지 않은 키는 null을 반환한다', async () => {
      const result = await getCached('nonexistent');
      expect(result).toBeNull();
    });

    it('TTL이 만료되면 null을 반환한다', async () => {
      await setCached('expired_key', { data: 'old' });
      const entry = mockStorage.get('cache:expired_key');
      if (entry) {
        const parsed = JSON.parse(entry);
        parsed.timestamp = Date.now() - 10 * 60 * 1000;
        mockStorage.set('cache:expired_key', JSON.stringify(parsed));
      }
      const result = await getCached('expired_key');
      expect(result).toBeNull();
    });
  });

  describe('getStaleCached', () => {
    it('TTL이 만료되어도 데이터를 반환한다', async () => {
      await setCached('stale_key', { data: 'old' });
      const entry = mockStorage.get('cache:stale_key');
      if (entry) {
        const parsed = JSON.parse(entry);
        parsed.timestamp = Date.now() - 10 * 60 * 1000;
        mockStorage.set('cache:stale_key', JSON.stringify(parsed));
      }
      const result = await getStaleCached<{ data: string }>('stale_key');
      expect(result).toEqual({ data: 'old' });
    });
  });

  describe('fetchWithCache', () => {
    it('캐시가 있으면 fetcher를 호출하지 않는다', async () => {
      await setCached('fwc_key', { value: 42 });
      const fetcher = jest.fn().mockResolvedValue({ value: 99 });
      const result = await fetchWithCache('fwc_key', fetcher);
      expect(result).toEqual({ value: 42 });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('캐시가 없으면 fetcher를 호출하고 캐싱한다', async () => {
      const fetcher = jest.fn().mockResolvedValue({ value: 99 });
      const result = await fetchWithCache('no_cache_key', fetcher);
      expect(result).toEqual({ value: 99 });
      expect(fetcher).toHaveBeenCalled();

      const cached = await getCached<{ value: number }>('no_cache_key');
      expect(cached).toEqual({ value: 99 });
    });
  });

  describe('sweepStaleOfflineCache', () => {
    beforeEach(() => {
      mockStorage.clear();
      // Set up a mock localStorage for the web sweep path
      const localStorageMock = (() => {
        const store = new Map<string, string>();
        return {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => { store.set(key, value); },
          removeItem: (key: string) => { store.delete(key); },
          clear: () => store.clear(),
          get length() { return store.size; },
          key: (index: number) => Array.from(store.keys())[index] ?? null,
        };
      })();
      Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        writable: true,
        configurable: true,
      });
    });

    it('7일 이상 지난 cache: 항목을 삭제한다', async () => {
      const oldTs = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
      const freshTs = Date.now();

      window.localStorage.setItem('cache:old1', JSON.stringify({ data: 'a', timestamp: oldTs }));
      window.localStorage.setItem('cache:old2', JSON.stringify({ data: 'b', timestamp: oldTs }));
      window.localStorage.setItem('cache:fresh', JSON.stringify({ data: 'c', timestamp: freshTs }));
      window.localStorage.setItem('non-cache-key', JSON.stringify({ data: 'd', timestamp: oldTs }));

      const removed = await sweepStaleOfflineCache();

      expect(removed).toBe(2);
      expect(window.localStorage.getItem('cache:old1')).toBeNull();
      expect(window.localStorage.getItem('cache:old2')).toBeNull();
      expect(window.localStorage.getItem('cache:fresh')).not.toBeNull();
      expect(window.localStorage.getItem('non-cache-key')).not.toBeNull();
    });

    it('타임스탬프가 없는 고아 항목도 삭제한다', async () => {
      window.localStorage.setItem('cache:orphan', 'not-json');
      window.localStorage.setItem('cache:no-ts', JSON.stringify({ data: 'x' }));

      const removed = await sweepStaleOfflineCache();

      expect(removed).toBe(2);
      expect(window.localStorage.getItem('cache:orphan')).toBeNull();
      expect(window.localStorage.getItem('cache:no-ts')).toBeNull();
    });

    it('cache: 접두사가 없는 항목은 건드리지 않는다', async () => {
      const oldTs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      window.localStorage.setItem('settings:theme', JSON.stringify({ data: 'dark', timestamp: oldTs }));
      window.localStorage.setItem('user:token', JSON.stringify({ data: 'abc', timestamp: oldTs }));

      const removed = await sweepStaleOfflineCache();

      expect(removed).toBe(0);
      expect(window.localStorage.getItem('settings:theme')).not.toBeNull();
      expect(window.localStorage.getItem('user:token')).not.toBeNull();
    });

    it('localStorage를 사용할 수 없으면 0을 반환한다', async () => {
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const removed = await sweepStaleOfflineCache();
      expect(removed).toBe(0);
    });

    it('커스텀 maxAgeMs를 적용한다', async () => {
      const ts = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      window.localStorage.setItem('cache:recent', JSON.stringify({ data: 'a', timestamp: ts }));

      const removed = await sweepStaleOfflineCache(60_000); // 1 min threshold

      expect(removed).toBe(1);
      expect(window.localStorage.getItem('cache:recent')).toBeNull();
    });
  });
});
