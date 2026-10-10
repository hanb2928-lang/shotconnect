import { compressBase64ArrayForEdgeFunction, compressImagesInParallel } from '@/lib/parallelImageCompress';

jest.mock('@/lib/imageEdit', () => ({
  prepareImageForApi: jest.fn(),
  STANDARD_MAX_DIMENSION: 1080,
  STANDARD_QUALITY: 0.82,
}));

jest.mock('@/lib/base64', () => ({
  cleanBase64: jest.fn((dataUrl: string) => {
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  }),
  getMimeTypeFromDataUrl: jest.fn((dataUrl: string) => {
    const m = dataUrl.match(/^data:(image\/\w+);/);
    return m ? m[1] : 'image/jpeg';
  }),
  buildDataUrl: jest.fn((b64: string, mime: string) => `data:${mime};base64,${b64}`),
}));

jest.mock('@/lib/workerPool', () => ({
  isWorkerPoolAvailable: jest.fn(() => false),
  compressImageInWorker: jest.fn(),
  compressImageBatchInWorker: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import { prepareImageForApi } from '@/lib/imageEdit';

const mockPrepare = prepareImageForApi as jest.MockedFunction<typeof prepareImageForApi>;

describe('parallelImageCompress batch parallelization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('compressBase64ArrayForEdgeFunction', () => {
    it('processes images in parallel batches via Promise.all', async () => {
      const callOrder: string[] = [];
      mockPrepare.mockImplementation(async (dataUrl: string) => {
        const b64 = dataUrl.split(',')[1];
        // Simulate async work with varying delays
        callOrder.push(`start:${b64}`);
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push(`end:${b64}`);
        return `data:image/webp;base64,c${b64}`;
      });

      const images = ['img1', 'img2', 'img3', 'img4', 'img5'];
      const results = await compressBase64ArrayForEdgeFunction(images, 'image/jpeg');

      expect(results).toHaveLength(5);
      expect(results[0]).toBe('data:image/webp;base64,cimg1');
      expect(results[4]).toBe('data:image/webp;base64,cimg5');

      // At least one batch should have overlapping start/end (parallelism proof)
      // With batch size 5, all should start before any end
      const firstBatchStarts = callOrder.filter((s) => s.startsWith('start:'));
      const firstEnd = callOrder.findIndex((s) => s.startsWith('end:'));
      // All 5 starts should appear before the first end if truly parallel
      expect(firstEnd).toBeGreaterThan(4);
    });

    it('handles empty array', async () => {
      const results = await compressBase64ArrayForEdgeFunction([], 'image/jpeg');
      expect(results).toHaveLength(0);
    });

    it('handles single image', async () => {
      mockPrepare.mockImplementation(async (dataUrl: string) => {
        const b64 = dataUrl.split(',')[1];
        return `data:image/webp;base64,c${b64}`;
      });
      const results = await compressBase64ArrayForEdgeFunction(['solo'], 'image/jpeg');
      expect(results).toHaveLength(1);
      expect(results[0]).toBe('data:image/webp;base64,csolo');
    });

    it('preserves order of results across batches', async () => {
      mockPrepare.mockImplementation(async (dataUrl: string) => {
        const b64 = dataUrl.split(',')[1];
        // Random delay to test ordering robustness
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        return `data:image/webp;base64,c${b64}`;
      });
      const images = Array.from({ length: 10 }, (_, i) => `img${i}`);
      const results = await compressBase64ArrayForEdgeFunction(images, 'image/jpeg');
      expect(results).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(results[i]).toBe(`data:image/webp;base64,cimg${i}`);
      }
    });
  });

  describe('compressImagesInParallel', () => {
    it('compresses all images in batches', async () => {
      mockPrepare.mockImplementation(async (dataUrl: string) => {
        const b64 = dataUrl.split(',')[1];
        return `data:image/webp;base64,c${b64}`;
      });
      const urls = [
        'data:image/jpeg;base64,aaa',
        'data:image/jpeg;base64,bbb',
        'data:image/jpeg;base64,ccc',
        'data:image/jpeg;base64,ddd',
        'data:image/jpeg;base64,eee',
      ];
      const results = await compressImagesInParallel(urls);
      expect(results).toHaveLength(5);
      expect(results[0].base64).toBe('caaa');
      expect(results[4].base64).toBe('ceee');
    });

    it('handles empty array', async () => {
      const results = await compressImagesInParallel([]);
      expect(results).toHaveLength(0);
    });
  });
});
