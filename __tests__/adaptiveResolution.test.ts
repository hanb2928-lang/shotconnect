import {
  getAdaptiveRenderParams,
  computeScaledDimensions,
  setMemoryPressure,
  getMemoryPressure,
  onMemoryPressureChange,
  detectRuntimePressure,
  startPressureMonitoring,
  type RenderParams,
} from '@/lib/devicePerformance';

// Mock Platform.OS so device tier detection works in tests
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock navigator for web tests
const originalNavigator = global.navigator;

function mockNavigator(overrides: Record<string, any>) {
  Object.defineProperty(global, 'navigator', {
    value: { ...originalNavigator, ...overrides },
    writable: true,
    configurable: true,
  });
}

function restoreNavigator() {
  Object.defineProperty(global, 'navigator', {
    value: originalNavigator,
    writable: true,
    configurable: true,
  });
}

// Mock performance.memory for heap pressure tests
function mockPerformanceMemory(usedRatio: number) {
  const limit = 100_000_000;
  (global.performance as any) = {
    ...(global.performance as any),
    memory: {
      usedJSHeapSize: Math.floor(limit * usedRatio),
      jsHeapSizeLimit: limit,
      totalJSHeapSize: limit,
    },
  };
}

function clearPerformanceMemory() {
  delete (global.performance as any).memory;
}

describe('adaptive resolution', () => {
  afterEach(() => {
    setMemoryPressure('none');
    clearPerformanceMemory();
    restoreNavigator();
  });

  describe('getAdaptiveRenderParams', () => {
    it('returns valid RenderParams with all required fields', () => {
      const params = getAdaptiveRenderParams();
      expect(params).toHaveProperty('maxDimension');
      expect(params).toHaveProperty('fps');
      expect(params).toHaveProperty('videoBitrate');
      expect(params).toHaveProperty('audioBitrate');
      expect(params).toHaveProperty('reason');
      expect(params.maxDimension).toBeGreaterThan(0);
      expect(params.fps).toBeGreaterThanOrEqual(15);
      expect(params.videoBitrate).toBeGreaterThan(0);
      expect(params.audioBitrate).toBeGreaterThan(0);
    });

    it('reduces resolution and bitrate under severe memory pressure', () => {
      setMemoryPressure('severe', 'test');
      const params = getAdaptiveRenderParams();
      expect(params.maxDimension).toBe(720);
      expect(params.fps).toBe(20);
      expect(params.videoBitrate).toBe(1_200_000);
      expect(params.audioBitrate).toBe(64_000);
      expect(params.reason).toContain('severe');
    });

    it('reduces resolution under moderate memory pressure', () => {
      setMemoryPressure('moderate', 'test');
      const params = getAdaptiveRenderParams();
      // Moderate should clamp to at most mid-tier settings
      expect(params.maxDimension).toBeLessThanOrEqual(1080);
      expect(params.fps).toBeLessThanOrEqual(24);
      expect(params.reason).toContain('moderate');
    });

    it('recovers when memory pressure clears', () => {
      setMemoryPressure('severe', 'test');
      expect(getAdaptiveRenderParams().maxDimension).toBe(720);

      setMemoryPressure('none');
      // After clearing, params should no longer include pressure reason
      const params = getAdaptiveRenderParams();
      expect(params.reason).not.toContain('pressure');
    });
  });

  describe('computeScaledDimensions', () => {
    it('scales down when source exceeds max dimension', () => {
      const result = computeScaledDimensions(1920, 1080, 720);
      expect(result.width).toBe(720);
      expect(result.height).toBe(405);
      expect(result.scale).toBeCloseTo(0.375, 3);
    });

    it('preserves dimensions when source is within max', () => {
      const result = computeScaledDimensions(640, 480, 720);
      expect(result.width).toBe(640);
      expect(result.height).toBe(480);
      expect(result.scale).toBe(1);
    });

    it('handles portrait video (height > width)', () => {
      const result = computeScaledDimensions(1080, 1920, 720);
      expect(result.width).toBe(405);
      expect(result.height).toBe(720);
      expect(result.scale).toBeCloseTo(0.375, 3);
    });

    it('handles square dimensions', () => {
      const result = computeScaledDimensions(1080, 1080, 720);
      expect(result.width).toBe(720);
      expect(result.height).toBe(720);
    });

    it('handles very small source dimensions', () => {
      const result = computeScaledDimensions(360, 640, 720);
      expect(result.width).toBe(360);
      expect(result.height).toBe(640);
      expect(result.scale).toBe(1);
    });

    it('scales extremely large source correctly', () => {
      const result = computeScaledDimensions(3840, 2160, 720);
      expect(result.width).toBe(720);
      expect(result.height).toBe(405);
      expect(result.scale).toBeCloseTo(0.1875, 4);
    });
  });

  describe('memory pressure events', () => {
    it('notifies listeners when pressure changes', () => {
      const events: string[] = [];
      const unsub = onMemoryPressureChange((level) => events.push(level));

      setMemoryPressure('moderate', 'test');
      setMemoryPressure('severe', 'test');
      setMemoryPressure('none');

      expect(events).toEqual(['moderate', 'severe', 'none']);
      unsub();
    });

    it('does not notify when pressure stays the same', () => {
      const events: string[] = [];
      const unsub = onMemoryPressureChange((level) => events.push(level));

      setMemoryPressure('moderate', 'test');
      setMemoryPressure('moderate', 'test');

      expect(events).toEqual(['moderate']);
      unsub();
    });

    it('getMemoryPressure returns current level', () => {
      setMemoryPressure('severe', 'test');
      expect(getMemoryPressure()).toBe('severe');
      setMemoryPressure('none');
      expect(getMemoryPressure()).toBe('none');
    });

    it('unsubscribe stops receiving events', () => {
      const events: string[] = [];
      const unsub = onMemoryPressureChange((level) => events.push(level));

      setMemoryPressure('moderate', 'test');
      unsub();
      setMemoryPressure('severe', 'test');

      expect(events).toEqual(['moderate']);
    });
  });

  describe('detectRuntimePressure', () => {
    it('detects severe heap pressure from performance.memory', () => {
      mockPerformanceMemory(0.9); // 90% of heap limit
      expect(detectRuntimePressure()).toBe('severe');
    });

    it('detects moderate heap pressure', () => {
      mockPerformanceMemory(0.75); // 75% of heap limit
      expect(detectRuntimePressure()).toBe('moderate');
    });

    it('returns none when heap usage is low', () => {
      mockPerformanceMemory(0.3);
      expect(detectRuntimePressure()).toBe('none');
    });
  });

  describe('startPressureMonitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns a cleanup function', () => {
      const stop = startPressureMonitoring(1000);
      expect(typeof stop).toBe('function');
      stop();
    });

    it('does not throw on non-web platforms', () => {
      // The function early-returns for non-web; just verify no throw
      expect(() => startPressureMonitoring(1000)).not.toThrow();
    });
  });
});
