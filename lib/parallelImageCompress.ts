import { Platform } from 'react-native';
import { prepareImageForApi } from './imageEdit';
import { cleanBase64, getMimeTypeFromDataUrl, buildDataUrl } from './base64';
import { compressImageInWorker, isWorkerPoolAvailable } from './workerPool';

const EDGE_FN_MAX_DIMENSION = 1080;
const EDGE_FN_QUALITY = 0.72;
const PARALLEL_BATCH_SIZE = Platform.OS === 'web' ? 5 : 1;

export interface CompressedImage {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

export async function compressForEdgeFunction(
  dataUrl: string,
  maxDimension = EDGE_FN_MAX_DIMENSION,
  quality = EDGE_FN_QUALITY,
): Promise<CompressedImage> {
  try {
    // On web, try to offload image compression to a Web Worker with
    // OffscreenCanvas. This keeps canvas resize/encode work off the
    // main thread so UI stays responsive during batch processing.
    let compressed: string;
    if (isWorkerPoolAvailable()) {
      try {
        compressed = await compressImageInWorker(dataUrl, maxDimension, quality);
      } catch {
        compressed = await prepareImageForApi(dataUrl, maxDimension, quality);
      }
    } else {
      compressed = await prepareImageForApi(dataUrl, maxDimension, quality);
    }
    const mimeType = getMimeTypeFromDataUrl(compressed);
    return {
      base64: cleanBase64(compressed),
      mimeType,
      dataUrl: compressed,
    };
  } catch (error) {
    if (Platform.OS !== 'web') throw error;
    const mimeType = getMimeTypeFromDataUrl(dataUrl);
    return {
      base64: cleanBase64(dataUrl),
      mimeType,
      dataUrl,
    };
  }
}

export async function compressImagesInParallel(
  dataUrls: string[],
  maxDimension = EDGE_FN_MAX_DIMENSION,
  quality = EDGE_FN_QUALITY,
): Promise<CompressedImage[]> {
  const results: CompressedImage[] = [];
  for (let i = 0; i < dataUrls.length; i += PARALLEL_BATCH_SIZE) {
    const batch = dataUrls.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((url) => compressForEdgeFunction(url, maxDimension, quality)),
    );
    results.push(...batchResults);
  }
  return results;
}

export async function compressBase64ArrayForEdgeFunction(
  base64Images: string[],
  mimeType = 'image/jpeg',
  maxDimension = EDGE_FN_MAX_DIMENSION,
  quality = EDGE_FN_QUALITY,
): Promise<string[]> {
  const dataUrls = base64Images.map((b64) => buildDataUrl(b64, mimeType));
  const compressed = await compressImagesInParallel(dataUrls, maxDimension, quality);
  return compressed.map((c) => c.dataUrl);
}
