import { isMobileWebView } from '@/lib/devicePerformance';

export const CAPTURE_MAX_WIDTH = 720;
export const CAPTURE_MAX_HEIGHT = 720;
export const CAPTURE_IDEAL_WIDTH = 720;
export const CAPTURE_IDEAL_HEIGHT = 1280;

// Single standard: all devices use 720px max dimension for capture.
const STANDARD_MAX_WIDTH = 720;
const STANDARD_MAX_HEIGHT = 720;
const STANDARD_IDEAL_WIDTH = 720;
const STANDARD_IDEAL_HEIGHT = 1280;

export interface SafeVideoConstraints {
  facingMode?: 'user' | 'environment';
  width: { ideal: number; max: number };
  height: { ideal: number; max: number };
}

function resolveIdealWidth(): number {
  return STANDARD_IDEAL_WIDTH;
}

function resolveIdealHeight(): number {
  return STANDARD_IDEAL_HEIGHT;
}

function resolveMaxWidth(): number {
  return STANDARD_MAX_WIDTH;
}

function resolveMaxHeight(): number {
  return STANDARD_MAX_HEIGHT;
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
