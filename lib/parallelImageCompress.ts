import { Platform } from 'react-native';
import { prepareImageForApi } from './imageEdit';
import { cleanBase64, getMimeTypeFromDataUrl, buildDataUrl } from './base64';
import { compressImageInWorker, isWorkerPoolAvailable } from './workerPool';
import { getAdaptiveImageMaxDimension } from './devicePerformance';

const EDGE_FN_MAX_DIMENSION = getAdaptiveImageMaxDimension();
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
  // Work on a mutable copy so we can null out entries as each batch
  // completes, letting GC reclaim the multi-MB input strings on native
  // instead of holding the full array for the entire duration.
  const queue = [...dataUrls];
  for (let i = 0; i < queue.length; i += PARALLEL_BATCH_SIZE) {
    const batch = queue.slice(i, i + PARALLEL_BATCH_SIZE);
    // Null out processed entries to release references for GC
    for (let j = i; j < Math.min(i + PARALLEL_BATCH_SIZE, queue.length); j++) {
      queue[j] = '';
    }
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
  // Process one at a time on native to avoid building all data URLs + all
  // compressed results simultaneously, which doubles memory for N images.
  const results: string[] = [];
  for (let i = 0; i < base64Images.length; i++) {
    const dataUrl = buildDataUrl(base64Images[i], mimeType);
    const compressed = await compressForEdgeFunction(dataUrl, maxDimension, quality);
    results.push(compressed.dataUrl);
  }
  return results;
}
