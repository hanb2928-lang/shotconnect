/**
 * Tests for boot-time orphan sweeper.
 * Verifies that the sweeper scans storage directly (not the in-memory
 * registry) and removes entries older than the staleness threshold.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/lib/errorLogger', () => ({
  addBreadcrumb: jest.fn(),
  logError: jest.fn(),
}));

const localStorageMock = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
    key: jest.fn((i: number) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

import { runBootSweep, BOOT_SWEEP_AGE_MS } from '@/lib/bootSweeper';

function setLocalStorageEntry(key: string, data: unknown, timestamp: number): void {
  (window as any).localStorage.setItem(key, JSON.stringify({ data, timestamp }));
}

describe('bootSweeper', () => {
  beforeEach(() => {
    (window as any).localStorage.clear();
    jest.clearAllMocks();
  });

  describe('BOOT_SWEEP_AGE_MS', () => {
    it('is 24 hours', () => {
      expect(BOOT_SWEEP_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('runBootSweep — localStorage', () => {
    it('removes cache: entries older than 24h', async () => {
      const oldTime = Date.now() - 25 * 60 * 60 * 1000;
      setLocalStorageEntry('cache:old-entry', { foo: 'bar' }, oldTime);

      const result = await runBootSweep();

      expect(result.localStorageRemoved).toBe(1);
      expect(localStorage.getItem('cache:old-entry')).toBeNull();
    });

    it('keeps cache: entries newer than 24h', async () => {
      const recentTime = Date.now() - 1 * 60 * 60 * 1000;
      setLocalStorageEntry('cache:fresh-entry', { foo: 'bar' }, recentTime);

      const result = await runBootSweep();

      expect(result.localStorageRemoved).toBe(0);
      expect(localStorage.getItem('cache:fresh-entry')).not.toBeNull();
    });

    it('removes cache: entries with missing timestamp', async () => {
      (window as any).localStorage.setItem('cache:broken', JSON.stringify({ data: 'no-timestamp' }));

      const result = await runBootSweep();

      expect(result.localStorageRemoved).toBe(1);
      expect(localStorage.getItem('cache:broken')).toBeNull();
    });

    it('removes cache: entries with unparseable JSON', async () => {
      (window as any).localStorage.setItem('cache:corrupt', 'not-json');

      const result = await runBootSweep();

      expect(result.localStorageRemoved).toBe(1);
      expect(localStorage.getItem('cache:corrupt')).toBeNull();
    });

    it('does not touch non-cache: keys', async () => {
      const oldTime = Date.now() - 25 * 60 * 60 * 1000;
      setLocalStorageEntry('user-prefs', { theme: 'dark' }, oldTime);

      const result = await runBootSweep();

      expect(result.localStorageRemoved).toBe(0);
      expect(localStorage.getItem('user-prefs')).not.toBeNull();
    });

    it('handles empty localStorage', async () => {
      const result = await runBootSweep();
      expect(result.localStorageRemoved).toBe(0);
    });

    it('removes multiple stale entries in one sweep', async () => {
      const oldTime = Date.now() - 30 * 60 * 60 * 1000;
      setLocalStorageEntry('cache:a', 1, oldTime);
      setLocalStorageEntry('cache:b', 2, oldTime);
      setLocalStorageEntry('cache:c', 3, oldTime);

      const result = await runBootSweep();

      expect(result.localStorageRemoved).toBe(3);
    });
  });

  describe('runBootSweep — result shape', () => {
    it('returns a result with all fields', async () => {
      const result = await runBootSweep();

      expect(result).toHaveProperty('localStorageRemoved');
      expect(result).toHaveProperty('indexedDBRemoved');
      expect(result).toHaveProperty('nativeTempRemoved');
      expect(result).toHaveProperty('errors');
      expect(typeof result.localStorageRemoved).toBe('number');
      expect(typeof result.errors).toBe('number');
    });
  });

  describe('runBootSweep — custom maxAge', () => {
    it('respects a custom maxAgeMs threshold', async () => {
      const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
      setLocalStorageEntry('cache:1h-old', 'data', oneHourAgo);

      const result24h = await runBootSweep(24 * 60 * 60 * 1000);
      expect(result24h.localStorageRemoved).toBe(0);

      const result30m = await runBootSweep(30 * 60 * 1000);
      expect(result30m.localStorageRemoved).toBe(1);
    });
  });

  describe('runBootSweep — logging', () => {
    it('logs a breadcrumb when entries are removed', async () => {
      const { addBreadcrumb } = require('@/lib/errorLogger');
      const oldTime = Date.now() - 25 * 60 * 60 * 1000;
      setLocalStorageEntry('cache:stale', 'data', oldTime);

      await runBootSweep();

      expect(addBreadcrumb).toHaveBeenCalledWith(
        'bootSweeper',
        expect.stringContaining('Boot sweep removed'),
        'warning',
      );
    });

    it('does not log when nothing was removed', async () => {
      const { addBreadcrumb } = require('@/lib/errorLogger');
      await runBootSweep();
      expect(addBreadcrumb).not.toHaveBeenCalled();
    });
  });
});
