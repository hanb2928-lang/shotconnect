jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = jest.fn();
  terminate = jest.fn();
}

describe('workerPool multi-worker pool', () => {
  let originalWorker: typeof Worker | undefined;
  let originalNavigator: typeof navigator | undefined;
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalBlob: typeof Blob | undefined;

  beforeEach(() => {
    originalWorker = global.Worker;
    originalNavigator = global.navigator;
    (global as any).Worker = MockWorker;
    (global as any).OffscreenCanvas = class {};
    Object.defineProperty(global, 'navigator', {
      value: { hardwareConcurrency: 8 },
      writable: true,
      configurable: true,
    });
    // URL.createObjectURL is not available in Node.js — mock it
    if (typeof URL !== 'undefined' && URL.createObjectURL) {
      originalCreateObjectURL = URL.createObjectURL;
    }
    if (typeof URL !== 'undefined') {
      URL.createObjectURL = jest.fn(() => 'blob:mock-url') as any;
    }
    // Blob may need polyfill in older Node
    if (typeof Blob === 'undefined') {
      (global as any).Blob = class {
        constructor(public parts: any[], public options: any) {}
      };
      originalBlob = undefined as any;
    }
  });

  afterEach(() => {
    if (originalWorker) (global as any).Worker = originalWorker;
    else delete (global as any).Worker;
    if (originalNavigator) (global as any).navigator = originalNavigator;
    else delete (global as any).navigator;
    if (originalCreateObjectURL && typeof URL !== 'undefined') {
      URL.createObjectURL = originalCreateObjectURL;
    }
    delete (global as any).OffscreenCanvas;
    jest.resetModules();
  });

  it('creates a pool with multiple workers based on hardware concurrency', () => {
    jest.isolateModules(() => {
      const { getWorkerPoolSize } = require('@/lib/workerPool');
      // 8 cores / 2 = 4, capped at 4
      expect(getWorkerPoolSize()).toBe(4);
    });
  });

  it('caps pool size at 4 even with high core count', () => {
    Object.defineProperty(global, 'navigator', {
      value: { hardwareConcurrency: 32 },
      writable: true,
      configurable: true,
    });
    jest.isolateModules(() => {
      const { getWorkerPoolSize } = require('@/lib/workerPool');
      expect(getWorkerPoolSize()).toBe(4);
    });
  });

  it('falls back to 2 workers when hardwareConcurrency is unavailable', () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    jest.isolateModules(() => {
      const { getWorkerPoolSize } = require('@/lib/workerPool');
      expect(getWorkerPoolSize()).toBe(2);
    });
  });

  it('reports availability correctly', () => {
    jest.isolateModules(() => {
      const { isWorkerPoolAvailable } = require('@/lib/workerPool');
      expect(isWorkerPoolAvailable()).toBe(true);
    });
  });

  it('exports compressImageBatchInWorker for batch processing', () => {
    jest.isolateModules(() => {
      const { compressImageBatchInWorker } = require('@/lib/workerPool');
      expect(typeof compressImageBatchInWorker).toBe('function');
    });
  });
});
