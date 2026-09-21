import { Platform } from 'react-native';

export type RemoveBgResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

export async function removeBackgroundOnDevice(
  imageDataUrl: string,
  _options?: { threshold?: number; feather?: boolean },
): Promise<RemoveBgResult> {
  if (Platform.OS !== 'web') {
    return { ok: false, error: '온디바이스 배경 제거는 웹에서만 지원됩니다.' };
  }

  try {
    const img = await loadImage(imageDataUrl);
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, error: '캔버스 컨텍스트를 생성할 수 없습니다.' };

    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const cornerColors = sampleCorners(data, w, h);
    const threshold = 38;
    const visited = new Uint8Array(w * h);
    const queue: number[] = [];

    for (const { r, g, b, idx } of cornerColors) {
      if (!visited[idx]) {
        visited[idx] = 1;
        queue.push(idx);
        data[idx * 4 + 3] = 0;
      }
    }

    while (queue.length > 0) {
      const px = queue.pop()!;
      const x = px % w;
      const y = Math.floor(px / w);
      const pr = data[px * 4];
      const pg = data[px * 4 + 1];
      const pb = data[px * 4 + 2];

      const neighbors = [
        x > 0 ? px - 1 : -1,
        x < w - 1 ? px + 1 : -1,
        y > 0 ? px - w : -1,
        y < h - 1 ? px + w : -1,
      ];

      for (const n of neighbors) {
        if (n < 0 || visited[n]) continue;
        const nr = data[n * 4];
        const ng = data[n * 4 + 1];
        const nb = data[n * 4 + 2];
        const dist = Math.sqrt(
          (nr - pr) * (nr - pr) + (ng - pg) * (ng - pg) + (nb - pb) * (nb - pb),
        );
        if (dist < threshold) {
          visited[n] = 1;
          data[n * 4 + 3] = 0;
          queue.push(n);
        }
      }
    }

    edgeFeather(data, w, h);

    ctx.putImageData(imageData, 0, 0);
    const resultDataUrl = canvas.toDataURL('image/png');
    return { ok: true, dataUrl: resultDataUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '배경 제거 중 오류가 발생했습니다.',
    };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = src;
  });
}

function sampleCorners(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Array<{ r: number; g: number; b: number; idx: number }> {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  return corners.map((idx) => ({
    r: data[idx * 4],
    g: data[idx * 4 + 1],
    b: data[idx * 4 + 2],
    idx,
  }));
}

function edgeFeather(data: Uint8ClampedArray, w: number, h: number): void {
  const tmp = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (tmp[idx + 3] > 0) {
        let opaque = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const nidx = ((y + dy) * w + (x + dx)) * 4;
            if (tmp[nidx + 3] > 0) opaque++;
          }
        }
        if (opaque < 8) {
          data[idx + 3] = Math.round(data[idx + 3] * (opaque / 8));
        }
      }
    }
  }
}
