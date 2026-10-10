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

  describe('LRU eviction', () => {
    function makeTrack(id: string) {
      return { id, category: 'cinematic' as const, assetPath: id, title: id, durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [] } as any;
    }

    it('BGM cache evicts least-recently-accessed entry when count cap exceeded', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      });
      const ctx = makeMockAudioContext();

      // Load 3 tracks (cap is 12, so no eviction yet)
      await preloadBgmTrack(ctx, makeTrack('t1'));
      await preloadBgmTrack(ctx, makeTrack('t2'));
      await preloadBgmTrack(ctx, makeTrack('t3'));
      expect(getAssetCacheStats().bgmTracks).toBe(3);

      // Access t1 to make it most-recently-used
      getCachedBgmBuffer('t1');

      // Now load enough to trigger eviction. We need to exceed 12 entries.
      // Tracks t2 and t3 were accessed least recently (t1 was just touched).
      for (let i = 4; i <= 14; i++) {
        await preloadBgmTrack(ctx, makeTrack(`t${i}`));
      }

      const stats = getAssetCacheStats();
      expect(stats.bgmTracks).toBeLessThanOrEqual(12);
      // t1 was most recently accessed, so it should survive
      expect(isBgmTrackPreloaded('t1')).toBe(true);
    });

    it('SFX cache evicts least-recently-accessed entry when count cap exceeded', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      });
      const ctx = makeMockAudioContext();

      // Load 3 SFX (cap is 20)
      await preloadSfx(ctx, 's1', './sfx/s1.mp3');
      await preloadSfx(ctx, 's2', './sfx/s2.mp3');
      await preloadSfx(ctx, 's3', './sfx/s3.mp3');

      // Touch s1 to make it most-recently-used
      getCachedSfxBuffer('s1');

      // Load enough to exceed cap of 20
      for (let i = 4; i <= 22; i++) {
        await preloadSfx(ctx, `s${i}`, `./sfx/s${i}.mp3`);
      }

      const stats = getAssetCacheStats();
      expect(stats.sfxClips).toBeLessThanOrEqual(20);
      // s1 was touched most recently, should survive
      expect(isSfxPreloaded('s1')).toBe(true);
    });

    it('getCachedBgmBuffer updates LRU access time', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      });
      const ctx = makeMockAudioContext();

      // Fill cache to near capacity (12 entries)
      for (let i = 1; i <= 12; i++) {
        await preloadBgmTrack(ctx, makeTrack(`t${i}`));
      }
      expect(getAssetCacheStats().bgmTracks).toBe(12);

      // Touch t1 to make it most-recently-used
      getCachedBgmBuffer('t1');

      // Load 2 more to trigger eviction — t2 and t3 (oldest) should be evicted
      await preloadBgmTrack(ctx, makeTrack('t13'));
      await preloadBgmTrack(ctx, makeTrack('t14'));

      expect(isBgmTrackPreloaded('t1')).toBe(true);
      expect(isBgmTrackPreloaded('t2')).toBe(false);
    });

    it('getAssetCacheStats reports memory bytes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      });
      const ctx = makeMockAudioContext();

      await preloadBgmTrack(ctx, makeTrack('t1'));
      const stats = getAssetCacheStats();
      expect(stats.bgmMemoryBytes).toBeGreaterThan(0);
    });

    it('clearAllAssetCaches resets memory byte counters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      });
      const ctx = makeMockAudioContext();

      await preloadBgmTrack(ctx, makeTrack('t1'));
      await preloadSfx(ctx, 'boom', './sfx/boom.mp3');
      expect(getAssetCacheStats().bgmMemoryBytes).toBeGreaterThan(0);

      clearAllAssetCaches();

      const stats = getAssetCacheStats();
      expect(stats.bgmMemoryBytes).toBe(0);
      expect(stats.sfxMemoryBytes).toBe(0);
    });
  });
});
