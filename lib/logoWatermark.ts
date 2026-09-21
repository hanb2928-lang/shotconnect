import { getUserSettings } from '@/lib/settings';

let cachedLogoUrl: string | null | undefined = undefined;

export async function getLogoUrl(): Promise<string | null> {
  if (cachedLogoUrl !== undefined) return cachedLogoUrl;
  try {
    const settings = await getUserSettings();
    cachedLogoUrl = settings?.logo_url || null;
  } catch {
    cachedLogoUrl = null;
  }
  return cachedLogoUrl;
}

export function clearLogoCache(): void {
  cachedLogoUrl = undefined;
}

export function drawLogoWatermark(
  ctx: any,
  logoImg: any,
  canvasW: number,
  canvasH: number,
  opacity: number = 0.7,
  position: 'bottom-right' | 'bottom-left' | 'top-right' = 'bottom-right',
): void {
  if (!logoImg || !logoImg.width || !logoImg.height) return;

  const maxW = Math.round(canvasW * 0.12);
  const maxH = Math.round(canvasH * 0.08);
  const imgRatio = logoImg.width / logoImg.height;
  let w: number, h: number;
  if (imgRatio > maxW / maxH) {
    w = maxW;
    h = maxW / imgRatio;
  } else {
    h = maxH;
    w = maxH * imgRatio;
  }
  w = Math.max(40, Math.round(w));
  h = Math.max(40, Math.round(h));

  const margin = Math.round(canvasW * 0.03);
  let x: number, y: number;
  switch (position) {
    case 'bottom-left':
      x = margin;
      y = canvasH - h - margin;
      break;
    case 'top-right':
      x = canvasW - w - margin;
      y = margin;
      break;
    case 'bottom-right':
    default:
      x = canvasW - w - margin;
      y = canvasH - h - margin;
      break;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(logoImg, x, y, w, h);
  ctx.restore();
}

export async function loadLogoImage(): Promise<any | null> {
  if (typeof window === 'undefined' || !(window as any).Image) return null;
  const logoUrl = await getLogoUrl();
  if (!logoUrl) return null;
  return new Promise((resolve) => {
    const img = new (window as any).Image();
    if (!logoUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
}
