import { Platform } from 'react-native';
import { prepareImageForApi } from './imageEdit';
import { cleanBase64, getMimeTypeFromDataUrl, buildDataUrl } from './base64';
import { compressImageInWorker, isWorkerPoolAvailable } from './workerPool';
import { STANDARD_MAX_DIMENSION, STANDARD_QUALITY } from './imageEdit';

const EDGE_FN_MAX_DIMENSION = STANDARD_MAX_DIMENSION;
const EDGE_FN_QUALITY = STANDARD_QUALITY;
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
  if (base64Images.length === 0) return [];

  // On web, process in parallel batches via Promise.all so multiple images
  // compress concurrently across the worker pool — up to 2x faster for
  // multi-cut uploads and 3D auto-capture batches.
  // On native, process in smaller batches to avoid memory pressure from
  // holding all data URLs + compressed results simultaneously.
  const batchSize = Platform.OS === 'web' ? PARALLEL_BATCH_SIZE : 2;
  const results: string[] = [];

  for (let i = 0; i < base64Images.length; i += batchSize) {
    const batch = base64Images.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((b64) => {
        const dataUrl = buildDataUrl(b64, mimeType);
        return compressForEdgeFunction(dataUrl, maxDimension, quality).then(
          (c) => c.dataUrl,
        );
      }),
    );
    results.push(...batchResults);
  }
  return results;
}
