import { getDeviceTier, isMobileWebView } from '@/lib/devicePerformance';

export const CAPTURE_MAX_WIDTH = 1280;
export const CAPTURE_MAX_HEIGHT = 1280;
export const CAPTURE_IDEAL_WIDTH = 1080;
export const CAPTURE_IDEAL_HEIGHT = 1920;

// Low-end devices (≤2 cores or ≤2GB RAM) use 720p to avoid OOM kills.
// Mid-tier devices cap at 1080p. High-end devices get the full ideal.
const LOW_END_MAX_WIDTH = 720;
const LOW_END_MAX_HEIGHT = 720;
const LOW_END_IDEAL_WIDTH = 720;
const LOW_END_IDEAL_HEIGHT = 1280;

const MID_TIER_MAX_WIDTH = 1080;
const MID_TIER_MAX_HEIGHT = 1080;

export interface SafeVideoConstraints {
  facingMode?: 'user' | 'environment';
  width: { ideal: number; max: number };
  height: { ideal: number; max: number };
}

function resolveIdealWidth(): number {
  const tier = getDeviceTier();
  if (tier === 'low') return LOW_END_IDEAL_WIDTH;
  return CAPTURE_IDEAL_WIDTH;
}

function resolveIdealHeight(): number {
  const tier = getDeviceTier();
  if (tier === 'low') return LOW_END_IDEAL_HEIGHT;
  return CAPTURE_IDEAL_HEIGHT;
}

function resolveMaxWidth(): number {
  const tier = getDeviceTier();
  if (tier === 'low') return LOW_END_MAX_WIDTH;
  if (tier === 'mid') return MID_TIER_MAX_WIDTH;
  return CAPTURE_MAX_WIDTH;
}

function resolveMaxHeight(): number {
  const tier = getDeviceTier();
  if (tier === 'low') return LOW_END_MAX_HEIGHT;
  if (tier === 'mid') return MID_TIER_MAX_HEIGHT;
  return CAPTURE_MAX_HEIGHT;
}

export function getSafeVideoConstraints(facing?: 'user' | 'environment'): SafeVideoConstraints {
  return {
    facingMode: facing,
    width: { ideal: resolveIdealWidth(), max: resolveMaxWidth() },
    height: { ideal: resolveIdealHeight(), max: resolveMaxHeight() },
  };
}

export function getDeviceCaptureMaxDim(): number {
  return resolveIdealWidth();
}

export function clampCaptureDimensions(
  rawW: number,
  rawH: number,
  maxDim = resolveMaxWidth(),
): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
  return {
    width: Math.round(rawW * scale),
    height: Math.round(rawH * scale),
  };
}
