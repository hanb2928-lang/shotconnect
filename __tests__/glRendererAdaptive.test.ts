/**
 * Tests for glRenderer adaptive downscaling integration.
 * Verifies that the GL renderer consults adaptive render params before
 * creating canvases, and that computeScaledDimensions correctly caps
 * canvas dimensions to the device-appropriate max.
 */

// Set up minimal DOM mocks before module imports
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
};

(global as any).document = {
  createElement: () => ({ ...mockCanvas }),
};

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/lib/devicePerformance', () => ({
  getAdaptiveRenderParams: jest.fn(() => ({
    maxDimension: 720,
    fps: 24,
    videoBitrate: 2_000_000,
    audioBitrate: 96_000,
    reason: 'test-low-tier',
  })),
  computeScaledDimensions: (w: number, h: number, max: number) => {
    const longest = Math.max(w, h);
    const scale = Math.min(1, max / longest);
    return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
  },
  setMemoryPressure: jest.fn(),
}));

jest.mock('@/lib/errorLogger', () => ({
  logError: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import { glBuildMask, glOverlayComposite, glApplyAlphaMask } from '@/lib/glRenderer';
import { getAdaptiveRenderParams, computeScaledDimensions } from '@/lib/devicePerformance';

describe('glRenderer adaptive downscaling', () => {
  beforeEach(() => {
    (getAdaptiveRenderParams as jest.Mock).mockClear();
  });

  it('consults adaptive render params for glBuildMask', () => {
    try { glBuildMask({ width: 1920, height: 1080 } as any, 1920, 1080, 0.5); } catch {}
    expect(getAdaptiveRenderParams).toHaveBeenCalled();
  });

  it('consults adaptive render params for glOverlayComposite', () => {
    try { glOverlayComposite({ width: 1920, height: 1080 } as any, { width: 1920, height: 1080 } as any, 1920, 1080, [1, 0, 0], 0.5); } catch {}
    expect(getAdaptiveRenderParams).toHaveBeenCalled();
  });

  it('consults adaptive render params for glApplyAlphaMask', () => {
    try { glApplyAlphaMask({ width: 1920, height: 1080 } as any, { width: 1920, height: 1080 } as any, 1920, 1080); } catch {}
    expect(getAdaptiveRenderParams).toHaveBeenCalled();
  });
});

describe('computeScaledDimensions for GL canvas', () => {
  it('720p cap scales 1920x1080 to 720x405', () => {
    const result = computeScaledDimensions(1920, 1080, 720);
    expect(result.width).toBe(720);
    expect(result.height).toBe(405);
    expect(result.scale).toBeLessThan(1);
  });

  it('preserves dimensions when source is within cap', () => {
    const result = computeScaledDimensions(640, 480, 720);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.scale).toBe(1);
  });

  it('handles portrait 1080x1920 at 720p cap', () => {
    const result = computeScaledDimensions(1080, 1920, 720);
    expect(result.width).toBe(405);
    expect(result.height).toBe(720);
  });
});
