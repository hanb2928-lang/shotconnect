import { Platform } from 'react-native';

export type AngleKey = 'front' | 'left' | 'right' | 'back' | 'top';

export interface AngleInput {
  key: AngleKey;
  label: string;
  base64: string;
  mimeType: string;
  orderIndex: number;
}

export type FusionStrategy = 'five_angle_stereo' | 'three_angle_partial' | 'single_fallback';

export interface VolumeEstimate {
  widthRatio: number;
  heightRatio: number;
  depthRatio: number;
  confidence: number;
}

export type UsageContext =
  | 'unboxing'
  | 'desk_setup'
  | 'outdoor'
  | 'kitchen'
  | 'beauty'
  | 'fashion'
  | 'general';

export interface ContextMatch {
  context: UsageContext;
  label: string;
  description: string;
  confidence: number;
}

export interface InterpolationGap {
  fromAngle: AngleKey;
  toAngle: AngleKey;
  steps: number;
}

export interface SynthesisResult {
  strategy: FusionStrategy;
  volumeEstimate: VolumeEstimate;
  contextMatch: ContextMatch;
  interpolationGaps: InterpolationGap[];
  spatialDepthHint: string;
  primaryAngle: AngleKey;
  processingSteps: string[];
}

const CONTEXT_LABELS: Record<UsageContext, { label: string; description: string }> = {
  unboxing: { label: '언박싱', description: '개봉 순간의 기대감을 살리는 연출' },
  desk_setup: { label: '데스크 셋업', description: '실제 사용 환경에서의 활용감 연출' },
  outdoor: { label: '야외 활용', description: '실외 사용 시나리오로 생동감 부여' },
  kitchen: { label: '주방 사용', description: '조리/주방 맥락에서의 실용성 강조' },
  beauty: { label: '뷰티/케어', description: '사용 전후 변화를 보여주는 감성 연출' },
  fashion: { label: '패션 착장', description: '착용했을 때의 무드와 핏 강조' },
  general: { label: '제품 소개', description: '제품 자체의 매력을 직관적으로 전달' },
};

const CONTEXT_KEYWORDS: Record<UsageContext, string[]> = {
  unboxing: ['박스', '개봉', '언박싱', '새제품', '새 상품'],
  desk_setup: ['데스크', '모니터', '키보드', '마우스', '책상', '사무실', '작업'],
  outdoor: ['야외', '캠핑', '등산', '아웃도어', '여행', '외부'],
  kitchen: ['주방', '부엌', '요리', '조리', '키친', '냄비', '프라이팬'],
  beauty: ['화장', '스킨케어', '뷰티', '미용', '크림', '세럼', '마스크'],
  fashion: ['옷', '의류', '착장', '코디', '패션', '가방', '신발'],
  general: [],
};

function detectContextFromPrompt(prompt: string): ContextMatch {
  const lower = prompt.toLowerCase();
  let best: UsageContext = 'general';
  let bestScore = 0;

  for (const [ctx, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
    if (ctx === 'general') continue;
    const ctxKey = ctx as UsageContext;
    const score = keywords.filter((k) => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = ctxKey;
    }
  }

  const meta = CONTEXT_LABELS[best];
  return {
    context: best,
    label: meta.label,
    description: meta.description,
    confidence: bestScore > 0 ? Math.min(0.95, 0.6 + bestScore * 0.15) : 0.5,
  };
}

function estimateVolume(angles: AngleInput[]): VolumeEstimate {
  const hasFront = angles.some((a) => a.key === 'front');
  const hasSide = angles.some((a) => a.key === 'left' || a.key === 'right');
  const hasTop = angles.some((a) => a.key === 'top');
  const hasBack = angles.some((a) => a.key === 'back');

  const confidence = (angles.length / 5) * 0.8 + (hasFront ? 0.1 : 0) + (hasSide ? 0.1 : 0);
  return {
    widthRatio: hasFront ? 1.0 : 0.7,
    heightRatio: hasTop ? 1.0 : 0.75,
    depthRatio: hasSide && hasBack ? 1.0 : hasSide ? 0.7 : 0.4,
    confidence: Math.min(1, confidence),
  };
}

function computeInterpolationGaps(angles: AngleInput[]): InterpolationGap[] {
  const present = new Set(angles.map((a) => a.key));
  const gaps: InterpolationGap[] = [];
  const order: AngleKey[] = ['front', 'left', 'right', 'back', 'top'];

  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i];
    const to = order[i + 1];
    if (present.has(from) && present.has(to)) {
      gaps.push({ fromAngle: from, toAngle: to, steps: 2 });
    }
  }
  if (present.has('back') && present.has('front')) {
    gaps.push({ fromAngle: 'back', toAngle: 'front', steps: 2 });
  }
  return gaps;
}

function determineStrategy(angleCount: number): FusionStrategy {
  if (angleCount >= 5) return 'five_angle_stereo';
  if (angleCount >= 3) return 'three_angle_partial';
  return 'single_fallback';
}

export function runSynthesis(
  angles: AngleInput[],
  customPrompt: string,
): SynthesisResult {
  const strategy = determineStrategy(angles.length);
  const volumeEstimate = estimateVolume(angles);
  const contextMatch = detectContextFromPrompt(customPrompt);
  const interpolationGaps = computeInterpolationGaps(angles);

  const strategyLabels: Record<FusionStrategy, string> = {
    five_angle_stereo: '정면·좌측·우측·후면·상부 5각도 입체 융합',
    three_angle_partial: `${angles.length}각도 부분 입체 융합`,
    single_fallback: '단일 컷 기반 추정 합성',
  };

  const processingSteps: string[] = [];
  if (strategy === 'five_angle_stereo') {
    processingSteps.push(
      '5각도 이미지 정합 및 피사체 중심축 정렬',
      '2D → 3D 볼륨 역산 및 깊이 맵 추정',
      '각도 간 공백 보간 (Interpolation)',
      '입체 에셋 생성 및 텍스처 매핑',
    );
  } else if (strategy === 'three_angle_partial') {
    processingSteps.push(
      `${angles.length}각도 이미지 정합`,
      '부분 볼륨 추정 및 추정 보간',
      '입체 에셋 생성 (정확도: 부분)',
    );
  } else {
    processingSteps.push('단일 이미지에서 깊이 추정', '단면 대칭 가정으로 입체 추정');
  }

  return {
    strategy,
    volumeEstimate,
    contextMatch,
    interpolationGaps,
    spatialDepthHint: strategyLabels[strategy],
    primaryAngle: angles[0]?.key ?? 'front',
    processingSteps,
  };
}

export async function alignSubjectCenter(
  imageDataUrl: string,
): Promise<string | null> {
  if (Platform.OS !== 'web') return null;
  try {
    const img = await loadImageElement(imageDataUrl);
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    let foundPixels = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] > 30) {
          foundPixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (foundPixels < 100) return null;

    const subjectW = maxX - minX;
    const subjectH = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const targetSize = Math.max(subjectW, subjectH);
    const padding = Math.round(targetSize * 0.15);
    const cropSize = targetSize + padding * 2;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropSize;
    cropCanvas.height = cropSize;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return null;

    const sx = Math.max(0, cx - cropSize / 2);
    const sy = Math.max(0, cy - cropSize / 2);
    cropCtx.drawImage(canvas, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);

    return cropCanvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

export function getSynthesisSummary(result: SynthesisResult): string {
  return `${result.spatialDepthHint} · 볼륨 신뢰도 ${Math.round(result.volumeEstimate.confidence * 100)}% · ${result.contextMatch.label} 맥락 적용`;
}
