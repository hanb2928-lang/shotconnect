/**
 * Asset preloader & cache for short-form generation.
 *
 * Pre-caches three categories of repeatedly-used assets to eliminate
 * network round-trip time during generation:
 *
 * 1. BGM tracks — fetched once as ArrayBuffer, decoded into AudioBuffer,
 *    reused on every playback.  Falls back to fetching the URI on cache miss.
 * 2. Sound effects (SFX) — short audio clips decoded into AudioBuffer and
 *    held in memory for instant playback during punch/transition moments.
 * 3. Subtitle style templates — pre-computed CaptionStyle objects keyed by
 *    (luminance, position, containerWidthBucket), avoiding recomputation
 *    on every segment render.
 *
 * All caches are in-memory only (L1).  BGM/SFX AudioBuffers are large and
 * session-scoped, so persistent disk storage is intentionally skipped —
 * the OS HTTP cache already covers re-fetch avoidance across sessions.
 *
 * BGM and SFX caches use true LRU eviction: every read updates `lastAccessed`,
 * and when either the entry-count cap or the memory-byte cap is exceeded the
 * least-recently-accessed entry is evicted first.
 */

import { Platform } from 'react-native';
import {
  BUNDLED_BGM_TRACKS,
  resolveBundledTrackUri,
  type BundledBgmTrack,
} from './bundledBgm';
import type { CaptionStyle } from './captionStyling';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Estimates the heap footprint of a decoded AudioBuffer (Float32 per channel). */
function estimateAudioBufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/** Monotonic counter for strict LRU ordering (Date.now lacks sub-ms resolution). */
let lruCounter = 0;
function nextLruTick(): number {
  return ++lruCounter;
}

// ─── BGM AudioBuffer cache ───────────────────────────────────────────────────

interface BgmCacheEntry {
  buffer: AudioBuffer;
  track: BundledBgmTrack;
  lastAccessed: number;
  bytes: number;
}

const bgmBufferCache = new Map<string, BgmCacheEntry>();
const bgmFetchPromises = new Map<string, Promise<AudioBuffer | null>>();
const BGM_CACHE_MAX = 12;
const BGM_MEMORY_CAP_BYTES = 80 * 1024 * 1024; // 80 MB

let bgmCacheBytes = 0;

function evictBgmCache(): void {
  while (bgmBufferCache.size > BGM_CACHE_MAX || bgmCacheBytes > BGM_MEMORY_CAP_BYTES) {
    if (bgmBufferCache.size === 0) break;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of bgmBufferCache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const removed = bgmBufferCache.get(oldestKey);
      if (removed) bgmCacheBytes -= removed.bytes;
      bgmBufferCache.delete(oldestKey);
    }
  }
}

async function fetchAndDecodeAudio(
  ctx: AudioContext,
  uri: string,
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(uri);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Returns a cached AudioBuffer for the given BGM track, or fetches+decodes
 * it on first access.  Subsequent calls for the same track ID return the
 * cached buffer synchronously (via a resolved promise) and update LRU state.
 */
export async function preloadBgmTrack(
  ctx: AudioContext,
  track: BundledBgmTrack,
): Promise<AudioBuffer | null> {
  if (Platform.OS !== 'web') return null;

  const cached = bgmBufferCache.get(track.id);
  if (cached) {
    cached.lastAccessed = nextLruTick();
    return cached.buffer;
  }

  const existing = bgmFetchPromises.get(track.id);
  if (existing) return existing;

  const promise = fetchAndDecodeAudio(ctx, resolveBundledTrackUri(track)).then(
    (buffer) => {
      if (buffer) {
        const bytes = estimateAudioBufferBytes(buffer);
        bgmBufferCache.set(track.id, {
          buffer,
          track,
          lastAccessed: nextLruTick(),
          bytes,
        });
        bgmCacheBytes += bytes;
        evictBgmCache();
      }
      bgmFetchPromises.delete(track.id);
      return buffer;
    },
  );
  bgmFetchPromises.set(track.id, promise);
  return promise;
}

/**
 * Pre-fetches and decodes all bundled BGM tracks for a given AudioContext.
 * Call this during app initialization or when the user enters the generation
 * flow, so tracks are ready before playback starts.
 */
export async function preloadAllBgmTracks(ctx: AudioContext): Promise<void> {
  if (Platform.OS !== 'web') return;
  await Promise.all(
    BUNDLED_BGM_TRACKS.map((track) => preloadBgmTrack(ctx, track)),
  );
}

export function getCachedBgmBuffer(trackId: string): AudioBuffer | null {
  const entry = bgmBufferCache.get(trackId);
  if (entry) {
    entry.lastAccessed = nextLruTick();
    return entry.buffer;
  }
  return null;
}

export function isBgmTrackPreloaded(trackId: string): boolean {
  return bgmBufferCache.has(trackId);
}

// ─── SFX AudioBuffer cache ───────────────────────────────────────────────────

interface SfxCacheEntry {
  buffer: AudioBuffer;
  lastAccessed: number;
  bytes: number;
}

const sfxBufferCache = new Map<string, SfxCacheEntry>();
const sfxFetchPromises = new Map<string, Promise<AudioBuffer | null>>();
const SFX_CACHE_MAX = 20;
const SFX_MEMORY_CAP_BYTES = 15 * 1024 * 1024; // 15 MB

let sfxCacheBytes = 0;

function evictSfxCache(): void {
  while (sfxBufferCache.size > SFX_CACHE_MAX || sfxCacheBytes > SFX_MEMORY_CAP_BYTES) {
    if (sfxBufferCache.size === 0) break;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of sfxBufferCache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const removed = sfxBufferCache.get(oldestKey);
      if (removed) sfxCacheBytes -= removed.bytes;
      sfxBufferCache.delete(oldestKey);
    }
  }
}

/**
 * Pre-fetches and decodes a sound effect audio file into an AudioBuffer.
 * Use this for sound punch SFX, transition whooshes, and other short clips
 * that are triggered repeatedly during short-form generation.
 */
export async function preloadSfx(
  ctx: AudioContext,
  id: string,
  uri: string,
): Promise<AudioBuffer | null> {
  if (Platform.OS !== 'web') return null;

  const cached = sfxBufferCache.get(id);
  if (cached) {
    cached.lastAccessed = nextLruTick();
    return cached.buffer;
  }

  const existing = sfxFetchPromises.get(id);
  if (existing) return existing;

  const promise = fetchAndDecodeAudio(ctx, uri).then((buffer) => {
    if (buffer) {
      const bytes = estimateAudioBufferBytes(buffer);
      sfxBufferCache.set(id, {
        buffer,
        lastAccessed: nextLruTick(),
        bytes,
      });
      sfxCacheBytes += bytes;
      evictSfxCache();
    }
    sfxFetchPromises.delete(id);
    return buffer;
  });
  sfxFetchPromises.set(id, promise);
  return promise;
}

/**
 * Preloads multiple SFX in parallel via Promise.all.
 */
export async function preloadSfxBatch(
  ctx: AudioContext,
  items: { id: string; uri: string }[],
): Promise<void> {
  if (Platform.OS !== 'web') return;
  await Promise.all(items.map((item) => preloadSfx(ctx, item.id, item.uri)));
}

export function getCachedSfxBuffer(id: string): AudioBuffer | null {
  const entry = sfxBufferCache.get(id);
  if (entry) {
    entry.lastAccessed = nextLruTick();
    return entry.buffer;
  }
  return null;
}

export function isSfxPreloaded(id: string): boolean {
  return sfxBufferCache.has(id);
}

// ─── Subtitle style template cache ───────────────────────────────────────────

const SUBTITLE_CACHE_MAX = 80;
const subtitleStyleCache = new Map<string, CaptionStyle>();

function subtitleCacheKey(
  luminance: 'dark' | 'bright' | 'medium',
  position: string,
  containerWidth: number,
): string {
  // Bucket containerWidth to nearest 20px to avoid cache fragmentation
  const widthBucket = Math.round(containerWidth / 20) * 20;
  return `${luminance}:${position}:${widthBucket}`;
}

/**
 * Returns a cached CaptionStyle, or computes and caches it via the provided
 * factory function.  The factory is only called on cache miss.
 */
export function getOrComputeSubtitleStyle(
  luminance: 'dark' | 'bright' | 'medium',
  position: string,
  containerWidth: number,
  compute: () => CaptionStyle,
): CaptionStyle {
  const key = subtitleCacheKey(luminance, position, containerWidth);
  const cached = subtitleStyleCache.get(key);
  if (cached) return cached;

  const style = compute();
  if (subtitleStyleCache.size >= SUBTITLE_CACHE_MAX) {
    // Evict oldest entry (first key in insertion order)
    const firstKey = subtitleStyleCache.keys().next().value;
    if (firstKey) subtitleStyleCache.delete(firstKey);
  }
  subtitleStyleCache.set(key, style);
  return style;
}

export function clearSubtitleStyleCache(): void {
  subtitleStyleCache.clear();
}

export function getCachedSubtitleStyle(
  luminance: 'dark' | 'bright' | 'medium',
  position: string,
  containerWidth: number,
): CaptionStyle | null {
  return subtitleStyleCache.get(
    subtitleCacheKey(luminance, position, containerWidth),
  ) ?? null;
}

// ─── Cache management ─────────────────────────────────────────────────────────

export function clearBgmCache(): void {
  bgmBufferCache.clear();
  bgmFetchPromises.clear();
  bgmCacheBytes = 0;
  lruCounter = 0;
}

export function clearSfxCache(): void {
  sfxBufferCache.clear();
  sfxFetchPromises.clear();
  sfxCacheBytes = 0;
  lruCounter = 0;
}

export function clearAllAssetCaches(): void {
  clearBgmCache();
  clearSfxCache();
  clearSubtitleStyleCache();
}

export function getAssetCacheStats(): {
  bgmTracks: number;
  sfxClips: number;
  subtitleStyles: number;
  bgmMemoryBytes: number;
  sfxMemoryBytes: number;
} {
  return {
    bgmTracks: bgmBufferCache.size,
    sfxClips: sfxBufferCache.size,
    subtitleStyles: subtitleStyleCache.size,
    bgmMemoryBytes: bgmCacheBytes,
    sfxMemoryBytes: sfxCacheBytes,
  };
}
