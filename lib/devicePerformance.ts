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
    if (cores && cores <= 4) { cachedTier = 'low'; return cachedTier; }
    if (mem && mem <= 4) { cachedTier = 'mid'; return cachedTier; }
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
