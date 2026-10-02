import { Platform } from 'react-native';

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
  low:  { maxDimension: 720,  fps: 24, videoBitrate: 2_000_000, audioBitrate: 96_000 },
  mid:  { maxDimension: 1080, fps: 30, videoBitrate: 4_000_000, audioBitrate: 128_000 },
  high: { maxDimension: 1920, fps: 30, videoBitrate: 6_000_000, audioBitrate: 128_000 },
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
    console.warn(`[AdaptiveRender] Memory pressure: ${level}${source ? ` (${source})` : ''}`);
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

function getBatteryLevel(): number | null {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as any;
  if (nav.getBattery) {
    return null;
  }
  if (nav.battery?.level !== undefined) {
    return nav.battery.level;
  }
  return null;
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
  const battery = getBatteryLevel();
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
      videoBitrate: 1_200_000,
      audioBitrate: 64_000,
      reason: `severe memory pressure (tier: ${tier})`,
    };
  }

  if (pressure === 'moderate') {
    const mid = BASE_PARAMS.mid;
    return {
      maxDimension: Math.min(base.maxDimension, mid.maxDimension),
      fps: 24,
      videoBitrate: Math.min(base.videoBitrate, mid.videoBitrate),
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

let pressurePollInterval: ReturnType<typeof setInterval> | null = null;

export function startPressureMonitoring(intervalMs: number = 5000): () => void {
  if (pressurePollInterval) return () => stopPressureMonitoring();
  if (Platform.OS !== 'web') return () => {};

  pressurePollInterval = setInterval(() => {
    const detected = checkJsHeapPressure();
    if (detected !== 'none') {
      setMemoryPressure(detected, 'heap-poll');
    } else if (dynamicPressure !== 'none') {
      const battery = getBatteryLevel();
      if (battery === null || battery >= 0.15) {
        setMemoryPressure('none', 'heap-poll-recovery');
      }
    }
  }, intervalMs);

  return () => stopPressureMonitoring();
}

function stopPressureMonitoring(): void {
  if (pressurePollInterval) {
    clearInterval(pressurePollInterval);
    pressurePollInterval = null;
  }
}
