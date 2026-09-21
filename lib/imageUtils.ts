import { Platform } from 'react-native';

const SUPABASE_URL_DEFAULT = '';

function getSupabaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabaseUrl } = require('@/lib/supabase');
    return supabaseUrl || SUPABASE_URL_DEFAULT;
  } catch {
    return SUPABASE_URL_DEFAULT;
  }
}

/**
 * Returns a resized thumbnail URL for a given image URI.
 *
 * - Supabase Storage URLs: appends Supabase Image Transform params (?width=&height=&resize=cover&quality=60)
 * - Pexels image URLs: appends ?auto=compress&cs=tinysrgb&w=<width>
 * - Base64 data URLs: returns as-is (already in memory, no network saving)
 * - Other URLs: returns as-is
 */
export function getThumbnailUrl(
  uri: string,
  width = 200,
  height?: number,
): string {
  if (!uri) return uri;

  // Base64 data URLs — already in memory, no benefit from URL params
  if (uri.startsWith('data:')) return uri;

  const supabaseUrl = getSupabaseUrl();

  // Supabase Storage public URL — use Image Transform
  if (supabaseUrl && uri.startsWith(`${supabaseUrl}/storage/v1/object/public/`)) {
    const sep = uri.includes('?') ? '&' : '?';
    const params = new URLSearchParams();
    params.set('width', String(width));
    if (height) params.set('height', String(height));
    params.set('resize', 'cover');
    params.set('quality', '60');
    return `${uri}${sep}${params.toString()}`;
  }

  // Pexels image URLs — use Pexels query params
  if (uri.includes('images.pexels.com')) {
    const sep = uri.includes('?') ? '&' : '?';
    return `${uri}${sep}auto=compress&cs=tinysrgb&w=${width}`;
  }

  return uri;
}

/**
 * For web platform: generates a downscaled JPEG thumbnail from a base64 data URL
 * using an offscreen canvas. Returns the original data URL on failure or non-web.
 */
export async function generateThumbnailDataUrl(
  dataUrl: string,
  maxDimension = 200,
  quality = 0.6,
): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return dataUrl;
  }

  try {
    const img = await loadImageElement(dataUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', quality);
    canvas.width = 0;
    canvas.height = 0;
    return result;
  } catch {
    return dataUrl;
  }
}

function loadImageElement(src: string, timeoutMs = 10000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('Thumbnail load timeout'));
      }
    }, timeoutMs);
    img.onload = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error('Thumbnail load error'));
      }
    };
    img.src = src;
  });
}
