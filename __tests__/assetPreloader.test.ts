jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/lib/bundledBgm', () => ({
  BUNDLED_BGM_TRACKS: [
    { id: 'track1', category: 'cinematic', assetPath: 'track1', title: 'T1', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] },
    { id: 'track2', category: 'hightension', assetPath: 'track2', title: 'T2', durationSec: 30, highlightStartSec: 3, highlightDurationSec: 10, bpm: 128, energyCurve: [] },
  ],
  resolveBundledTrackUri: jest.fn((track: { assetPath: string }) => `./audio/${track.assetPath}.mp3`),
}));

import {
  preloadBgmTrack,
  preloadAllBgmTracks,
  getCachedBgmBuffer,
  isBgmTrackPreloaded,
  preloadSfx,
  preloadSfxBatch,
  getCachedSfxBuffer,
  isSfxPreloaded,
  getOrComputeSubtitleStyle,
  getCachedSubtitleStyle,
  clearAllAssetCaches,
  getAssetCacheStats,
} from '@/lib/assetPreloader';
import type { CaptionStyle } from '@/lib/captionStyling';

function makeMockAudioContext(): AudioContext {
  const decodeCallCount = { n: 0 };
  const ctx = {
    sampleRate: 44100,
    decodeAudioData: jest.fn((buf: ArrayBuffer) => {
      decodeCallCount.n++;
      return Promise.resolve({
        sampleRate: 44100,
        length: buf.byteLength,
        duration: buf.byteLength / 44100,
        numberOfChannels: 2,
        getChannelData: () => new Float32Array(0),
      } as unknown as AudioBuffer);
    }),
  } as unknown as AudioContext;
  return ctx;
}

const mockFetch = jest.fn();
const originalFetch = global.fetch;

describe('assetPreloader', () => {
  beforeEach(() => {
    global.fetch = mockFetch;
    clearAllAssetCaches();
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('BGM AudioBuffer cache', () => {
    it('fetches and decodes a BGM track on first access', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      });
      const ctx = makeMockAudioContext();
      const track = { id: 'track1', category: 'cinematic', assetPath: 'track1', title: 'T1', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] } as any;

      const buffer = await preloadBgmTrack(ctx, track);
      expect(buffer).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(isBgmTrackPreloaded('track1')).toBe(true);
    });

    it('returns cached buffer on second access without re-fetching', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      });
      const ctx = makeMockAudioContext();
      const track = { id: 'track1', category: 'cinematic', assetPath: 'track1', title: 'T1', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] } as any;

      await preloadBgmTrack(ctx, track);
      const buffer2 = await preloadBgmTrack(ctx, track);

      expect(buffer2).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent fetches for the same track', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      });
      const ctx = makeMockAudioContext();
      const track = { id: 'track1', category: 'cinematic', assetPath: 'track1', title: 'T1', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] } as any;

      const [b1, b2] = await Promise.all([
        preloadBgmTrack(ctx, track),
        preloadBgmTrack(ctx, track),
      ]);

      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns null when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));
      const ctx = makeMockAudioContext();
      const track = { id: 'track_fail', category: 'cinematic', assetPath: 'track_fail', title: 'F', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] } as any;

      const buffer = await preloadBgmTrack(ctx, track);
      expect(buffer).toBeNull();
    });

    it('preloadAllBgmTracks preloads all tracks in parallel', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
      });
      const ctx = makeMockAudioContext();

      await preloadAllBgmTracks(ctx);

      expect(isBgmTrackPreloaded('track1')).toBe(true);
      expect(isBgmTrackPreloaded('track2')).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('getCachedBgmBuffer returns null for uncached track', () => {
      expect(getCachedBgmBuffer('nonexistent')).toBeNull();
    });
  });

  describe('SFX AudioBuffer cache', () => {
    it('fetches and decodes SFX on first access', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(256)),
      });
      const ctx = makeMockAudioContext();

      const buffer = await preloadSfx(ctx, 'whoosh', './sfx/whoosh.mp3');
      expect(buffer).not.toBeNull();
      expect(isSfxPreloaded('whoosh')).toBe(true);
    });

    it('returns cached SFX on second access', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(256)),
      });
      const ctx = makeMockAudioContext();

      await preloadSfx(ctx, 'whoosh', './sfx/whoosh.mp3');
      await preloadSfx(ctx, 'whoosh', './sfx/whoosh.mp3');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('preloadSfxBatch loads multiple SFX in parallel', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(128)),
      });
      const ctx = makeMockAudioContext();

      await preloadSfxBatch(ctx, [
        { id: 'sfx1', uri: './sfx/1.mp3' },
        { id: 'sfx2', uri: './sfx/2.mp3' },
        { id: 'sfx3', uri: './sfx/3.mp3' },
      ]);

      expect(isSfxPreloaded('sfx1')).toBe(true);
      expect(isSfxPreloaded('sfx2')).toBe(true);
      expect(isSfxPreloaded('sfx3')).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('getCachedSfxBuffer returns null for uncached SFX', () => {
      expect(getCachedSfxBuffer('nonexistent')).toBeNull();
    });
  });

  describe('Subtitle style template cache', () => {
    const sampleStyle: CaptionStyle = {
      color: '#ffffff',
      fontSize: 14,
      lineHeight: 19,
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
      strokeColor: 'rgba(0,0,0,0.85)',
      strokeWidth: 1,
      badgeBg: 'rgba(47,157,255,0.85)',
    };

    it('computes style on first call and caches it', () => {
      const compute = jest.fn(() => ({ ...sampleStyle }));
      const result1 = getOrComputeSubtitleStyle('dark', 'center', 400, compute);
      expect(compute).toHaveBeenCalledTimes(1);
      expect(result1.color).toBe('#ffffff');

      // Second call should hit cache
      const result2 = getOrComputeSubtitleStyle('dark', 'center', 400, compute);
      expect(compute).toHaveBeenCalledTimes(1);
      expect(result2).toBe(result1);
    });

    it('buckets similar containerWidths together', () => {
      const compute = jest.fn(() => ({ ...sampleStyle }));
      getOrComputeSubtitleStyle('dark', 'center', 400, compute);
      getOrComputeSubtitleStyle('dark', 'center', 405, compute);
      // 400 and 405 both bucket to 400 (nearest 20px)
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('distinguishes different luminance levels', () => {
      const compute = jest.fn(() => ({ ...sampleStyle }));
      getOrComputeSubtitleStyle('dark', 'center', 400, compute);
      getOrComputeSubtitleStyle('bright', 'center', 400, compute);
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('getCachedSubtitleStyle returns null for uncached key', () => {
      expect(getCachedSubtitleStyle('dark', 'center', 999)).toBeNull();
    });
  });

  describe('cache management', () => {
    it('getAssetCacheStats reports correct counts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      });
      const ctx = makeMockAudioContext();
      const track = { id: 'track1', category: 'cinematic', assetPath: 'track1', title: 'T1', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] } as any;

      await preloadBgmTrack(ctx, track);
      await preloadSfx(ctx, 'boom', './sfx/boom.mp3');
      getOrComputeSubtitleStyle('dark', 'top', 300, () => ({
        color: '#fff', fontSize: 12, lineHeight: 16,
        textShadowColor: '', textShadowRadius: 0, textShadowOffset: { width: 0, height: 0 },
        strokeColor: '', strokeWidth: 0, badgeBg: '',
      }));

      const stats = getAssetCacheStats();
      expect(stats.bgmTracks).toBe(1);
      expect(stats.sfxClips).toBe(1);
      expect(stats.subtitleStyles).toBe(1);
    });

    it('clearAllAssetCaches resets all caches', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      });
      const ctx = makeMockAudioContext();
      const track = { id: 'track1', category: 'cinematic', assetPath: 'track1', title: 'T1', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] } as any;

      await preloadBgmTrack(ctx, track);
      getOrComputeSubtitleStyle('dark', 'top', 300, () => ({
        color: '#fff', fontSize: 12, lineHeight: 16,
        textShadowColor: '', textShadowRadius: 0, textShadowOffset: { width: 0, height: 0 },
        strokeColor: '', strokeWidth: 0, badgeBg: '',
      }));

      clearAllAssetCaches();

      const stats = getAssetCacheStats();
      expect(stats.bgmTracks).toBe(0);
      expect(stats.sfxClips).toBe(0);
      expect(stats.subtitleStyles).toBe(0);
    });
  });
});
