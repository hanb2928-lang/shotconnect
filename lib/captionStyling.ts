import { Platform } from 'react-native';
import type { EditSegment, ShortFormEditPlan } from './shortFormEditEngine';

export type LuminanceLevel = 'dark' | 'bright' | 'medium';

export interface CaptionStyle {
  color: string;
  fontSize: number;
  lineHeight: number;
  textShadowColor: string;
  textShadowRadius: number;
  textShadowOffset: { width: number; height: number };
  strokeColor: string;
  strokeWidth: number;
  badgeBg: string;
}

export interface SafeZonePadding {
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
}

const BRIGHTNESS_THRESHOLD_DARK = 0.35;
const BRIGHTNESS_THRESHOLD_BRIGHT = 0.65;

export function classifyLuminance(luminance: number): LuminanceLevel {
  if (luminance < BRIGHTNESS_THRESHOLD_DARK) return 'dark';
  if (luminance > BRIGHTNESS_THRESHOLD_BRIGHT) return 'bright';
  return 'medium';
}

export function getCaptionStyle(
  luminance: LuminanceLevel,
  position: EditSegment['position'],
  containerWidth: number,
): CaptionStyle {
  const isDarkBg = luminance === 'dark';
  const isBrightBg = luminance === 'bright';
  const isMedium = luminance === 'medium';

  const color = isDarkBg ? '#ffffff' : isBrightBg ? '#0f172a' : '#ffffff';
  const strokeColor = isDarkBg ? 'rgba(0,0,0,0.85)' : isBrightBg ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
  const textShadowColor = isDarkBg ? 'rgba(0,0,0,0.8)' : isBrightBg ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)';
  const badgeBg = isDarkBg ? 'rgba(47,157,255,0.85)' : isBrightBg ? 'rgba(15,23,42,0.8)' : 'rgba(47,157,255,0.85)';

  const widthScale = Math.max(0.65, Math.min(1.4, containerWidth / 135));
  const positionScale = position === 'center' ? 1.18 : 0.9;
  const baseFontSize = 11 * widthScale * positionScale;
  const fontSize = Math.max(8, Math.round(baseFontSize));
  const lineHeight = Math.round(fontSize * 1.36);
  const strokeWidth = isMedium ? 1.5 : 1;

  return {
    color,
    fontSize,
    lineHeight,
    textShadowColor,
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
    strokeColor,
    strokeWidth,
    badgeBg,
  };
}

export function getSafeZonePadding(
  safeZone: ShortFormEditPlan['safeZone'],
  spec: ShortFormEditPlan['spec'],
  containerHeight: number,
): SafeZonePadding {
  if (!spec) {
    return { paddingTop: 60, paddingBottom: 80, paddingHorizontal: 10 };
  }
  const heightScale = containerHeight / spec.height;
  const paddingTop = Math.round(safeZone ? safeZone.top * heightScale : spec.safeZoneTop * heightScale);
  const paddingBottom = Math.round(safeZone ? safeZone.bottom * heightScale : spec.safeZoneBottom * heightScale);
  const sidePx = safeZone ? safeZone.left : spec.safeZoneSides;
  const paddingHorizontal = Math.max(8, Math.round(sidePx * heightScale * 0.5));
  return { paddingTop, paddingBottom, paddingHorizontal };
}

export function sampleVideoLuminance(
  video: HTMLVideoElement,
  region: 'top' | 'center' | 'bottom',
): number {
  if (Platform.OS !== 'web') return 0.3;
  const canvas = document.createElement('canvas');
  const sampleW = 64;
  const sampleH = 48;
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0.3;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return 0.3;

  let sy = 0;
  let sh = vh;
  if (region === 'top') {
    sy = 0;
    sh = Math.round(vh * 0.25);
  } else if (region === 'center') {
    sy = Math.round(vh * 0.3);
    sh = Math.round(vh * 0.4);
  } else {
    sy = Math.round(vh * 0.75);
    sh = Math.round(vh * 0.25);
  }

  try {
    ctx.drawImage(video, 0, sy, vw, sh, 0, 0, sampleW, sampleH);
    const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imageData.data;
    let totalLum = 0;
    let pixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalLum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      pixelCount++;
    }
    return pixelCount > 0 ? totalLum / pixelCount : 0.3;
  } catch {
    return 0.3;
  }
}
