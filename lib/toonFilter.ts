/**
 * Canvas-based toon/manga filter pipeline.
 * Transforms a regular photo into a comic-style image with:
 *  - Sobel edge detection for bold pen lines
 *  - Color posterization for cel-shaded flat tones
 *  - Halftone dot screen overlay for analog manga texture
 *
 * Web-only (uses HTMLCanvasElement). On native, returns the source URI unchanged.
 */

export type ToonStyleMode = 'color' | 'mono';
export type ArtStyleMode = 'digital-webtoon' | 'analog-manga' | 'vintage-sketch';

export interface ToonFilterOptions {
  toneLevel: number; // 0–100, controls filter intensity
  style?: ToonStyleMode; // 'color' = webtoon color, 'mono' = B&W halftone sketch
  artStyle?: ArtStyleMode; // drawing style: digital webtoon, analog manga, vintage sketch
  edgeThreshold?: number; // default 40
  posterizeLevels?: number; // default 4
  dotSize?: number; // default 3
}

/**
 * Apply the toon filter to an image data URI.
 * Returns a new data URI with the transformed image.
 */
export async function applyToonFilter(
  sourceUri: string,
  opts: ToonFilterOptions,
): Promise<string> {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    return sourceUri;
  }

  const { toneLevel } = opts;
  const style = opts.style ?? 'color';
  const artStyle = opts.artStyle ?? 'digital-webtoon';
  const edgeThreshold = opts.edgeThreshold ?? 40;
  const posterizeLevels = opts.posterizeLevels ?? 4;
  const dotSize = opts.dotSize ?? 3;

  // Art-style-specific parameter overrides
  const isAnalog = artStyle === 'analog-manga';
  const isVintage = artStyle === 'vintage-sketch';
  const isDigital = artStyle === 'digital-webtoon';

  // Analog manga: heavier edges, fewer posterize levels, stronger halftone
  // Vintage sketch: softer edges, rougher texture, warm tint
  // Digital webtoon: clean edges, vibrant posterize, no halftone
  const effectiveEdgeThreshold = isAnalog ? edgeThreshold * 0.7 : isVintage ? edgeThreshold * 1.3 : edgeThreshold;
  const effectivePosterize = isAnalog ? 3 : isVintage ? 5 : posterizeLevels;
  const effectiveDotSize = isAnalog ? 4 : isVintage ? 2 : dotSize;

  // Load image
  const img = await loadImage(sourceUri);
  const maxDim = 720;
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceUri;

  // Draw original image
  ctx.drawImage(img, 0, 0, width, height);
  const srcData = ctx.getImageData(0, 0, width, height);
  const data = srcData.data;

  // Intensity factor: 0 = no filter, 1 = full toon
  const intensity = toneLevel / 100;

  // ── Step 1: Grayscale for edge detection ──
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  }

  // ── Step 2: Sobel edge detection ──
  const edges = new Uint8ClampedArray(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -gray[idx - width - 1] + gray[idx - width + 1]
        - 2 * gray[idx - 1] + 2 * gray[idx + 1]
        - gray[idx + width - 1] + gray[idx + width + 1];
      const gy =
        -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1]
        + gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = mag > effectiveEdgeThreshold ? 0 : 255;
    }
  }

  // ── Step 3: Posterize colors for cel-shading (color mode only) ──
  const step = 255 / (effectivePosterize - 1);
  if (style === 'color') {
    const posterizeStrength = 0.4 + intensity * 0.6; // blend factor for posterization
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const pr = Math.round(Math.round(r / step) * step);
      const pg = Math.round(Math.round(g / step) * step);
      const pb = Math.round(Math.round(b / step) * step);
      data[i * 4] = (r * (1 - posterizeStrength) + pr * posterizeStrength) | 0;
      data[i * 4 + 1] = (g * (1 - posterizeStrength) + pg * posterizeStrength) | 0;
      data[i * 4 + 2] = (b * (1 - posterizeStrength) + pb * posterizeStrength) | 0;
    }
  } else {
    // Mono mode: desaturate to grayscale first
    for (let i = 0; i < width * height; i++) {
      const v = gray[i];
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
    }
  }

  // ── Step 4: Apply edge lines (darken where edges detected) ──
  // Analog manga: thicker, darker pen lines; Vintage: softer pencil-like lines
  const edgeStrength = isAnalog
    ? 0.65 + intensity * 0.35
    : isVintage
      ? 0.3 + intensity * 0.3
      : 0.5 + intensity * 0.5;
  for (let i = 0; i < width * height; i++) {
    if (edges[i] === 0) {
      data[i * 4] = (data[i * 4] * (1 - edgeStrength)) | 0;
      data[i * 4 + 1] = (data[i * 4 + 1] * (1 - edgeStrength)) | 0;
      data[i * 4 + 2] = (data[i * 4 + 2] * (1 - edgeStrength)) | 0;
    }
  }

  // ── Step 5: Halftone dot screen overlay (manga texture) ──
  // Analog manga: strong halftone; Vintage: light scattered dots; Digital: none
  const dotAlphaBase = (style === 'mono' ? 0.25 : 0) + (isAnalog ? 0.1 : 0);
  const dotAlpha = isDigital
    ? style === 'mono'
      ? dotAlphaBase + intensity * 0.2
      : intensity > 0.2 ? (intensity - 0.2) * 0.35 : 0
    : isAnalog
      ? dotAlphaBase + intensity * 0.25
      : isVintage
        ? intensity * 0.12
        : 0;
  if (dotAlpha > 0) {
    const dotSpacing = effectiveDotSize * 2;
    for (let y = 0; y < height; y += dotSpacing) {
      for (let x = 0; x < width; x += dotSpacing) {
        const idx = y * width + x;
        const lum = gray[idx];
        // Only add dots in mid-tone areas (not pure black or white)
        if (lum > 60 && lum < 200) {
          const dotR = Math.max(1, (effectiveDotSize * (1 - lum / 255)) | 0);
          // Vintage: slightly warm-toned dots; others: black
          ctx.fillStyle = isVintage
            ? `rgba(80, 60, 40, ${dotAlpha})`
            : `rgba(0, 0, 0, ${dotAlpha})`;
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ── Step 6: Slight contrast boost for punchy manga look ──
  const contrast = 1 + intensity * (isDigital ? 0.15 : isAnalog ? 0.25 : 0.1);
  const midtone = 128;
  const finalData = ctx.getImageData(0, 0, width, height);
  const fd = finalData.data;
  for (let i = 0; i < fd.length; i += 4) {
    fd[i] = clamp(((fd[i] - midtone) * contrast + midtone) | 0);
    fd[i + 1] = clamp(((fd[i + 1] - midtone) * contrast + midtone) | 0);
    fd[i + 2] = clamp(((fd[i + 2] - midtone) * contrast + midtone) | 0);
  }

  // ── Step 7: Vintage warm tint overlay ──
  if (isVintage) {
    const vintageData = ctx.getImageData(0, 0, width, height);
    const vd = vintageData.data;
    for (let i = 0; i < vd.length; i += 4) {
      vd[i] = clamp(vd[i] * 0.95 + 10);          // slightly reduce red, add warmth
      vd[i + 1] = clamp(vd[i + 1] * 0.88 + 6);   // reduce green for sepia lean
      vd[i + 2] = clamp(vd[i + 2] * 0.75 + 4);   // reduce blue for warm tone
    }
    ctx.putImageData(vintageData, 0, 0);
  } else {
    ctx.putImageData(finalData, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
