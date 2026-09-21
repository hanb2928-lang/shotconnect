import { getCached, setCached, getStaleCached, fetchWithCache } from '@/lib/offlineCache';

const mockStorage = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
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
});
