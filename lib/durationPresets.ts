export type DurationTier = 'viral' | 'standard' | 'detailed';

export interface DurationPreset {
  value: number;
  label: string;
  tier: DurationTier;
  desc: string;
}

export const DURATION_PRESETS: DurationPreset[] = [
  {
    value: 12000,
    label: '12초',
    tier: 'viral',
    desc: '빠른 바이럴 · 즉각적인 시선 집중',
  },
  {
    value: 15000,
    label: '15초',
    tier: 'viral',
    desc: '가벼운 바이럴 · 훅 + 제품 한줄 소개',
  },
  {
    value: 18000,
    label: '18초',
    tier: 'standard',
    desc: '표준 · 훅 + 제품 설명 + 구매 링크',
  },
  {
    value: 20000,
    label: '20초',
    tier: 'standard',
    desc: '표준 · 제품 스토리 + 구매 전환 유도',
  },
  {
    value: 22000,
    label: '22초',
    tier: 'standard',
    desc: '표준 · 상세 스토리 + 후기 + 구매',
  },
  {
    value: 30000,
    label: '30초',
    tier: 'detailed',
    desc: '상세 설명 · 제품 철학 + 후기 + 가이드',
  },
];

export const DEFAULT_DURATION = 15000;

export function tierLabel(tier: DurationTier): string {
  switch (tier) {
    case 'viral':
      return '바이럴';
    case 'standard':
      return '표준';
    case 'detailed':
      return '상세';
  }
}

export function tierColor(tier: DurationTier): string {
  switch (tier) {
    case 'viral':
      return '#f59e0b';
    case 'standard':
      return '#2f9dff';
    case 'detailed':
      return '#8b5cf6';
  }
}

export function getTierForDuration(ms: number): DurationTier {
  const preset = DURATION_PRESETS.find((p) => p.value === ms);
  if (preset) return preset.tier;
  if (ms <= 15000) return 'viral';
  if (ms <= 22000) return 'standard';
  return 'detailed';
}

export function getPresetForDuration(ms: number): DurationPreset | undefined {
  return DURATION_PRESETS.find((p) => p.value === ms);
}

interface CategoryDurationRecommendation {
  duration: number;
  reason: string;
}

const CATEGORY_DURATION_MAP: Record<string, CategoryDurationRecommendation> = {
  fashion: {
    duration: 18000,
    reason: '패션은 착장 무드를 보여줄 18초 표준이 구매 전환에 가장 효과적입니다.',
  },
  beauty: {
    duration: 18000,
    reason: '뷰티는 제품 질감과 효과를 전달할 18초 표준이 적합합니다.',
  },
  food: {
    duration: 12000,
    reason: '식품은 12초 바이럴로 즉각적인 식욕 자극과 구매 전환이 좋습니다.',
  },
  tech: {
    duration: 15000,
    reason: '테크는 15초 바이럴로 핵심 기능을 빠르게 보여주는 것이 효과적입니다.',
  },
  home: {
    duration: 20000,
    reason: '홈/인테리어는 20초 표준으로 공간 분위기를 충분히 전달하는 것이 좋습니다.',
  },
  kids: {
    duration: 15000,
    reason: '키즈/장난감은 15초 바이럴로 재미와 시선 끌기가 효과적입니다.',
  },
  luxury: {
    duration: 22000,
    reason: '럭셔리는 22초 표준으로 고급스러운 스토리를 전달하는 것이 적합합니다.',
  },
  default: {
    duration: 15000,
    reason: '대부분의 제품은 15초 바이럴 길이가 구매 전환에 가장 효과적입니다.',
  },
};

export function getRecommendedDuration(category: string | null | undefined): CategoryDurationRecommendation {
  const cat = (category ?? '').toLowerCase();
  for (const key of Object.keys(CATEGORY_DURATION_MAP)) {
    if (key === 'default') continue;
    if (cat.includes(key) || matchesKoreanCategory(cat, key)) {
      return CATEGORY_DURATION_MAP[key];
    }
  }
  return CATEGORY_DURATION_MAP.default;
}

function matchesKoreanCategory(cat: string, key: string): boolean {
  const translations = translateCategoryKey(key);
  if (!translations) return false;
  return translations.split('|').some((word) => cat.includes(word));
}

function translateCategoryKey(key: string): string {
  switch (key) {
    case 'fashion':
      return '패션|의류|옷|자켓|셔츠|cloth|apparel';
    case 'beauty':
      return '뷰티|화장품|스킨케어|메이크업|cosmetic|skincare|makeup';
    case 'food':
      return '식품|음식|음료|간식|drink|beverage|snack';
    case 'tech':
      return '테크|전자|가전|스마트폰|휴대폰|electronic|gadget|phone';
    case 'home':
      return '홈|가구|인테리어|조명|램프|furniture|interior|lamp|light';
    case 'kids':
      return '장난감|완구|유아|키즈|toy|kid|fun';
    case 'luxury':
      return '럭셔리|명품|주얼리|시계|프리미엄|jewel|watch|premium';
    default:
      return '';
  }
}
