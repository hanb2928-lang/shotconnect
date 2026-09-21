import { aiCacheGet, aiCacheSet, buildCacheKey, aiCachedCall } from '@/lib/aiCache';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      upsert: jest.fn(() => Promise.resolve({ error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

jest.mock('@/lib/offlineCache', () => ({
  getCached: jest.fn(() => Promise.resolve(null)),
  setCached: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/contentHash', () => ({
  hashObject: jest.fn(() => 'abc123def456'),
}));

describe('aiCache', () => {
  it('buildCacheKey combines taskType and hash', () => {
    expect(buildCacheKey('test', 'hash123')).toBe('test:hash123');
  });

  it('aiCacheGet returns null on cache miss', async () => {
    const result = await aiCacheGet('test', 'hash123');
    expect(result).toBeNull();
  });

  it('aiCacheSet stores data without error', async () => {
    await expect(aiCacheSet('test', 'hash123', { foo: 'bar' }, 'gpt-4o')).resolves.toBeUndefined();
  });

  it('aiCachedCall calls fetcher on miss and caches result', async () => {
    const fetcher = jest.fn(() => Promise.resolve({ value: 42 }));
    const { data, cached } = await aiCachedCall('test', { input: 'x' }, fetcher, 'local');
    expect(data).toEqual({ value: 42 });
    expect(cached).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aiCachedCall returns cached data on hit without calling fetcher', async () => {
    const { getCached } = require('@/lib/offlineCache');
    (getCached as jest.Mock).mockResolvedValueOnce({ value: 99 });

    const fetcher = jest.fn(() => Promise.resolve({ value: 42 }));
    const { data, cached } = await aiCachedCall('test', { input: 'x' }, fetcher, 'local');
    expect(data).toEqual({ value: 99 });
    expect(cached).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
