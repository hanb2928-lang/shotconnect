import { compressForEdgeFunction, compressImagesInParallel, compressBase64ArrayForEdgeFunction } from '@/lib/parallelImageCompress';

jest.mock('@/lib/imageEdit', () => ({
  prepareImageForApi: jest.fn(),
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

import { prepareImageForApi } from '@/lib/imageEdit';

const mockPrepare = prepareImageForApi as jest.MockedFunction<typeof prepareImageForApi>;

describe('parallelImageCompress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('compressForEdgeFunction', () => {
    it('returns compressed image when prepareImageForApi succeeds', async () => {
      mockPrepare.mockResolvedValue('data:image/webp;base64,compressed123');
      const result = await compressForEdgeFunction('data:image/png;base64,rawdata');
      expect(result.mimeType).toBe('image/webp');
      expect(result.base64).toBe('compressed123');
      expect(result.dataUrl).toBe('data:image/webp;base64,compressed123');
    });

    it('falls back to original on compression failure', async () => {
      mockPrepare.mockRejectedValue(new Error('canvas error'));
      const result = await compressForEdgeFunction('data:image/jpeg;base64,originaldata');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.base64).toBe('originaldata');
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

  describe('compressBase64ArrayForEdgeFunction', () => {
    it('returns compressed data URLs for each base64 image', async () => {
      mockPrepare.mockImplementation(async (dataUrl: string) => {
        const b64 = dataUrl.split(',')[1];
        return `data:image/webp;base64,c${b64}`;
      });
      const images = ['raw1', 'raw2'];
      const results = await compressBase64ArrayForEdgeFunction(images, 'image/jpeg');
      expect(results).toHaveLength(2);
      expect(results[0]).toBe('data:image/webp;base64,craw1');
      expect(results[1]).toBe('data:image/webp;base64,craw2');
    });
  });
});
