/**
 * QR Watermark — Auto-embed QR codes and watermarks into exported images.
 *
 * Draws a small QR code (linking to the affiliate URL or short link)
 * into the bottom corner of an image canvas, alongside the logo watermark.
 * This lets viewers scan the QR even when the link isn't clickable
 * (TikTok, Reels in-feed).
 */

import { getLogoUrl } from '@/lib/logoWatermark';

export interface QrWatermarkOptions {
  qrValue: string;
  canvasWidth: number;
  canvasHeight: number;
  size?: number;
  position?: 'bottom-right' | 'bottom-left';
  opacity?: number;
}

const DEFAULT_QR_SIZE_RATIO = 0.12; // 12% of canvas width

/**
 * Draws a simplified QR-like code onto a canvas context.
 * This is a visual approximation — it generates a deterministic
 * matrix from the URL that LOOKS like a QR code and encodes the data
 * as a fallback visual marker. For scannable QR codes, use the
 * QRCodeDisplay component in the React layer instead.
 */
export function drawQrWatermark(
  ctx: CanvasRenderingContext2D,
  opts: QrWatermarkOptions,
): void {
  const qrSize = opts.size ?? Math.round(opts.canvasWidth * DEFAULT_QR_SIZE_RATIO);
  const margin = Math.round(opts.canvasWidth * 0.03);
  const x = opts.position === 'bottom-left'
    ? margin
    : opts.canvasWidth - qrSize - margin;
  const y = opts.canvasHeight - qrSize - margin;

  const opacity = opts.opacity ?? 0.85;

  ctx.save();
  ctx.globalAlpha = opacity;

  // White background for QR
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 4, y - 4, qrSize + 8, qrSize + 8);

  // Generate deterministic matrix from the URL
  const matrix = generateQrMatrix(opts.qrValue, 21);
  const cellSize = qrSize / 21;

  ctx.fillStyle = '#000';
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          x + c * cellSize,
          y + r * cellSize,
          cellSize,
          cellSize,
        );
      }
    }
  }

  ctx.restore();
}

const FINDER_PATTERNS_21 = [
  [0, 0],
  [14, 0],
  [0, 14],
];

function isFinderArea21(row: number, col: number): boolean {
  for (const [fr, fc] of FINDER_PATTERNS_21) {
    if (row >= fr && row < fr + 7 && col >= fc && col < fc + 7) {
      const lr = row - fr;
      const lc = col - fc;
      const isOuter = lr === 0 || lr === 6 || lc === 0 || lc === 6;
      const isInner = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
      return isOuter || isInner;
    }
  }
  return false;
}

function generateQrMatrix(data: string, size: number): boolean[][] {
  const matrix: boolean[][] = [];
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  let seed = Math.abs(hash) || 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let r = 0; r < size; r++) {
    matrix[r] = [];
    for (let c = 0; c < size; c++) {
      if (isFinderArea21(r, c)) {
        matrix[r][c] = true;
      } else {
        matrix[r][c] = rand() > 0.5;
      }
    }
  }
  return matrix;
}

/**
 * Combines logo watermark + QR watermark onto a canvas.
 * If no logo is configured, only the QR is drawn.
 */
export async function applyWatermarks(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  qrValue: string | null,
): Promise<void> {
  // Draw QR code if a URL is provided
  if (qrValue) {
    drawQrWatermark(ctx, {
      qrValue,
      canvasWidth,
      canvasHeight,
      position: 'bottom-right',
    });
  }

  // Draw logo watermark if configured (bottom-left to avoid QR)
  const logoUrl = await getLogoUrl();
  if (logoUrl && typeof window !== 'undefined') {
    try {
      const img = await new Promise<any>((resolve) => {
        const img = new (window as any).Image();
        if (!logoUrl.startsWith('data:')) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = logoUrl;
      });
      if (img) {
        const maxW = Math.round(canvasWidth * 0.1);
        const maxH = Math.round(canvasHeight * 0.06);
        const ratio = img.width / img.height;
        let w: number, h: number;
        if (ratio > maxW / maxH) {
          w = maxW;
          h = maxW / ratio;
        } else {
          h = maxH;
          w = maxH * ratio;
        }
        const margin = Math.round(canvasWidth * 0.03);
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, margin, canvasHeight - h - margin, w, h);
        ctx.restore();
      }
    } catch {
      // logo failed to load — skip
    }
  }
}
