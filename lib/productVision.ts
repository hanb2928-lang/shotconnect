import { supabase } from './supabase';
import { aiCachedCall } from './aiCache';
import { hashObject } from './contentHash';
import { compressImagesInParallel } from './parallelImageCompress';

export interface ProductVisionResult {
  productName: string;
  productCategory: string;
  visualFeatures: string[];
  marketingPoints: string[];
  textureDescription: string;
  colorPalette: string[];
  shapeDescription: string;
  materialGuess: string;
  keyAngles: { angle: string; description: string }[];
  orbitalFocusPoint: string;
  parallaxDepthLayers: string[];
  suggestedCopyLayers: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
}

const VISION_MAX_RETRIES = 2;
const VISION_TIMEOUT_MS = 120_000;

export async function analyzeProductVision(
  images: string[],
  productName?: string,
  scanId?: string,
): Promise<ProductVisionResult> {
  const cacheInput: Record<string, unknown> = {
    task: 'product-vision',
    imageCount: images.length,
    imageHashes: images.map((img) => {
      const dataIdx = img.indexOf(',');
      const b64 = dataIdx >= 0 ? img.slice(dataIdx + 1) : img;
      return hashObject({ b64 }).slice(0, 16);
    }),
    productName: productName || '',
  };

  const { data, cached } = await aiCachedCall<ProductVisionResult>(
    'product-vision',
    cacheInput,
    async () => {
      const compressed = await compressImagesInParallel(images);
      return fetchVisionFromApi(compressed.map((c) => c.dataUrl), productName, scanId);
    },
    'gpt-4o',
  );
  void cached;
  return data;
}

async function fetchVisionFromApi(
  images: string[],
  productName?: string,
  scanId?: string,
): Promise<ProductVisionResult> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= VISION_MAX_RETRIES; attempt++) {
    try {
      const result = await Promise.race([
        supabase.functions.invoke('analyze-product-vision', {
          body: { images, productName, scanId },
        }),
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(
            () => resolve({ data: null, error: { message: `Vision AI 분석 요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요. (제한: ${VISION_TIMEOUT_MS / 1000}초)` } }),
            VISION_TIMEOUT_MS,
          ),
        ),
      ]);

      const { data, error } = result;

      if (error) {
        throw new Error(error.message ?? 'Vision AI 분석 실패');
      }

      if (!data) {
        throw new Error('Vision AI 분석 결과를 받지 못했습니다.');
      }

      return data as ProductVisionResult;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < VISION_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    }
  }

  const msg = lastErr?.message ?? 'Vision AI 분석 실패';
  throw new Error(msg);
}

export function buildOrbitalPromptExtension(
  vision: ProductVisionResult,
  basePrompt: string,
): string {
  const features = vision.visualFeatures.slice(0, 5).join(', ');
  const marketingPoints = vision.marketingPoints.slice(0, 3).join(' / ');
  const depthLayers = vision.parallaxDepthLayers.length > 0
    ? vision.parallaxDepthLayers.join(' → ')
    : 'foreground product → midground context → background bokeh';
  const copyLayers = vision.suggestedCopyLayers;

  const angleDescriptions = vision.keyAngles.length > 0
    ? vision.keyAngles.map((a) => `  • ${a.angle}: ${a.description}`).join('\n')
    : '  • Front: product face detail\n  • 45° side: depth and form\n  • Top: texture overview\n  • Close-up: material detail\n  • Context: lifestyle placement';

  return [
    `### VISION AI PRODUCT ANALYSIS — 3D ORBITAL AD FORMAT`,
    ``,
    `Product: ${vision.productName}`,
    `Category: ${vision.productCategory}`,
    `Visual Features: ${features}`,
    `Marketing Points: ${marketingPoints}`,
    `Texture: ${vision.textureDescription}`,
    `Material: ${vision.materialGuess}`,
    `Color Palette: ${vision.colorPalette.join(', ')}`,
    `Shape: ${vision.shapeDescription}`,
    ``,
    `### MULTI-ANGLE REFERENCE (from 5 captured cuts)`,
    angleDescriptions,
    ``,
    `### 3D CAMERA ORBITAL TRAJECTORY`,
    `Orbital Focus Point: ${vision.orbitalFocusPoint || 'product center mass'}`,
    `Parallax Depth Layers: ${depthLayers}`,
    ``,
    `Camera path: Start frontal close-up → orbital arc clockwise 90° over 4s (radius 1.5x product width) →`,
    `parallax drift through depth layers at 6s → reverse arc counter-clockwise 45° at 10s →`,
    `settle to frontal zoom-out reveal at 13s → locked hero frame for CTA 14-15s.`,
    `Maintain product as orbital anchor; background parallax shifts with camera angle.`,
    `Depth: foreground product sharp, midground 50% blur, background 85% bokeh blur.`,
    ``,
    `### STEREOSCOPIC COPYWRITING LAYERS (3D Z-AXIS TEXT)`,
    `Primary (z=0, foreground): "${copyLayers.primary}" — kinetic typography, 120% pop, drop shadow depth 4px`,
    `Secondary (z=0.5, midground): "${copyLayers.secondary}" — fades in at 4s, 80% opacity, parallax drift -8px`,
    `Tertiary (z=1.0, background): "${copyLayers.tertiary}" — subtle ambient text, 40% opacity, static placement`,
    ``,
    `### INTEGRATION WITH BASE PROMPT`,
    basePrompt,
  ].join('\n');
}
