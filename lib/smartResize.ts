import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getDeviceTier, detectRuntimePressure } from '@/lib/devicePerformance';
import { addBreadcrumb, logWarning } from '@/lib/errorLogger';
import { registerTempFile, safeDeleteTempFile } from '@/lib/tempFileManager';

interface DeviceMediaLimits {
  maxImagePixels: number;
  maxVideoFileBytes: number;
  targetImageDimension: number;
}

function getDeviceMediaLimits(): DeviceMediaLimits {
  const tier = getDeviceTier();
  const pressure = detectRuntimePressure();

  if (tier === 'low' || pressure === 'severe') {
    return {
      maxImagePixels: 720 * 720,
      targetImageDimension: 720,
      maxVideoFileBytes: 50_000_000,
    };
  }
  if (tier === 'mid' || pressure === 'moderate') {
    return {
      maxImagePixels: 1080 * 1080,
      targetImageDimension: 1080,
      maxVideoFileBytes: 120_000_000,
    };
  }
  return {
    maxImagePixels: 1440 * 1440,
    targetImageDimension: 1440,
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
    const manipulated = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.72,
      format: ImageManipulator.SaveFormat.JPEG,
    });
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

export function getSmartResizeImageMaxDimension(): number {
  return getDeviceMediaLimits().targetImageDimension;
}

export async function cleanupSmartResizeTemp(result: ImageAnalysisResult | VideoAnalysisResult): Promise<void> {
  if (result.temporary && result.uri) {
    await safeDeleteTempFile(result.uri).catch(() => {});
  }
}
