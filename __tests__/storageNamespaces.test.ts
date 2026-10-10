jest.mock('@/lib/errorLogger', () => ({
  addBreadcrumb: jest.fn(),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
})();

(Object as any).defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
  configurable: true,
});

import {
  registerAllNamespaces,
  getRegisteredNamespaces,
  isTransientPrefix,
  getTtlForPrefix,
  runStorageGC,
  NAMESPACES,
} from '@/lib/storageNamespaces';

describe('storageNamespaces', () => {
  beforeEach(() => {
    registerAllNamespaces();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('namespace registry', () => {
    it('registers all namespaces', () => {
      const specs = getRegisteredNamespaces();
      expect(specs.length).toBeGreaterThanOrEqual(15);
    });

    it('separates setting and transient tiers', () => {
      const settings = getRegisteredNamespaces().filter((s) => s.tier === 'setting');
      const transients = getRegisteredNamespaces().filter((s) => s.tier === 'transient');
      expect(settings.length).toBeGreaterThan(0);
      expect(transients.length).toBeGreaterThan(0);
    });

    it('all transient namespaces have finite TTL', () => {
      const transients = getRegisteredNamespaces().filter((s) => s.tier === 'transient');
      for (const spec of transients) {
        expect(spec.ttlMs).toBeLessThan(Infinity);
        expect(spec.ttlMs).toBeGreaterThan(0);
      }
    });

    it('all setting namespaces have infinite TTL', () => {
      const settings = getRegisteredNamespaces().filter((s) => s.tier === 'setting');
      for (const spec of settings) {
        expect(spec.ttlMs).toBe(Infinity);
      }
    });
  });

  describe('isTransientPrefix', () => {
    it('returns true for transient keys', () => {
      expect(isTransientPrefix('draft:abc123')).toBe(true);
      expect(isTransientPrefix('cache:some-key')).toBe(true);
      expect(isTransientPrefix('share_history')).toBe(true);
    });

    it('returns false for setting keys', () => {
      expect(isTransientPrefix('theme_mode')).toBe(false);
      expect(isTransientPrefix('display_density')).toBe(false);
    });

    it('returns false for unknown keys', () => {
      expect(isTransientPrefix('unknown_key')).toBe(false);
    });
  });

  describe('getTtlForPrefix', () => {
    it('returns TTL for known prefixes', () => {
      expect(getTtlForPrefix('draft:abc')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(getTtlForPrefix('cache:xyz')).toBe(5 * 60 * 1000);
    });

    it('returns null for unknown prefixes', () => {
      expect(getTtlForPrefix('unknown_key')).toBeNull();
    });
  });

  describe('runStorageGC', () => {
    it('removes expired transient entries', async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      window.localStorage.setItem(
        'cache:old-entry',
        JSON.stringify({ data: 'test', timestamp: oldTime }),
      );
      window.localStorage.setItem(
        'cache:fresh-entry',
        JSON.stringify({ data: 'test', timestamp: Date.now() }),
      );

      const result = await runStorageGC();

      expect(result.removed).toBeGreaterThanOrEqual(1);
      expect(window.localStorage.getItem('cache:old-entry')).toBeNull();
      expect(window.localStorage.getItem('cache:fresh-entry')).not.toBeNull();
    });

    it('does not remove setting keys', async () => {
      window.localStorage.setItem('theme_mode', 'dark');
      window.localStorage.setItem('display_density', 'compact');

      await runStorageGC();

      expect(window.localStorage.getItem('theme_mode')).toBe('dark');
      expect(window.localStorage.getItem('display_density')).toBe('compact');
    });

    it('removes entries with no timestamp (corrupted)', async () => {
      window.localStorage.setItem('cache:no-ts', 'not-json');

      const result = await runStorageGC();

      expect(result.removed).toBeGreaterThanOrEqual(1);
      expect(window.localStorage.getItem('cache:no-ts')).toBeNull();
    });

    it('removes expired draft entries', async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;
      window.localStorage.setItem(
        'draft:old-draft',
        JSON.stringify({ id: 'old-draft', updatedAt: oldTime }),
      );

      await runStorageGC();

      expect(window.localStorage.getItem('draft:old-draft')).toBeNull();
    });

    it('keeps fresh draft entries', async () => {
      window.localStorage.setItem(
        'draft:fresh-draft',
        JSON.stringify({ id: 'fresh-draft', updatedAt: Date.now() }),
      );

      await runStorageGC();

      expect(window.localStorage.getItem('draft:fresh-draft')).not.toBeNull();
    });

    it('reports scanned and removed counts', async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;
      window.localStorage.setItem(
        'cache:old1',
        JSON.stringify({ data: 'a', timestamp: oldTime }),
      );
      window.localStorage.setItem(
        'cache:old2',
        JSON.stringify({ data: 'b', timestamp: oldTime }),
      );

      const result = await runStorageGC();

      expect(result.scanned).toBeGreaterThanOrEqual(2);
      expect(result.removed).toBeGreaterThanOrEqual(2);
      expect(result.namespacesAffected).toContain('cache:');
    });

    it('handles empty storage gracefully', async () => {
      const result = await runStorageGC();
      expect(result.scanned).toBe(0);
      expect(result.removed).toBe(0);
    });
  });

  describe('NAMESPACES constants', () => {
    it('exports a frozen set of namespace specs', () => {
      expect(NAMESPACES.TRANSIENT_DRAFT.prefix).toBe('draft:');
      expect(NAMESPACES.TRANSIENT_DRAFT.tier).toBe('transient');
      expect(NAMESPACES.SETTING_THEME.prefix).toBe('theme_');
      expect(NAMESPACES.SETTING_THEME.tier).toBe('setting');
    });
  });
});
