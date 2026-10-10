/**
 * Tests for chunked CPU fallback rendering functions.
 * Verifies that tile-based processing produces correct pixel output
 * and works for large images without errors.
 */

function makeMockCanvas(initialWidth: number = 0, initialHeight: number = 0) {
  let width = initialWidth;
  let height = initialHeight;
  let storedData: Uint8ClampedArray | null = null;

  const ensureData = () => {
    if (!storedData || storedData.length < width * height * 4) {
      storedData = new Uint8ClampedArray(width * height * 4);
    }
    return storedData;
  };

  const ctx = {
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    getImageData: (x: number, y: number, w: number, h: number) => {
      const data = ensureData();
      const slice = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) {
        const srcStart = ((y + row) * width + x) * 4;
        const dstStart = row * w * 4;
        for (let i = 0; i < w * 4; i++) {
          slice[dstStart + i] = data[srcStart + i];
        }
      }
      return { data: slice, width: w, height: h };
    },
    putImageData: (imgData: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) => {
      const data = ensureData();
      for (let row = 0; row < imgData.height; row++) {
        const dstStart = ((y + row) * width + x) * 4;
        const srcStart = row * imgData.width * 4;
        for (let i = 0; i < imgData.width * 4; i++) {
          data[dstStart + i] = imgData.data[srcStart + i];
        }
      }
    },
    drawImage: () => {},
    clearRect: () => {},
    fillRect: () => {},
  };

  return {
    get width() { return width; },
    set width(v: number) { width = v; },
    get height() { return height; },
    set height(v: number) { height = v; },
    getContext: (_type?: string) => ctx,
    addEventListener: () => {},
    removeEventListener: () => {},
    toDataURL: () => 'data:image/png;base64,mock',
  };
}

function makeCanvasWithData(
  width: number,
  height: number,
  fillFn: (data: Uint8ClampedArray, idx: number, x: number, y: number) => void,
): HTMLCanvasElement {
  const canvas = makeMockCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      fillFn(imageData.data, idx, x, y);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas as unknown as HTMLCanvasElement;
}

// Set up document mock before module imports

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/lib/devicePerformance', () => ({
  getAdaptiveRenderParams: jest.fn(() => ({
    maxDimension: 4096,
    fps: 30,
    videoBitrate: 4_000_000,
    audioBitrate: 128_000,
    reason: 'test',
  })),
  computeScaledDimensions: (w: number, h: number, max: number) => {
    const longest = Math.max(w, h);
    const scale = Math.min(1, max / longest);
    return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
  },
  setMemoryPressure: jest.fn(),
  detectRuntimePressure: jest.fn(() => 'none'),
}));

jest.mock('@/lib/errorLogger', () => ({
  logError: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

(global as any).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return makeMockCanvas();
    return {};
  },
};

import {
  cpuChunkedProcess,
  cpuBuildMask,
  cpuOverlayComposite,
  cpuApplyAlphaMask,
  cpuCheckerAlphaMask,
} from '@/lib/glRenderer';

describe('cpuChunkedProcess', () => {
  it('processes a small canvas in a single tile', () => {
    const canvas = makeCanvasWithData(4, 4, (data, i) => {
      data[i] = 100; data[i + 1] = 200; data[i + 2] = 50; data[i + 3] = 255;
    });
    const result = cpuChunkedProcess(canvas, 4, 4, (data) => {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
      }
    });
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, 4, 4);
    expect(out.data[0]).toBe(255);
    expect(out.data[1]).toBe(200);
  });

  it('processes a large canvas across multiple tiles correctly', () => {
    const w = 64;
    const h = 600;
    const canvas = makeCanvasWithData(w, h, (data, i, x, y) => {
      data[i] = (x + y) % 200;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    });
    const result = cpuChunkedProcess(canvas, w, h, (data) => {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i] + 1;
      }
    });
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        expect(out.data[idx]).toBe(((x + y) % 200) + 1);
      }
    }
  });
});

describe('cpuBuildMask', () => {
  it('converts alpha to black/white based on threshold', () => {
    const canvas = makeCanvasWithData(4, 4, (data, i) => {
      data[i + 3] = 200;
    });
    const result = cpuBuildMask(canvas, 4, 4, 0.5);
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, 4, 4);
    expect(out.data[0]).toBe(255);
    expect(out.data[3]).toBe(255);
  });

  it('produces black for below-threshold alpha', () => {
    const canvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i + 3] = 50;
    });
    const result = cpuBuildMask(canvas, 2, 2, 0.5);
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, 2, 2);
    expect(out.data[0]).toBe(0);
    expect(out.data[3]).toBe(255);
  });
});

describe('cpuOverlayComposite', () => {
  it('overlays color on removed (dark mask) areas', () => {
    const imageCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 10; data[i + 1] = 20; data[i + 2] = 30; data[i + 3] = 255;
    });
    const maskCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    });
    const result = cpuOverlayComposite(imageCanvas, maskCanvas, 2, 2, [220 / 255, 50 / 255, 50 / 255], 140 / 255);
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, 2, 2);
    expect(out.data[0]).toBe(220);
    expect(out.data[1]).toBe(50);
    expect(out.data[2]).toBe(50);
    expect(out.data[3]).toBe(Math.round((140 / 255) * 255));
  });

  it('keeps original pixels where mask is white (kept areas)', () => {
    const imageCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 10; data[i + 1] = 20; data[i + 2] = 30; data[i + 3] = 255;
    });
    const maskCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    });
    const result = cpuOverlayComposite(imageCanvas, maskCanvas, 2, 2, [1, 0, 0], 0.5);
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, 2, 2);
    expect(out.data[0]).toBe(10);
    expect(out.data[1]).toBe(20);
    expect(out.data[2]).toBe(30);
  });
});

describe('cpuApplyAlphaMask', () => {
  it('applies mask red channel as image alpha', () => {
    const imageCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 100; data[i + 1] = 150; data[i + 2] = 200; data[i + 3] = 255;
    });
    const maskCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 128; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    });
    const result = cpuApplyAlphaMask(imageCanvas, maskCanvas, 2, 2);
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, 2, 2);
    expect(out.data[0]).toBe(100);
    expect(out.data[3]).toBe(128);
  });

  it('handles large images across multiple tiles', () => {
    const w = 64;
    const h = 600;
    const imageCanvas = makeCanvasWithData(w, h, (data, i) => {
      data[i] = 200; data[i + 3] = 255;
    });
    const maskCanvas = makeCanvasWithData(w, h, (data, i, x, y) => {
      data[i] = (x + y) % 256;
    });
    const result = cpuApplyAlphaMask(imageCanvas, maskCanvas, w, h);
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        expect(out.data[idx + 3]).toBe((x + y) % 256);
      }
    }
  });
});

describe('cpuCheckerAlphaMask', () => {
  it('produces alpha=255 for removed areas (dark mask)', () => {
    const maskCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 0;
    });
    const result = cpuCheckerAlphaMask(maskCanvas, 2, 2);
    expect(result).not.toBeNull();
    const ctx = result!.getContext('2d')!;
    const out = ctx.getImageData(0, 0, 2, 2);
    expect(out.data[3]).toBe(255);
  });

  it('produces alpha=0 for kept areas (white mask)', () => {
    const maskCanvas = makeCanvasWithData(2, 2, (data, i) => {
      data[i] = 255;
    });
    const result2 = cpuCheckerAlphaMask(maskCanvas, 2, 2);
    expect(result2).not.toBeNull();
    const ctx2 = result2!.getContext('2d')!;
    const out2 = ctx2.getImageData(0, 0, 2, 2);
    expect(out2.data[3]).toBe(0);
  });
});
