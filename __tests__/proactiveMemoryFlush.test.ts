/**
 * Tests for proactive memory flush guard.
 * Verifies that flush handlers are invoked when memory pressure
 * escalates, throttling works, and the guard integrates with
 * devicePerformance pressure listeners.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/lib/errorLogger', () => ({
  addBreadcrumb: jest.fn(),
  logWarning: jest.fn(),
}));

jest.mock('@/lib/devicePerformance', () => ({
  onMemoryPressureChange: jest.fn((cb: (l: 'none' | 'moderate' | 'severe') => void) => {
    (global as any).__pressureCb = cb;
    return () => { delete (global as any).__pressureCb; };
  }),
  getMemoryPressure: jest.fn(() => 'none' as const),
  isMobileWebView: jest.fn(() => true),
}));

import {
  registerFlushHandler,
  runProactiveFlush,
  installProactiveMemoryFlush,
  isProactiveFlushAvailable,
  getHeapUsageRatio,
  wasRecentlyFlushed,
  _resetForTesting,
} from '@/lib/proactiveMemoryFlush';

describe('proactiveMemoryFlush', () => {
  beforeEach(() => {
    _resetForTesting();
    jest.clearAllMocks();
  });

  describe('registerFlushHandler', () => {
    it('registers a handler that runs during flush', async () => {
      const handler = jest.fn();
      registerFlushHandler('test', handler);

      await runProactiveFlush(true);

      expect(handler).toHaveBeenCalled();
    });

    it('registers multiple handlers that all run', async () => {
      const h1 = jest.fn();
      const h2 = jest.fn();
      registerFlushHandler('h1', h1);
      registerFlushHandler('h2', h2);

      await runProactiveFlush(true);

      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });
  });

  describe('runProactiveFlush', () => {
    it('returns flushed=true when handlers ran', async () => {
      registerFlushHandler('test', () => {});
      const result = await runProactiveFlush(true);
      expect(result.flushed).toBe(true);
      expect(result.actions).toContain('test');
    });

    it('returns flushed=false when no handlers registered', async () => {
      const result = await runProactiveFlush(true);
      expect(result.flushed).toBe(false);
      expect(result.actions).toEqual([]);
    });

    it('continues if a handler throws', async () => {
      const goodHandler = jest.fn();
      registerFlushHandler('bad', () => { throw new Error('boom'); });
      registerFlushHandler('good', goodHandler);

      const result = await runProactiveFlush(true);

      expect(result.actions).toContain('good');
      expect(result.actions).not.toContain('bad');
    });

    it('supports async handlers', async () => {
      let resolved = false;
      registerFlushHandler('async', async () => {
        await new Promise<void>((r) => setTimeout(r, 10));
        resolved = true;
      });

      await runProactiveFlush(true);
      expect(resolved).toBe(true);
    });

    it('throttles repeated calls within min interval', async () => {
      registerFlushHandler('test', () => {});
      const r1 = await runProactiveFlush(true);
      expect(r1.flushed).toBe(true);

      const r2 = await runProactiveFlush(false);
      expect(r2.flushed).toBe(false);
    });

    it('force bypasses throttling', async () => {
      registerFlushHandler('test', () => {});
      await runProactiveFlush(true);
      const r2 = await runProactiveFlush(true);
      expect(r2.flushed).toBe(true);
    });

    it('deduplicates concurrent flush calls', async () => {
      const handler = jest.fn(async () => {
        await new Promise<void>((r) => setTimeout(r, 20));
      });
      registerFlushHandler('slow', handler);

      const [a, b] = await Promise.all([
        runProactiveFlush(true),
        runProactiveFlush(true),
      ]);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
    });
  });

  describe('installProactiveMemoryFlush', () => {
    it('subscribes to pressure change listener', () => {
      const { onMemoryPressureChange } = require('@/lib/devicePerformance');
      installProactiveMemoryFlush();
      expect(onMemoryPressureChange).toHaveBeenCalled();
    });

    it('returns an uninstall function', () => {
      const unsub = installProactiveMemoryFlush();
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('does not double-install', () => {
      const { onMemoryPressureChange } = require('@/lib/devicePerformance');
      onMemoryPressureChange.mockClear();
      installProactiveMemoryFlush();
      installProactiveMemoryFlush();
      expect(onMemoryPressureChange).toHaveBeenCalledTimes(1);
    });

    it('triggers flush when pressure escalates to moderate', async () => {
      const { onMemoryPressureChange, getMemoryPressure } = require('@/lib/devicePerformance');
      getMemoryPressure.mockReturnValue('moderate');

      let pressureCb: ((l: string) => void) | null = null;
      onMemoryPressureChange.mockImplementation((cb: (l: string) => void) => {
        pressureCb = cb;
        return () => {};
      });

      const handler = jest.fn();
      registerFlushHandler('test', handler);
      installProactiveMemoryFlush();

      pressureCb!('moderate');
      await new Promise<void>((r) => setTimeout(r, 10));

      expect(handler).toHaveBeenCalled();
    });

    it('does not trigger flush when pressure is none', async () => {
      const { onMemoryPressureChange } = require('@/lib/devicePerformance');
      let pressureCb: ((l: string) => void) | null = null;
      onMemoryPressureChange.mockImplementation((cb: (l: string) => void) => {
        pressureCb = cb;
        return () => {};
      });

      const handler = jest.fn();
      registerFlushHandler('test', handler);
      installProactiveMemoryFlush();

      pressureCb!('none');
      await new Promise<void>((r) => setTimeout(r, 10));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('isProactiveFlushAvailable', () => {
    it('returns true when performance.memory exists', () => {
      (global as any).performance = { memory: { usedJSHeapSize: 50, jsHeapSizeLimit: 100 } };
      expect(isProactiveFlushAvailable()).toBe(true);
      delete (global as any).performance;
    });

    it('returns false when performance is undefined', () => {
      const orig = (global as any).performance;
      delete (global as any).performance;
      expect(isProactiveFlushAvailable()).toBe(false);
      (global as any).performance = orig;
    });
  });

  describe('getHeapUsageRatio', () => {
    it('returns ratio when performance.memory is available', () => {
      (global as any).performance = {
        memory: { usedJSHeapSize: 75, jsHeapSizeLimit: 100 },
      };
      expect(getHeapUsageRatio()).toBe(0.75);
      delete (global as any).performance;
    });

    it('returns null when performance.memory is unavailable', () => {
      delete (global as any).performance;
      expect(getHeapUsageRatio()).toBeNull();
    });
  });

  describe('wasRecentlyFlushed', () => {
    it('returns true after a flush', async () => {
      registerFlushHandler('test', () => {});
      await runProactiveFlush(true);
      expect(wasRecentlyFlushed()).toBe(true);
    });

    it('returns false when no flush has occurred', () => {
      expect(wasRecentlyFlushed()).toBe(false);
    });
  });
});
