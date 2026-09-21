export const CAPTURE_MAX_WIDTH = 1280;
export const CAPTURE_MAX_HEIGHT = 1280;
export const CAPTURE_IDEAL_WIDTH = 1080;
export const CAPTURE_IDEAL_HEIGHT = 1920;

export interface SafeVideoConstraints {
  facingMode?: 'user' | 'environment';
  width: { ideal: number; max: number };
  height: { ideal: number; max: number };
}

export function getSafeVideoConstraints(facing?: 'user' | 'environment'): SafeVideoConstraints {
  return {
    facingMode: facing,
    width: { ideal: CAPTURE_IDEAL_WIDTH, max: CAPTURE_MAX_WIDTH },
    height: { ideal: CAPTURE_IDEAL_HEIGHT, max: CAPTURE_MAX_HEIGHT },
  };
}

export function clampCaptureDimensions(
  rawW: number,
  rawH: number,
  maxDim = CAPTURE_MAX_WIDTH,
): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
  return {
    width: Math.round(rawW * scale),
    height: Math.round(rawH * scale),
  };
}
