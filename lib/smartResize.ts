import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getDeviceTier } from '@/lib/devicePerformance';
import { addBreadcrumb, logWarning } from '@/lib/errorLogger';
import { registerTempFile, safeDeleteTempFile } from '@/lib/tempFileManager';

interface DeviceMediaLimits {
  maxImagePixels: number;
  maxVideoFileBytes: number;
  targetImageDimension: number;
}

function getDeviceMediaLimits(): DeviceMediaLimits {
  return {
    maxImagePixels: 720 * 720,
    targetImageDimension: 720,
    maxVideoFileBytes: 250_000_000,
  };
}

export interface ImageAnalysisResult {
  uri: string;
  temporary: boolean;
  width: number;
  height: number;
  downscaled: boolean;
  originalWidth: number;
  originalHeight: number;
}

async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('이미지 크기를 불러올 수 없습니다'));
      img.src = uri;
    });
  }
  const { getImageSize } = await import('@/lib/imageEdit');
  return getImageSize(uri);
}

const BUSY_ERROR_PATTERNS = ['EBUSY', 'Resource busy', 'file is in use', 'already in use', 'EPERM', 'EACCES'];
const SETTLE_MAX_ATTEMPTS = 4;
const SETTLE_BASE_DELAY_MS = 80;

function isBusyError(error: unknown): boolean {
  const msg = String(error?.toString?.() ?? error ?? '');
  return BUSY_ERROR_PATTERNS.some((p) => msg.includes(p));
}

async function settleDelay(attempt: number): Promise<void> {
  const ms = SETTLE_BASE_DELAY_MS * Math.pow(2, attempt);
  await new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Retry a native file operation that may transiently fail with EBUSY/EPERM
 * when the OS file channel handle is still settling after a copyAsync.
 */
export async function withFileSettle<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isBusyError(error) || attempt === SETTLE_MAX_ATTEMPTS - 1) throw error;
      addBreadcrumb('file-settle', `${label} busy, retrying (${attempt + 1}/${SETTLE_MAX_ATTEMPTS})`, 'warning');
      await settleDelay(attempt);
    }
  }
  throw lastError;
}

/**
 * Yield to the native event loop after a copyAsync so the OS file channel
 * handle can fully flush before the next read/manipulate/delete hits it.
 */
export async function waitForFileChannelFlush(): Promise<void> {
  if (Platform.OS === 'web') return;
  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) => setTimeout(r, 0));
}

export async function analyzeAndDownscaleImage(uri: string): Promise<ImageAnalysisResult> {
  const limits = getDeviceMediaLimits();
  const { width: origW, height: origH } = await getImageDimensions(uri);
  const longestSide = Math.max(origW, origH);
  const pixelCount = origW * origH;
  const needsDownscale = longestSide > limits.targetImageDimension || pixelCount > limits.maxImagePixels;

  if (!needsDownscale) {
    return { uri, temporary: false, width: origW, height: origH, downscaled: false, originalWidth: origW, originalHeight: origH };
  }

  addBreadcrumb('smart-resize', `Downscaling image: ${origW}x${origH} → max ${limits.targetImageDimension}px`, 'warning', {
    tier: getDeviceTier(),
    pixels: pixelCount,
  });

  const isLandscape = origW >= origH;
  const actions = isLandscape
    ? [{ resize: { width: limits.targetImageDimension } }]
    : [{ resize: { height: limits.targetImageDimension } }];

  try {
    const manipulated = await withFileSettle('smartResize-manipulate', () =>
      ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
      }),
    );
    registerTempFile(manipulated.uri, 'smartResize-image');

    const { width: newW, height: newH } = await getImageDimensions(manipulated.uri);
    addBreadcrumb('smart-resize', `Downscaled to ${newW}x${newH}`, 'warning');

    return {
      uri: manipulated.uri,
      temporary: true,
      width: newW,
      height: newH,
      downscaled: true,
      originalWidth: origW,
      originalHeight: origH,
    };
  } catch (error) {
    logWarning('Smart resize failed, using original', {
      component: 'smartResize',
      action: 'analyzeAndDownscaleImage',
      extra: { origW, origH, error: String(error) },
    });
    return { uri, temporary: false, width: origW, height: origH, downscaled: false, originalWidth: origW, originalHeight: origH };
  }
}

export interface VideoAnalysisResult {
  uri: string;
  temporary: boolean;
  fileBytes: number;
  exceedsLimit: boolean;
  recommendedAction: 'proceed' | 'warn' | 'reject';
  reason: string;
}

export async function analyzeVideoFile(uri: string, temporary: boolean): Promise<VideoAnalysisResult> {
  const limits = getDeviceMediaLimits();

  let fileBytes = 0;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    fileBytes = info.exists ? (info.size ?? 0) : 0;
  } catch {
    fileBytes = 0;
  }

  if (fileBytes === 0) {
    return { uri, temporary, fileBytes: 0, exceedsLimit: false, recommendedAction: 'proceed', reason: 'File size unknown' };
  }

  if (fileBytes > limits.maxVideoFileBytes) {
    const tier = getDeviceTier();
    addBreadcrumb('smart-resize', `Video file too large: ${(fileBytes / 1_000_000).toFixed(1)}MB (limit: ${(limits.maxVideoFileBytes / 1_000_000).toFixed(0)}MB)`, 'warning', { tier });
    return {
      uri,
      temporary,
      fileBytes,
      exceedsLimit: true,
      recommendedAction: fileBytes > limits.maxVideoFileBytes * 2 ? 'reject' : 'warn',
      reason: `비디오 파일이 ${limits.maxVideoFileBytes > 100_000_000 ? '250MB' : limits.maxVideoFileBytes > 60_000_000 ? '120MB' : '50MB'} 제한을 초과합니다.`,
    };
  }

  return { uri, temporary, fileBytes, exceedsLimit: false, recommendedAction: 'proceed', reason: 'Within limits' };
}

export interface VideoAssetSpecCheck {
  action: 'proceed' | 'warn' | 'reject';
  message: string;
}

const RECOMMENDED_MAX_DURATION_SEC = 180;
const RECOMMENDED_MAX_RESOLUTION = 1080;
const REJECT_DURATION_SEC = 600;
const REJECT_RESOLUTION = 2160;

/**
 * Check a picked video asset against recommended specs (1080p, ≤3min).
 * Uses the asset metadata from expo-image-picker (duration, width, height).
 * Returns whether to proceed, warn, or reject — plus a user-facing message.
 */
export function checkVideoAssetSpecs(asset: {
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}): VideoAssetSpecCheck {
  const durationSec = asset.duration ? Math.round(asset.duration / 1000) : null;
  const longestSide = asset.width && asset.height ? Math.max(asset.width, asset.height) : null;
  const fileMB = asset.fileSize ? asset.fileSize / 1_000_000 : null;

  const issues: string[] = [];

  if (longestSide && longestSide > REJECT_RESOLUTION) {
    return {
      action: 'reject',
      message: `해상도가 ${longestSide}px로 권장 사양을 크게 초과했습니다. 1080p 이하, 3분 이내 영상을 선택해주세요. 기기 메모리 한계로 앱이 강제 종료될 수 있습니다.`,
    };
  }

  if (durationSec && durationSec > REJECT_DURATION_SEC) {
    return {
      action: 'reject',
      message: `영상 길이가 ${Math.round(durationSec / 60)}분으로 너무 깁니다. 3분 이내의 짧은 영상을 선택해주세요. 기기 메모리 한계로 앱이 강제 종료될 수 있습니다.`,
    };
  }

  if (fileMB && fileMB > 500) {
    return {
      action: 'reject',
      message: `파일 크기가 ${fileMB.toFixed(0)}MB로 너무 큽니다. 더 가볍게 압축된 영상을 선택해주세요.`,
    };
  }

  if (longestSide && longestSide > RECOMMENDED_MAX_RESOLUTION) {
    issues.push(`해상도 ${longestSide}px (권장: 1080p 이하)`);
  }
  if (durationSec && durationSec > RECOMMENDED_MAX_DURATION_SEC) {
    issues.push(`길이 ${Math.round(durationSec / 60)}분 (권장: 3분 이내)`);
  }

  if (issues.length > 0) {
    return {
      action: 'warn',
      message: `권장 사양을 초과했습니다: ${issues.join(', ')}. 압축 후 진행하거나 더 짧은 영상을 선택해주세요. 그대로 진행할 수도 있지만, 기기 성능에 따라 처리가 느려지거나 앱이 종료될 수 있습니다.`,
    };
  }

  return { action: 'proceed', message: '' };
}

export function getSmartResizeImageMaxDimension(): number {
  return getDeviceMediaLimits().targetImageDimension;
}

export async function cleanupSmartResizeTemp(result: ImageAnalysisResult | VideoAnalysisResult): Promise<void> {
  if (result.temporary && result.uri) {
    await safeDeleteTempFile(result.uri).catch(() => {});
  }
}
