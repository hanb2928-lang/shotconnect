/**
 * Auto-Hook Selector Engine
 *
 * Generates 3 hook variants (stimulus, curiosity, benefit) from product
 * analysis metadata, then algorithmically selects the single best hook
 * based on product category, target audience, and retention probability.
 *
 * No manual user selection — the AI auto-selects and injects the master
 * hook into the rendering pipeline.
 */

import type { EmotionPhase } from './psychologyEngine';
import type { HookOption } from './shortFormEditEngine';
import { aiCachedCall, findSimilarCachedResult } from './aiCache';
import { hashObject } from './contentHash';

export type HookVariant = 'stimulus' | 'curiosity' | 'benefit';

export interface HookCandidate extends HookOption {
  variant: HookVariant;
  retentionScore: number;
  categoryFit: number;
  audienceFit: number;
  totalScore: number;
}

export interface AutoHookResult {
  candidates: HookCandidate[];
  selected: HookCandidate;
  selectionReason: string;
  productCategory: string;
  productMood: string;
  targetAudience: string;
}

interface ProductAnalysisInput {
  productName?: string;
  productCategory?: string;
  productMood?: string;
  priceEstimate?: string;
  targetAudience?: string;
  customPrompt?: string;
}

const STIMULUS_TEMPLATES: string[] = [
  '이거 모르면 평생 돈 버리는 겁니다',
  '이 단점 모르면 호구 되는 거임',
  '지금 안 보면 품절, 재입고 언제인지도 모름',
  '이 가격 실화? 매진 직전이라는데',
  '이거 안 쓰면 매달 돈 날리는 거 아님?',
  '나만 빼고 다 알던 거라 충격받음',
  '이거 사느라 vs 마느라 차이가 너무 큼',
  '품절 직전 캡처, 진짜 살 거면 지금',
];

const CURIOSITY_TEMPLATES: string[] = [
  '잠깐, 이거 진짜야? 직접 열어봤습니다',
  '아무도 안 알려주는 이 제품의 진짜 단점',
  '처음엔 반신반의했는데, 결과가 충격',
  '이거 왜 이렇게 잘 팔리는지 알겠더라고',
  '알 사람은 다 아는 그 집, 오늘 공개함',
  '리뷰 1만 개 넘는 거 써봤더니 실화더라',
  '이거 쓰는 사람들 왜 그렇게 많은지 알았음',
  '언박싱하다가 손 떨림 진짜임',
];

const BENEFIT_TEMPLATES: string[] = [
  '이거 하나면 매일 10분 아까워짐',
  '쓰는 순간 실감, 왜 진작 몰랐을까',
  '이거 사고 나서 다른 거 다 버렸음',
  '귀찮은 거 1초 만에 해결되는 거 실화',
  '이거 쓰면 삶의 질 확 달라지는 거 진짜',
  '원래 이런 거 안 믿는데 얘는 다르더라',
  '돌아갈 수 없는 갓템 진짜임',
  '이거 없을 때 vs 있을 때 차이가 미쳤음',
];

const CATEGORY_HOOK_WEIGHTS: Record<string, { stimulus: number; curiosity: number; benefit: number }> = {
  beauty: { stimulus: 0.25, curiosity: 0.35, benefit: 0.4 },
  fashion: { stimulus: 0.3, curiosity: 0.3, benefit: 0.4 },
  tech: { stimulus: 0.2, curiosity: 0.45, benefit: 0.35 },
  food: { stimulus: 0.35, curiosity: 0.25, benefit: 0.4 },
  home: { stimulus: 0.25, curiosity: 0.3, benefit: 0.45 },
  fitness: { stimulus: 0.35, curiosity: 0.2, benefit: 0.45 },
  discount: { stimulus: 0.55, curiosity: 0.2, benefit: 0.25 },
  default: { stimulus: 0.33, curiosity: 0.33, benefit: 0.34 },
};

const AUDIENCE_HOOK_WEIGHTS: Record<string, { stimulus: number; curiosity: number; benefit: number }> = {
  young: { stimulus: 0.4, curiosity: 0.35, benefit: 0.25 },
  professional: { stimulus: 0.2, curiosity: 0.35, benefit: 0.45 },
  family: { stimulus: 0.25, curiosity: 0.25, benefit: 0.5 },
  default: { stimulus: 0.33, curiosity: 0.33, benefit: 0.34 },
};

const RETENTION_BASE_SCORES: Record<HookVariant, number> = {
  stimulus: 0.78,
  curiosity: 0.82,
  benefit: 0.75,
};

function detectCategory(productCategory: string, productName: string, customPrompt: string): string {
  const hint = `${productCategory} ${productName} ${customPrompt}`.toLowerCase();
  if (hint.includes('뷰티') || hint.includes('화장') || hint.includes('스킨') || hint.includes('cosmetic') || hint.includes('beauty')) return 'beauty';
  if (hint.includes('패션') || hint.includes('의류') || hint.includes('옷') || hint.includes('신발') || hint.includes('fashion')) return 'fashion';
  if (hint.includes('테크') || hint.includes('전자') || hint.includes('가전') || hint.includes('it') || hint.includes('tech') || hint.includes('gadget')) return 'tech';
  if (hint.includes('식품') || hint.includes('먹거리') || hint.includes('카페') || hint.includes('디저트') || hint.includes('food') || hint.includes('베이커리')) return 'food';
  if (hint.includes('홈') || hint.includes('인테리어') || hint.includes('가구') || hint.includes('home') || hint.includes('living')) return 'home';
  if (hint.includes('운동') || hint.includes('헬스') || hint.includes('피트니스') || hint.includes('fitness') || hint.includes('아웃도어')) return 'fitness';
  if (hint.includes('할인') || hint.includes('공구') || hint.includes('특가') || hint.includes('가성비') || hint.includes('재고') || hint.includes('품절')) return 'discount';
  return 'default';
}

function detectAudience(productCategory: string, customPrompt: string): string {
  const hint = `${productCategory} ${customPrompt}`.toLowerCase();
  if (hint.includes('2030') || hint.includes('자취') || hint.includes('대학') || hint.includes('young') || hint.includes('틱톡') || hint.includes('릴스')) return 'young';
  if (hint.includes('직장') || hint.includes('오피스') || hint.includes('프리미엄') || hint.includes('professional') || hint.includes('커리어')) return 'professional';
  if (hint.includes('가족') || hint.includes('주부') || hint.includes('아이') || hint.includes('family') || hint.includes('육아')) return 'family';
  return 'default';
}

function detectMood(productCategory: string, customPrompt: string): string {
  const hint = `${productCategory} ${customPrompt}`.toLowerCase();
  if (hint.includes('할인') || hint.includes('품절') || hint.includes('공구')) return 'urgent';
  if (hint.includes('감성') || hint.includes('힐링') || hint.includes('일상')) return 'emotional';
  if (hint.includes('프리미엄') || hint.includes('럭셔리')) return 'premium';
  return 'trendy';
}

function pickTemplate(templates: string[], productName: string): string {
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx].replace('이거', productName).replace('이 제품', productName);
}

function generateHookCandidate(
  variant: HookVariant,
  templates: string[],
  productName: string,
  emotion: EmotionPhase,
  psychology: string,
): HookCandidate {
  const text = pickTemplate(templates, productName);
  return {
    id: 0,
    text,
    psychology,
    emotion,
    variant,
    retentionScore: RETENTION_BASE_SCORES[variant],
    categoryFit: 0,
    audienceFit: 0,
    totalScore: 0,
  };
}

export function autoSelectHook(input: ProductAnalysisInput): AutoHookResult {
  // Synchronous computation — caching is applied in the async wrapper below.
  return computeAutoHook(input);
}

export async function autoSelectHookCached(input: ProductAnalysisInput): Promise<AutoHookResult> {
  // Warm-cache fast path: check for a similar cached result by category+tone before
  // falling through to the standard hash-based cache. This lets us reuse hook results
  // across different products in the same category without re-computing.
  const preCategory = detectCategory(input.productCategory || '', input.productName || '', input.customPrompt || '');
  const preMood = detectMood(input.productCategory || '', input.customPrompt || '');
  const preAudience = detectAudience(input.productCategory || '', input.customPrompt || '');

  const similar = await findSimilarCachedResult<AutoHookResult>('auto-hook', preCategory, [preMood, preAudience]);
  if (similar) return similar;

  const cacheInput: Record<string, unknown> = {
    productName: input.productName || '',
    productCategory: input.productCategory || '',
    productMood: input.productMood || '',
    priceEstimate: input.priceEstimate || '',
    targetAudience: input.targetAudience || '',
    customPrompt: input.customPrompt || '',
  };
  const { data } = await aiCachedCall<AutoHookResult>(
    'auto-hook',
    cacheInput,
    () => Promise.resolve(computeAutoHook(input)),
    'local-heuristic',
  );
  return data;
}

function computeAutoHook(input: ProductAnalysisInput): AutoHookResult {
  const productName = input.productName?.trim() || '이 제품';
  const nameShort = productName.length > 10 ? productName.slice(0, 10) + '...' : productName;
  const category = detectCategory(input.productCategory || '', productName, input.customPrompt || '');
  const audience = detectAudience(input.productCategory || '', input.customPrompt || '');
  const mood = detectMood(input.productCategory || '', input.customPrompt || '');

  const candidates: HookCandidate[] = [
    generateHookCandidate('stimulus', STIMULUS_TEMPLATES, nameShort, 'shock', '손실 회피 역전'),
    generateHookCandidate('curiosity', CURIOSITY_TEMPLATES, nameShort, 'curiosity', '정보 갭 자극'),
    generateHookCandidate('benefit', BENEFIT_TEMPLATES, nameShort, 'desire', '즉각적 보상 추구'),
  ];

  const catWeights = CATEGORY_HOOK_WEIGHTS[category] ?? CATEGORY_HOOK_WEIGHTS.default;
  const audWeights = AUDIENCE_HOOK_WEIGHTS[audience] ?? AUDIENCE_HOOK_WEIGHTS.default;

  for (const c of candidates) {
    c.categoryFit = catWeights[c.variant];
    c.audienceFit = audWeights[c.variant];
    c.totalScore = Math.round(
      (c.retentionScore * 0.4 + c.categoryFit * 0.35 + c.audienceFit * 0.25) * 100,
    ) / 100;
  }

  candidates.sort((a, b) => b.totalScore - a.totalScore);
  const selected = candidates[0];

  const variantLabels: Record<HookVariant, string> = {
    stimulus: '자극형 (손실 회피)',
    curiosity: '호기심 유발형 (정보 갭)',
    benefit: '이익 강조형 (즉각 보상)',
  };

  const selectionReason = `카테고리[${category}] 타겟[${audience}] 무드[${mood}] 기반 가중치 분석 → ${variantLabels[selected.variant]}이 최적. 리텐션 점수 ${selected.retentionScore} + 카테고리 적합도 ${selected.categoryFit} + 타겟 적합도 ${selected.audienceFit} = 종합 ${selected.totalScore}`;

  return {
    candidates,
    selected,
    selectionReason,
    productCategory: category,
    productMood: mood,
    targetAudience: audience,
  };
}

export function getHookVariantLabel(variant: HookVariant): string {
  const labels: Record<HookVariant, string> = {
    stimulus: '자극형',
    curiosity: '호기심 유발형',
    benefit: '이익 강조형',
  };
  return labels[variant];
}
