import { Platform } from 'react-native';
import { addBreadcrumb, logWarning } from '@/lib/errorLogger';

export type DeviceTier = 'low' | 'mid' | 'high';

let cachedTier: DeviceTier | null = null;

function detectTier(): DeviceTier {
  if (cachedTier) return cachedTier;

  if (Platform.OS === 'web') {
    const nav = navigator as any;
    const mem = nav?.deviceMemory;
    const cores = nav?.hardwareConcurrency;

    if (mem && mem <= 2) { cachedTier = 'low'; return cachedTier; }
    if (cores && cores <= 2) { cachedTier = 'low'; return cachedTier; }
    if (mem && mem <= 4 && cores && cores <= 4) { cachedTier = 'mid'; return cachedTier; }
    cachedTier = 'high';
    return cachedTier;
  }

  cachedTier = 'mid';
  return cachedTier;
}

export function getDeviceTier(): DeviceTier {
  return detectTier();
}

export function isLowEndDevice(): boolean {
  return detectTier() === 'low';
}

export function shouldUseHeavyShadows(): boolean {
  return detectTier() !== 'low';
}

export function shouldUseGlowEffects(): boolean {
  return detectTier() !== 'low';
}

let cachedIsMobileWebView: boolean | null = null;

export function isMobileWebView(): boolean {
  if (cachedIsMobileWebView !== null) return cachedIsMobileWebView;
  if (Platform.OS !== 'web') {
    cachedIsMobileWebView = true;
    return true;
  }
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isWebView = /wv|WebView|CB|Line\/|KaKao|Instagram|FBAV|FBAN|Snapchat/i.test(ua);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  cachedIsMobileWebView = (isAndroid || isIOS) && (isWebView || hasTouch);
  return cachedIsMobileWebView;
}

export function canUseMediaRecorder(): boolean {
  if (isMobileWebView()) return false;
  if (Platform.OS !== 'web') return false;
  return typeof MediaRecorder !== 'undefined';
}

// --- Adaptive resolution: runtime memory + battery pressure detection ---

export interface RenderParams {
  maxDimension: number;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  reason: string;
}

const BASE_PARAMS: Record<DeviceTier, Omit<RenderParams, 'reason'>> = {
  low:  { maxDimension: 720,  fps: 24, videoBitrate: 1_500_000, audioBitrate: 96_000 },
  mid:  { maxDimension: 720,  fps: 30, videoBitrate: 2_500_000, audioBitrate: 128_000 },
  high: { maxDimension: 1080, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 },
};

let dynamicPressure: 'none' | 'moderate' | 'severe' = 'none';
let pressureListeners: ((p: 'none' | 'moderate' | 'severe') => void)[] = [];

function clampPressure(p: string | null): 'none' | 'moderate' | 'severe' {
  if (p === 'severe' || p === 'moderate' || p === 'none') return p;
  return 'none';
}

export function setMemoryPressure(
  level: 'none' | 'moderate' | 'severe',
  source?: string,
): void {
  if (level === dynamicPressure) return;
  dynamicPressure = level;
  for (const fn of pressureListeners) {
    try { fn(level); } catch {}
  }
  if (level !== 'none') {
    addBreadcrumb('device', `Memory pressure: ${level}`, level === 'severe' ? 'error' : 'warning', { source: source ?? null });
    logWarning(`Memory pressure: ${level}${source ? ` (${source})` : ''}`, { component: 'devicePerformance', action: 'setMemoryPressure' });
  }
}

export function getMemoryPressure(): 'none' | 'moderate' | 'severe' {
  return dynamicPressure;
}

export function onMemoryPressureChange(
  cb: (level: 'none' | 'moderate' | 'severe') => void,
): () => void {
  pressureListeners.push(cb);
  return () => {
    pressureListeners = pressureListeners.filter((fn) => fn !== cb);
  };
}

let cachedBatteryLevel: number | null = null;
let batteryFetchPromise: Promise<number | null> | null = null;

async function fetchBatteryLevel(): Promise<number | null> {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as any;
  if (!nav.getBattery) return null;
  if (batteryFetchPromise) return batteryFetchPromise;
  batteryFetchPromise = (async () => {
    try {
      const battery = await nav.getBattery();
      cachedBatteryLevel = battery?.level ?? null;
      return cachedBatteryLevel;
    } catch {
      return null;
    } finally {
      batteryFetchPromise = null;
    }
  })();
  return batteryFetchPromise;
}

function getCachedBatteryLevel(): number | null {
  return cachedBatteryLevel;
}

function checkJsHeapPressure(): 'none' | 'moderate' | 'severe' {
  if (Platform.OS !== 'web') return 'none';
  if (typeof performance === 'undefined' || !(performance as any).memory) return 'none';
  const mem = (performance as any).memory;
  const usedRatio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
  if (usedRatio > 0.85) return 'severe';
  if (usedRatio > 0.7) return 'moderate';
  return 'none';
}

export function detectRuntimePressure(): 'none' | 'moderate' | 'severe' {
  const heap = checkJsHeapPressure();
  if (heap === 'severe') return 'severe';
  const battery = getCachedBatteryLevel();
  if (battery !== null && battery < 0.15) {
    return heap === 'moderate' ? 'severe' : 'moderate';
  }
  if (dynamicPressure !== 'none') return dynamicPressure;
  return heap;
}

export function getAdaptiveRenderParams(): RenderParams {
  const tier = detectTier();
  const base = BASE_PARAMS[tier];
  const pressure = detectRuntimePressure();

  if (pressure === 'severe') {
    return {
      ...BASE_PARAMS.low,
      fps: 20,
      videoBitrate: 1_000_000,
      audioBitrate: 64_000,
      reason: `severe memory pressure (tier: ${tier})`,
    };
  }

  if (pressure === 'moderate') {
    return {
      maxDimension: 720,
      fps: 24,
      videoBitrate: 2_000_000,
      audioBitrate: base.audioBitrate,
      reason: `moderate memory pressure (tier: ${tier})`,
    };
  }

  return { ...base, reason: `tier: ${tier}` };
}

export function computeScaledDimensions(
  sourceW: number,
  sourceH: number,
  maxDimension: number,
): { width: number; height: number; scale: number } {
  const longestSide = Math.max(sourceW, sourceH);
  const scale = Math.min(1, maxDimension / longestSide);
  return {
    width: Math.round(sourceW * scale),
    height: Math.round(sourceH * scale),
    scale,
  };
}

/**
 * Adaptive max dimension for image processing pipelines.
 * Combines device tier with runtime memory pressure to pick the
 * safest resolution for image canvas operations. On a low-end phone
 * under memory pressure, this drops to 720px to avoid OOM kills
 * when decoding large photos onto a canvas.
 */
export function getAdaptiveImageMaxDimension(): number {
  const tier = detectTier();
  const pressure = detectRuntimePressure();
  if (pressure === 'severe') return 720;
  if (tier === 'low') return 720;
  if (pressure === 'moderate') return 720;
  if (tier === 'mid') return 720;
  return 1080;
}

let pressurePollInterval: ReturnType<typeof setInterval> | null = null;

export function startPressureMonitoring(intervalMs: number = 5000): () => void {
  if (pressurePollInterval) return () => stopPressureMonitoring();
  if (Platform.OS !== 'web') return () => {};

  pressurePollInterval = setInterval(() => {
    const detected = checkJsHeapPressure();
    if (detected !== 'none') {
      setMemoryPressure(detected, 'heap-poll');
    } else if (dynamicPressure !== 'none') {
      const battery = getCachedBatteryLevel();
      if (battery === null || battery >= 0.15) {
        setMemoryPressure('none', 'heap-poll-recovery');
      }
    }
    // Kick off async battery level fetch for next poll cycle
    fetchBatteryLevel();
  }, intervalMs);

  return () => stopPressureMonitoring();
}

function stopPressureMonitoring(): void {
  if (pressurePollInterval) {
    clearInterval(pressurePollInterval);
    pressurePollInterval = null;
  }
}
