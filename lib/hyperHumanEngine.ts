import { spinCaption, generateCaptionVariations, type CaptionVariation } from '@/lib/humanLikeEngine';

export type HookType = 'reversal' | 'empathy' | 'selfDeprecating';

export interface HookTemplate {
  type: HookType;
  label: string;
  emoji: string;
  description: string;
  templates: string[];
}

export const HOOK_TEMPLATES: Record<HookType, HookTemplate> = {
  reversal: {
    type: 'reversal',
    label: '반전형',
    emoji: '🔄',
    description: '예상을 깨는 역발상 오프닝으로 호기심 유발',
    templates: [
      '이 제품 절대 사지 마세요. 통장 거덜 납니다',
      '이거 사지 마세요... 아니 꼭 사세요',
      '이거 모르면 손해인데, 알면 더 손해인 제품',
      '처음엔 별거 아닌 줄 알았어요. 큰일 날 뻔',
      '이거 하나 살까 말고, 두 개 사야 하는 이유',
      '이 제품 사면 후회합니다. 안 사면 더 후회해서',
      '이거 추천 안 하려고 했는데... 입막음 당했어요',
      '이거 진짜 별로였어요. 그래서 세 개 더 샀습니다',
    ],
  },
  empathy: {
    type: 'empathy',
    label: '공감 유발형',
    emoji: '🤝',
    description: '일상 경험에 빗대어 공감과 신뢰를 동시에 확보',
    templates: [
      '다들 이런 거 살 때 어떻게 고르세요?',
      '나만 이거 쓰면서 삶이 편해진 거 아니죠?',
      '이거 모르면 손해인 거 아시죠?',
      '누구나 한 번쯤은 이런 거 하나쯤 있어야 한다고 봐요',
      '이거 없이 어떻게 살았나 싶은 게 있어요',
      '사실 저도 이런 거 안 믿는 편이었어요',
      '주변에서 자꾸 물어봐서 아예 여기에 적어요',
      '이거 쓰고 나서 내가 좀 달라졌어요',
    ],
  },
  selfDeprecating: {
    type: 'selfDeprecating',
    label: '자학적 유머형',
    emoji: '😂',
    description: '자기 비하적 유머로 방어벽을 허물고 친밀감 형성',
    templates: [
      '내 지갑은 비었지만 내 방은 채워졌다',
      '이거 살 돈은 있었는데 그 후론 없다',
      '카드 명세서 보다가 울었지만 이거 쓸 땐 웃었다',
      '나를 위한 투자라고 위로하면서 또 샀다',
      '이거 안 사면 돈 아끼는 거지만 사면 행복이다',
      '지갑이 울지만 내 마음은 웃는다',
      '가난뱅이인데 이런 건 꼭 산다',
      '이거 사고 나니까 밥은 굶어도 된다',
    ],
  },
};

export interface HookResult {
  type: HookType;
  hook: string;
  caption: string;
  hashtags: string[];
  variationSeed: number;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateHook(
  type: HookType,
  productName: string,
  originalCaption: string,
  originalHashtags: string[],
): HookResult {
  const template = HOOK_TEMPLATES[type];
  const hook = pick(template.templates);
  const variation = spinCaption(hook, originalCaption, originalHashtags);

  return {
    type,
    hook: variation.hook,
    caption: variation.caption,
    hashtags: variation.hashtags,
    variationSeed: variation.variationSeed,
  };
}

export function generateHookVariations(
  type: HookType,
  productName: string,
  originalCaption: string,
  originalHashtags: string[],
  count: number,
): HookResult[] {
  const results: HookResult[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count * 3 && results.length < count; i++) {
    const result = generateHook(type, productName, originalCaption, originalHashtags);
    const key = result.hook + result.caption.slice(0, 30);
    if (!seen.has(key)) {
      seen.add(key);
      results.push(result);
    }
  }

  while (results.length < count) {
    results.push(generateHook(type, productName, originalCaption, originalHashtags));
  }

  return results;
}

export function generateMultiHookVariations(
  productName: string,
  originalCaption: string,
  originalHashtags: string[],
  countPerType: number = 1,
): { type: HookType; label: string; emoji: string; results: HookResult[] }[] {
  const types: HookType[] = ['reversal', 'empathy', 'selfDeprecating'];
  return types.map((type) => ({
    type,
    label: HOOK_TEMPLATES[type].label,
    emoji: HOOK_TEMPLATES[type].emoji,
    results: generateHookVariations(type, productName, originalCaption, originalHashtags, countPerType),
  }));
}

export function buildHookSystemPrompt(productName: string, hookType: HookType): string {
  const template = HOOK_TEMPLATES[hookType];
  return [
    `[하이퍼 휴머나이즈드 LLM 프롬프트 주입]`,
    `제품명: ${productName}`,
    `후킹 타입: ${template.label} (${template.description})`,
    `참고 오프닝 예시:`,
    ...template.templates.slice(0, 3).map((t) => `  - "${t}"`),
    ``,
    `주의사항:`,
    `- 위 예시를 그대로 복사하지 말고, 제품에 맞게 자연스럽게 변형하세요`,
    `- 마케팅 톤이 아닌 실제 사용자의 구어체로 작성하세요`,
    `- 첫 3초 안에 시청자의 스크롤을 멈추게 하는 후킹이 필수입니다`,
    `- 매번 100% 다른 표현으로 렌더링하세요 (동의어 변형, 구조 변경)`,
  ].join('\n');
}

export function getHookTypeLabel(type: HookType): string {
  return HOOK_TEMPLATES[type].label;
}

export function getHookTypeEmoji(type: HookType): string {
  return HOOK_TEMPLATES[type].emoji;
}
