import { PLATFORM_SPECS, getPlatformSpec, type PlatformSpec, type SafeZoneRect } from '@/lib/platformSpecs';
import { getDisclosureForPlatforms, getDisclosureShortForPlatforms } from '@/lib/disclosure';
import { type EmotionPhase } from '@/lib/psychologyEngine';
import { getBgmTemplateForMood, type BgmCategory } from '@/lib/bgmEngine';
import { aiCachedCall } from '@/lib/aiCache';
import type { ProductVisionResult } from '@/lib/productVision';

export type ContentTone = 'casual' | 'professional' | 'emotional' | 'humorous' | 'studio_premium' | 'raw_trigger';

export type ShortFormPlatform = 'instagram' | 'tiktok' | 'youtube' | 'naver_clip';

interface PlatformMapEntry {
  specKey: Parameters<typeof getPlatformSpec>[0];
  label: string;
}

const PLATFORM_MAP: Record<ShortFormPlatform, PlatformMapEntry> = {
  instagram: { specKey: 'reels', label: '인스타그램 릴스' },
  tiktok: { specKey: 'tiktok', label: '틱톡' },
  youtube: { specKey: 'shorts', label: '유튜브 쇼츠' },
  naver_clip: { specKey: 'naverclip', label: '네이버 클립' },
};

export interface HookOption {
  id: number;
  text: string;
  psychology: string;
  emotion: EmotionPhase;
}

const PSYCHOLOGY_TRIGGERS: Record<EmotionPhase, { label: string; templates: string[] }> = {
  curiosity: {
    label: '정보 갭 자극',
    templates: [
      '이거 모르면 손해인데?',
      '아무도 안 알려주는 진짜 단점',
      '잠깐, 이거 진짜야? 직접 열어봄',
    ],
  },
  shock: {
    label: '손실 회피 역전',
    templates: [
      '지금 안 보면 품절임',
      '이 가격 실화? 매진 직전',
      '이거 모르면 호구 되는 거',
    ],
  },
  empathy: {
    label: '거울 뉴런 활성화',
    templates: [
      '나만 빼고 다 쓰더라',
      '이거 쓰는 사람들 공감 100%',
      '쓰면 진짜 편해서 못 버림',
    ],
  },
  desire: {
    label: '즉각적 보상 추구',
    templates: [
      '귀찮은 거 1초 만에 해결됨',
      '이거 사고 나서 다른 거 다 버렸음',
      '왜 이제야 알았지 진짜',
    ],
  },
  action: {
    label: '사회적 증거 폭발',
    templates: [
      '리뷰 수 폭발 중이라는데',
      '다들 사니까 나도 샀음',
      '실시간 품절 캡처 봄',
    ],
  },
};

export function generateHookOptions(customPrompt: string, productName?: string): HookOption[] {
  const pName = productName?.trim() || '이 제품';
  const nameShort = pName.length > 10 ? pName.slice(0, 10) + '...' : pName;

  const promptLower = customPrompt.toLowerCase();
  let preferredEmotions: EmotionPhase[] = ['curiosity', 'shock', 'desire'];

  if (promptLower.includes('할인') || promptLower.includes('재고') || promptLower.includes('품절')) {
    preferredEmotions = ['shock', 'action', 'desire'];
  } else if (promptLower.includes('공감') || promptLower.includes('일상') || promptLower.includes('꿀템')) {
    preferredEmotions = ['empathy', 'curiosity', 'desire'];
  } else if (promptLower.includes('빠른') || promptLower.includes('해결') || promptLower.includes('꿀팁')) {
    preferredEmotions = ['desire', 'curiosity', 'action'];
  }

  const hooks: HookOption[] = [];
  const usedTexts = new Set<string>();

  for (const emotion of preferredEmotions) {
    const trigger = PSYCHOLOGY_TRIGGERS[emotion];
    for (const template of trigger.templates) {
      if (hooks.length >= 3) break;
      let text = template.replace('이거', nameShort);
      if (!usedTexts.has(text)) {
        usedTexts.add(text);
        hooks.push({
          id: hooks.length + 1,
          text,
          psychology: trigger.label,
          emotion,
        });
      }
    }
  }

  while (hooks.length < 3) {
    const fallbackEmotions: EmotionPhase[] = ['curiosity', 'shock', 'empathy'];
    const emotion = fallbackEmotions[hooks.length];
    const trigger = PSYCHOLOGY_TRIGGERS[emotion];
    const template = trigger.templates[hooks.length % trigger.templates.length];
    const text = template.replace('이거', nameShort);
    if (!usedTexts.has(text)) {
      usedTexts.add(text);
      hooks.push({ id: hooks.length + 1, text, psychology: trigger.label, emotion });
    } else {
      hooks.push({ id: hooks.length + 1, text: `${text}!`, psychology: trigger.label, emotion });
    }
  }

  if (hooks.length === 0) {
    hooks.push({ id: 1, text: `${nameShort} 진짜인지 확인하셈`, psychology: '호기심', emotion: 'curiosity' });
  }

  return hooks.slice(0, 3);
}

export interface DisclosureOverlayPlan {
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
  shortText: string;
  position: 'bottom-center' | 'top-center';
  fontSize: number;
  bgOpacity: number;
}

export interface BgmTemplate {
  id: string;
  label: string;
  mood: string;
  bpm: number;
  highlightStartSec?: number;
  highlightDurationSec?: number;
  energyCurve?: number[];
}

export interface AutoEnhancement {
  id: 'safe_zone_crop' | 'hook_overlay' | 'bgm_sync';
  label: string;
  description: string;
  icon: string;
}

export interface ShortFormEditPlan {
  platform: ShortFormPlatform | string;
  platformLabel: string;
  spec: PlatformSpec | undefined;
  safeZone: SafeZoneRect | undefined;
  totalDurationSec: number;
  hookOptions: HookOption[];
  selectedHook: string | null;
  customPrompt: string;
  segments: EditSegment[];
  disclosureOverlay: DisclosureOverlayPlan;
  disclosureEnabled: boolean;
  captionStyle: string;
  pacingBpm: number;
  bgmTemplate: BgmTemplate;
  autoEnhancements: AutoEnhancement[];
}

export type StoryPhase = 'gaze_hook' | 'need_discovery' | 'transformation' | 'cta_call';

export interface EditSegment {
  index: number;
  startSec: number;
  endSec: number;
  label: string;
  purpose: string;
  textOverlay: string;
  position: 'top' | 'center' | 'bottom';
  storyPhase: StoryPhase;
  narrationCue: string;
  emotionalBenefitText?: string;
  ttsNarrationText?: string;
}

export function getPlatformInfo(platform: ShortFormPlatform | string, customSpec?: PlatformSpec) {
  if (customSpec) {
    const safeZone = { top: customSpec.safeZoneTop, bottom: customSpec.safeZoneBottom, left: customSpec.safeZoneSides, right: customSpec.safeZoneSides };
    return { label: customSpec.label, spec: customSpec, safeZone };
  }
  const entry = PLATFORM_MAP[platform as ShortFormPlatform];
  if (!entry) {
    const spec = getPlatformSpec('reels');
    const safeZone = spec ? { top: spec.safeZoneTop, bottom: spec.safeZoneBottom, left: spec.safeZoneSides, right: spec.safeZoneSides } : undefined;
    return { label: platform, spec, safeZone };
  }
  const spec = getPlatformSpec(entry.specKey);
  const safeZone = spec ? { top: spec.safeZoneTop, bottom: spec.safeZoneBottom, left: spec.safeZoneSides, right: spec.safeZoneSides } : undefined;
  return { label: entry.label, spec, safeZone };
}

const PRODUCT_INTRO_TEMPLATES: Record<EmotionPhase, string[]> = {
  curiosity: ['이게 왜 인기인지 알겠더라', '직접 열어봤는데 진짜임', '처음엔 반신반의했는데 결과가'],
  shock: ['이 가격 실화 맞나요', '품절 전에 확인하셈', '재입고 알림 설정 안 하면 손해'],
  empathy: ['써본 사람만 암', '원래 이런 거 안 믿는데 얘는', '왜 진작 몰랐을까 진짜'],
  desire: ['귀찮은 거 1초 만에 끝남', '이거 하나로 끝이라니', '삶의 질이 확 달라짐'],
  action: ['리뷰 수 폭발 중이라는데', '구매자들 반응이 미쳤음', '실시간 품절 캡처 봄'],
};

const BENEFIT_TEMPLATES: Record<EmotionPhase, string[]> = {
  curiosity: ['직접 확인하면 더 놀라옴', '알면 알수록 좋은 거 맞음', '디테일이 다르긴 다름'],
  shock: ['이 기회 놓치면 다시 없음', '지금이 진짜 최적 타이밍', '선착순이라 빨라야 됨'],
  empathy: ['쓰는 순간 실감함', '매일 쓰는 분들 추천 맞음', '진짜 후기가 말해줌'],
  desire: ['간편하지만 확실한 효과', '이거 하나면 해결됨', '경험해보면 차이 느껴짐'],
  action: ['주문 전에 미리 확인하셈', '누구나 만족하는 선택임', '같이 확인해보셈'],
};

const EMOTIONAL_BENEFIT_TEMPLATES: Record<string, string[]> = {
  jewelry: [
    '데일리 룩에 특별한 무드를 더하는 나만의 시크릿 아이템',
    '어제 입은 옷과 오늘 입은 옷, 차이는 단 하나의 포인트',
    '평범한 일상이 한순간 특별해지는 기분, 그게 이거의 힘',
    '아무 옷이나 입어도 완성되는 건 이 하나가 있어서',
  ],
  fashion: [
    '매일 아침 옷장 앞에서 고민 10분 줄여주는 단 하나의 선택',
    '입는 순간 기분이 달라져요, 오늘 하루가 좀 더 특별하게',
    '아무나 소화할 수 있는데 아무나 못 사는 그 퀄리티',
    '계절이 바뀌어도 계속 손이 가는, 그래서 벌써 인생템',
  ],
  beauty: [
    '쓰는 순간부터 하루가 다르게 느껴지는 피부의 변화',
    '거울 앞에 설 때마다 자신감이 올라가는 그 경험',
    '3초면 끝나는 루틴인데 효과는 하루 종일 가는 비밀',
    '처음엔 반신반의했는데 한 번 쓰면 못 빠져나오는 느낌',
  ],
  home: [
    '집에 들어오는 순간, 오늘 하루의 피로가 녹아내리는 공간',
    '작은 변화 하나가 집 전체의 분위기를 바꾸는 마법',
    '누군가 놀러 왔을 때 자랑하고 싶은 그 포인트',
    '매일 쓰는 거라서 더 아껴야 하는데, 오히려 매일이 특별해짐',
  ],
  tech: [
    '하루에 30분 아껴주는 단 하나의 아이템, 그게 진짜 가성비',
    '귀찮았던 반복 작업이 1초 만에 끝나는 쾌감을 알면 돌아갈 수 없음',
    '처음엔 몰랐는데 쓰고 나서야 알게 된, 삶의 효율이 달라지는 기준점',
    '작은 디테일 하나가 하루의 질을 확 바꿔버림',
  ],
  food: [
    '한 입 베어 무는 순간, 오늘 하루의 스트레스가 녹아내림',
    '매일 먹어도 질리지 않는 그 맛, 그래서 이미 인생템',
    '평범한 한 끼가 특별해지는 순간, 그게 이거의 힘',
    '처음 맛본 그 감동을 매일 다시 느끼는 소확행',
  ],
  default: [
    '데일리 룩에 특별한 무드를 더하는 나만의 시크릿 아이템',
    '쓰는 순간 실감, 왜 진작 몰랐을까 하는 아쉬움',
    '하루의 작은 기준이 바뀌는 경험, 그게 이거의 진짜 가치',
    '없을 때는 몰랐는데 있고 나니 다르게 느껴지는 하루',
  ],
};

const TTS_NARRATION_TEMPLATES: Record<string, string[]> = {
  jewelry: [
    '이거 하나만 있으면, 평범한 날도 반짝이는 날이 됩니다. 진짜 그런 거예요.',
    '매일 아침, 거울 앞에서 이걸 착용하는 순간, 오늘 하루의 시작이 달라 보여요.',
    '어떤 옷을 입든, 이 하나면 나만의 분위기가 완성돼요. 한 번쯤 경험해 보세요.',
  ],
  fashion: [
    '아침마다 옷장 앞에서 10분 고민하던 게, 이걸 입으면 끝나요. 그게 진짜 혁신이에요.',
    '입는 순간 기분이 바뀌어요. 옷이 사람을 입는 게 아니라, 사람이 옷을 입는 느낌.',
    '계절이 바뀌어도 계속 손이 가요. 그게 진짜 인생템의 조건 아닐까요?',
  ],
  beauty: [
    '거울 앞에 설 때마다 달라진 피부를 보면, 그게 진짜 자신감이에요.',
    '3초면 끝나는 루틴인데 효과는 하루 종일. 바쁜 아침에 이거면 충분해요.',
    '한 번 쓰고 나면 다른 걸로 돌아가기 힘들어요. 그 정도로 확 다릅니다.',
  ],
  home: [
    '집에 들어오는 순간, 공간이 달라 보여요. 하루의 피로가 녹아내리는 그 기분.',
    '작은 변화 하나인데, 집 전체의 분위기가 바뀌어요. 그게 이거의 매력이에요.',
    '매일 쓰는 거라 더 특별해요. 일상이 곧 힐링이 되는 공간.',
  ],
  tech: [
    '하루에 30분을 아껴줘요. 그 30분이 모이면 한 달에 15시간이에요.',
    '귀찮았던 반복 작업이 1초 만에 끝나요. 이걸 경험하면 돌아갈 수 없어요.',
    '작은 디테일 하나가 하루의 질을 바꿔요. 그게 진짜 기술의 힘이에요.',
  ],
  food: [
    '한 입 베어 무는 순간, 오늘 하루의 스트레스가 녹아내려요. 진짜예요.',
    '매일 먹어도 질리지 않아요. 그래서 이미 제 인생템이 됐어요.',
    '평범한 한 끼가 특별해지는 순간. 그게 이거의 힘이에요.',
  ],
  default: [
    '데일리 룩에 특별한 무드를 더하는 나만의 시크릿 아이템, 한 번 경험해 보세요.',
    '없을 때는 몰랐는데, 있고 나니 하루가 다르게 느껴져요. 그게 진짜 가치예요.',
    '쓰는 순간 왜 진작 몰랐을까 하는 아쉬움. 그만큼 삶이 달라져요.',
  ],
};

function detectBenefitCategory(category: string, productName: string, vision: ProductVisionResult | undefined): string {
  const hint = `${category} ${productName} ${vision?.materialGuess ?? ''} ${vision?.textureDescription ?? ''}`.toLowerCase();
  if (hint.includes('다이아') || hint.includes('보석') || hint.includes('주얼') || hint.includes('necklace') || hint.includes('ring') || hint.includes('diamond') || hint.includes('jewel') || hint.includes('크리스탈')) return 'jewelry';
  if (hint.includes('의류') || hint.includes('옷') || hint.includes('신발') || hint.includes('fashion') || hint.includes('silk') || hint.includes('leather') || hint.includes('dress') || hint.includes('가죽') || hint.includes('실크')) return 'fashion';
  if (hint.includes('뷰티') || hint.includes('화장') || hint.includes('스킨') || hint.includes('beauty') || hint.includes('cosmetic')) return 'beauty';
  if (hint.includes('홈') || hint.includes('인테리어') || hint.includes('가구') || hint.includes('home') || hint.includes('조명') || hint.includes('living')) return 'home';
  if (hint.includes('테크') || hint.includes('전자') || hint.includes('가전') || hint.includes('tech') || hint.includes('gadget') || hint.includes('it')) return 'tech';
  if (hint.includes('식품') || hint.includes('먹거리') || hint.includes('카페') || hint.includes('food') || hint.includes('디저트')) return 'food';
  return 'default';
}

function pickEmotionalBenefit(benefitCategory: string, emotion: EmotionPhase, seed: number): string {
  const pool = EMOTIONAL_BENEFIT_TEMPLATES[benefitCategory] ?? EMOTIONAL_BENEFIT_TEMPLATES.default;
  return pool[seed % pool.length];
}

function pickTtsNarration(benefitCategory: string, seed: number): string {
  const pool = TTS_NARRATION_TEMPLATES[benefitCategory] ?? TTS_NARRATION_TEMPLATES.default;
  return pool[seed % pool.length];
}

const CTA_TEMPLATES: Record<EmotionPhase, string[]> = {
  curiosity: [
    '🛍️ 프로필 링크에서 지금 바로 확인하세요',
    '지금 당장 프로필 링크 눌러서 보세요',
    '이거 진짜였음 — 프로필 링크에서 만나보세요',
  ],
  shock: [
    '🛍️ 프로필 링크에서 오늘만 이 가격으로 만나보세요',
    '품절 전에 프로필 링크에서 지금 바로 담으세요',
    '이 가격 유지되는 동안 프로필 링크에서 가져가세요',
  ],
  empathy: [
    '🛍️ 프로필 링크에서 직접 경험해 보세요',
    '같은 고민이라면 프로필 링크에서 지금 확인하세요',
    '프로필 링크에 남겨둔 거 지금 바로 보세요',
  ],
  desire: [
    '🛍️ 프로필 링크에서 오늘 만나보세요',
    '지금 프로필 링크 누르면 바로 시작할 수 있어요',
    '프로필 링크에서 차이를 직접 경험하세요',
  ],
  action: [
    '🛍️ 프로필 링크에서 지금 바로 가져가세요',
    '프로필 링크 누르면 1초 만에 만날 수 있어요',
    '지금이 진짜 최적 타이밍 — 프로필 링크에서 확인하세요',
  ],
};

export interface StoryNarrative {
  gazeHook: string;
  needDiscovery: string;
  transformation: string;
  ctaCall: string;
  narrationCues: {
    gazeHook: string;
    needDiscovery: string;
    transformation: string;
    ctaCall: string;
  };
}

const STORY_GAZE_HOOKS: string[] = [
  '스마트폰으로 대충 찍은 거 솔직 공개',
  '언박싱하다가 손 떨린 거 진짜임',
  '이거 쓰는 거 촬영하는데 충격받음',
  '잠깐, 이거 진짜야? 직접 열어봄',
];

const STORY_NEED_DISCOVERY: string[] = [
  '원래 이런 거 안 믿는데 얘는 다름',
  '일상에서 진짜 불편했던 거 해결됨',
  '이거 없을 때 vs 있을 때 차이가 미쳤음',
  '귀찮은 거 1초 만에 해결되는 거 실화',
];

const STORY_TRANSFORMATION: string[] = [
  '쓰고 나서 다른 거 다 버렸음',
  '이거 사고 나서 삶이 확 달라짐',
  '돌아갈 수 없는 진짜 갓템',
  '왜 진작 몰랐을까 진짜',
];

const STORY_CTA: string[] = [
  '🛍️ 프로필 링크에서 오늘만 이 가격으로 만나보세요',
  '지금 프로필 링크 누르면 바로 만날 수 있어요',
  '프로필 링크에서 직접 경험하세요 — 지금 바로',
  '🛍️ 프로필 링크에서 지금 바로 가져가세요',
];

const TONE_STORY_OVERRIDES: Record<string, {
  gazeHooks: string[];
  needDiscovery: string[];
  transformation: string[];
  cta: string[];
}> = {
  studio_premium: {
    gazeHooks: [
      '정교한 디테일을 가까이에서 확인해 보세요',
      '시그니처 디자인, 그 존재감을 직접 느껴보세요',
      '섬세한 마감이 말해주는 품질의 기준',
    ],
    needDiscovery: [
      '일상의 한 끝을 완성하는 한 가지',
      '평범한 하루에 우아함을 더하는 선택',
      '같은 것도 다르게, 그 차이를 경험하세요',
    ],
    transformation: [
      '그 한 가지가 만든 격이 다른 일상',
      '품격 있는 라이프스타일의 시작',
      '선택이 달라지면 하루가 달라집니다',
    ],
    cta: [
      '🛍️ 프로필 링크에서 지금 바로 경험해 보세요',
      '더 섬세한 일상을 원하신다면, 프로필 링크에서 지금 확인하세요',
      '🛍️ 프로필 링크에서 오늘, 이 경험을 직접 만나보세요',
    ],
  },
  raw_trigger: {
    gazeHooks: [
      '왜 다들 이걸 찾는지 알겠더라고요',
      '이거 쓰는 사람들 진짜 있어요? 후기 공유',
      '솔직히 말하면 이거 없으면 손해인 거',
    ],
    needDiscovery: [
      '왜 다들 이걸 찾는지 알겠더라고요',
      '이거 쓰기 전에 이런 거 몰랐던 거 실화?',
      '이거 안 쓰면 손해인 이유, 진짜임',
    ],
    transformation: [
      '왜 다들 이걸 찾는지 알겠더라고요',
      '이거 사고 나서 진짜 달라짐, 실화',
      '이거 쓰는 사람들 리얼 후기 맞음',
    ],
    cta: [
      '🛍️ 프로필 링크에서 지금 바로 가져가세요',
      '이거 진짜였음 — 프로필 링크 남겨둘게요, 지금 보세요',
      '🛍️ 프로필 링크에서 오늘만 이 가격으로 만나보세요',
    ],
  },
};

const TONE_BENEFIT_OVERRIDES: Record<string, Record<string, string[]>> = {
  studio_premium: {
    jewelry: [
      '섬세한 광택이 일상에 우아함을 더하는 한 가지',
      '어떤 순간에도 격을 잃지 않는, 당신만의 시그니처',
    ],
    fashion: [
      '편안함과 품격을 동시에, 그래서 매일 선택하는 옷',
      '계절이 바뀌어도 변하지 않는 당신의 기준',
    ],
    beauty: [
      '매일 아침, 거울 앞에서 만나는 더 나은 피부',
      '3초의 시간으로 하루의 자신감을 완성하는 우아함',
    ],
    home: [
      '공간이 품는 따뜻함, 일상이 쉼이 되는 곳',
      '섬세한 디테일이 만드는 격이 다른 인테리어',
    ],
    tech: [
      '여유로워진 하루, 그것이 진짜 기술이 주는 가치',
      '불필요한 시간을 줄이고, 중요한 순간에 집중하게',
    ],
    food: [
      '한 입의 감동, 일상이 특별해지는 순간',
      '매일 맛봐도 질리지 않는, 그래서 인생템',
    ],
    default: [
      '섬세한 경험이 일상의 기준을 높입니다',
      '품격 있는 선택, 그 차이를 경험하세요',
    ],
  },
  raw_trigger: {
    jewelry: [
      '왜 다들 이걸 찾는지 알겠더라고요, 진짜 예쁨',
      '이거 하나면 아무 옷이나 입어도 완성됨, 실화',
    ],
    fashion: [
      '왜 다들 이걸 찾는지 알겠더라고요, 핏이 미쳤음',
      '아침마다 옷장 앞에서 10분 고민하던 게 끝남',
    ],
    beauty: [
      '왜 다들 이걸 찾는지 알겠더라고요, 피부가 달라짐',
      '이거 쓰는 사람들 진짜 있어요? 후기 공유',
    ],
    home: [
      '왜 다들 이걸 찾는지 알겠더라고요, 집이 달라 보임',
      '이거 사고 나서 집에 들어오는 게 좋아짐, 진짜',
    ],
    tech: [
      '왜 다들 이걸 찾는지 알겠더라고요, 시간 아껴줌',
      '이거 안 쓰면 손해인 거, 진짜임',
    ],
    food: [
      '왜 다들 이걸 찾는지 알겠더라고요, 진짜 맛있음',
      '이거 먹고 나서 다른 거 못 먹겠더라고요',
    ],
    default: [
      '왜 다들 이걸 찾는지 알겠더라고요, 진짜임',
      '이거 안 쓰면 손해인 거, 링크 남겨둘게요',
    ],
  },
};

const TONE_TTS_OVERRIDES: Record<string, Record<string, string[]>> = {
  studio_premium: {
    default: [
      '섬세한 경험이 일상의 기준을 높입니다. 한 번 경험해 보시기를 권합니다.',
      '품격 있는 선택이 만드는 차이, 그것을 직접 느껴보세요.',
    ],
  },
  raw_trigger: {
    default: [
      '왜 다들 이걸 찾는지 알겠더라고요. 진짜 그런 거예요.',
      '이거 안 쓰면 손해인 거, 진짜임. 한 번 써보세요.',
    ],
  },
};

function applyToneToStory(story: StoryNarrative, tone: ContentTone): StoryNarrative {
  const overrides = TONE_STORY_OVERRIDES[tone];
  if (!overrides) return story;
  const pick = (pool: string[], original: string) => pool[Math.abs(original.length) % pool.length] || original;
  return {
    ...story,
    gazeHook: pick(overrides.gazeHooks, story.gazeHook),
    needDiscovery: pick(overrides.needDiscovery, story.needDiscovery),
    transformation: pick(overrides.transformation, story.transformation),
    ctaCall: pick(overrides.cta, story.ctaCall),
  };
}

function applyToneToBenefit(benefit: string, tts: string, tone: ContentTone, benefitCategory: string, seed: number): { benefit: string; tts: string } {
  const benefitOverrides = TONE_BENEFIT_OVERRIDES[tone];
  const ttsOverrides = TONE_TTS_OVERRIDES[tone];
  let adjustedBenefit = benefit;
  let adjustedTts = tts;
  if (benefitOverrides) {
    const pool = benefitOverrides[benefitCategory] ?? benefitOverrides.default;
    if (pool && pool.length > 0) adjustedBenefit = pool[seed % pool.length];
  }
  if (ttsOverrides) {
    const pool = ttsOverrides[benefitCategory] ?? ttsOverrides.default;
    if (pool && pool.length > 0) adjustedTts = pool[seed % pool.length];
  }
  return { benefit: adjustedBenefit, tts: adjustedTts };
}

const NARRATION_CUES = {
  gazeHook: 'VO: 스마트폰으로 대충 찍은 듯한 거친 비주얼로 시작 — 0~3초, 언박싱 또는 실제 사용 환경으로 경계심 허물기. 자연스러운 구어체로 손실 회피 자극 멘트',
  needDiscovery: 'VO: 일상의 불편함 폭로 — 3~7초, 치명적인 귀찮음 해결 시연. ASMR 요소 활용, 실용적 효용 1초 만에 보여주기',
  transformation: 'VO: 사용 후 변화 — 7~11초, before/after 비교로 압도적 시간/비용 절감 효과. 디테일 클로즈업, 구매자 리액션 삽입',
  ctaCall: 'VO: 행동 지향 CTA — 11~15초, "🛍️ 프로필 링크에서 오늘만 이 가격으로 만나보세요" 식 직접적 행동 지시. 구체적 액션(지금 바로, 프로필 링크, 오늘만) 명시, CTA 자막 번인',
};

function pickStoryText(pool: string[], productHint: string): string {
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx].replace('이 제품', productHint).replace('이거', productHint);
}

function buildStoryNarrative(
  hook: string,
  emotion: EmotionPhase,
  productName?: string,
): StoryNarrative {
  const pName = productName?.trim() || '';
  const productHint = pName.length > 8 ? pName.slice(0, 8) + '...' : pName || '이 제품';

  return {
    gazeHook: hook || pickStoryText(STORY_GAZE_HOOKS, productHint),
    needDiscovery: pickStoryText(STORY_NEED_DISCOVERY, productHint),
    transformation: pickStoryText(STORY_TRANSFORMATION, productHint),
    ctaCall: pickStoryText(STORY_CTA, productHint),
    narrationCues: NARRATION_CUES,
  };
}

function pickTemplate(
  pool: Record<EmotionPhase, string[]>,
  emotion: EmotionPhase,
  customPrompt: string,
  productHint: string,
): string {
  const promptTrim = customPrompt.trim();
  if (promptTrim) {
    const shortPrompt = promptTrim.split(/[,.]/)[0].trim();
    if (shortPrompt.length >= 4 && shortPrompt.length <= 24) {
      return shortPrompt;
    }
  }
  const templates = pool[emotion];
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx].replace('이거', productHint);
}

function buildSegmentTexts(
  hook: string,
  hookOptions: HookOption[],
  customPrompt: string,
  productName?: string,
): { intro: string; benefit: string; cta: string } {
  const matchedHook = hookOptions.find((h) => h.text === hook);
  const emotion: EmotionPhase = matchedHook?.emotion ?? 'curiosity';
  const pName = productName?.trim() || '';
  const productHint = pName.length > 8 ? pName.slice(0, 8) + '...' : pName || '이 제품';

  const intro = pName || customPrompt.trim()
    ? pName || pickTemplate(PRODUCT_INTRO_TEMPLATES, emotion, customPrompt, productHint)
    : pickTemplate(PRODUCT_INTRO_TEMPLATES, emotion, customPrompt, productHint);

  const benefit = pickTemplate(BENEFIT_TEMPLATES, emotion, customPrompt, productHint);
  const cta = pickTemplate(CTA_TEMPLATES, emotion, '', productHint);

  return { intro, benefit, cta };
}

export function buildShortFormEditPlan(
  platform: ShortFormPlatform | string,
  customPrompt: string,
  selectedHook: string | null,
  productName?: string,
  affiliatePlatforms: string[] = [],
  autoDisclosure = true,
  disclosureEnabled = false,
  customSpec?: PlatformSpec,
  bgmOverride?: { templateId: string; label: string; mood: string; bpm: number; reason?: string; highlightStartSec?: number; highlightDurationSec?: number; energyCurve?: number[] },
  productVision?: ProductVisionResult,
  contentTone?: ContentTone,
): ShortFormEditPlan {
  return computeEditPlan(platform, customPrompt, selectedHook, productName, affiliatePlatforms, autoDisclosure, disclosureEnabled, customSpec, bgmOverride, productVision, contentTone);
}

export async function buildShortFormEditPlanCached(
  platform: ShortFormPlatform | string,
  customPrompt: string,
  selectedHook: string | null,
  productName?: string,
  affiliatePlatforms: string[] = [],
  autoDisclosure = true,
  disclosureEnabled = false,
  customSpec?: PlatformSpec,
  bgmOverride?: { templateId: string; label: string; mood: string; bpm: number; reason?: string; highlightStartSec?: number; highlightDurationSec?: number; energyCurve?: number[] },
  productVision?: ProductVisionResult,
  contentTone?: ContentTone,
): Promise<ShortFormEditPlan> {
  const cacheInput: Record<string, unknown> = {
    platform,
    customPrompt,
    selectedHook,
    productName: productName || '',
    affiliatePlatforms: [...affiliatePlatforms].sort(),
    autoDisclosure,
    disclosureEnabled,
    bgmOverride: bgmOverride ? JSON.stringify(bgmOverride) : '',
    productVisionCategory: productVision?.productCategory ?? '',
    contentTone: contentTone ?? 'casual',
  };
  const { data } = await aiCachedCall<ShortFormEditPlan>(
    'edit-plan',
    cacheInput,
    () => Promise.resolve(computeEditPlan(platform, customPrompt, selectedHook, productName, affiliatePlatforms, autoDisclosure, disclosureEnabled, customSpec, bgmOverride, productVision, contentTone)),
    'local-heuristic',
  );
  return data;
}

function computeEditPlan(
  platform: ShortFormPlatform | string,
  customPrompt: string,
  selectedHook: string | null,
  productName?: string,
  affiliatePlatforms: string[] = [],
  autoDisclosure = true,
  disclosureEnabled = false,
  customSpec?: PlatformSpec,
  bgmOverride?: { templateId: string; label: string; mood: string; bpm: number; reason?: string; highlightStartSec?: number; highlightDurationSec?: number; energyCurve?: number[] },
  productVision?: ProductVisionResult,
  contentTone: ContentTone = 'casual',
): ShortFormEditPlan {
  const { label, spec, safeZone } = getPlatformInfo(platform, customSpec);
  const totalDurationSec = 15;
  const hookOptions = generateHookOptions(customPrompt, productName);
  const fallbackHook = hookOptions[0]?.text || '이거 보면 무조건 클릭';
  const hook = selectedHook || fallbackHook;
  const matchedHook = hookOptions.find((h) => h.text === hook);
  const emotion: EmotionPhase = matchedHook?.emotion ?? 'curiosity';
  const story = applyToneToStory(buildStoryNarrative(hook, emotion, productName), contentTone);
  const segmentTexts = buildSegmentTexts(hook, hookOptions, customPrompt, productName);

  const productCategory = productVision?.productCategory ?? '';
  const benefitCategory = detectBenefitCategory(productCategory, productName ?? '', productVision);
  const benefitSeed = Math.abs((productName ?? '').length + (customPrompt ?? '').length) % 4;
  const rawBenefit = pickEmotionalBenefit(benefitCategory, emotion, benefitSeed);
  const rawTts = pickTtsNarration(benefitCategory, benefitSeed);
  const { benefit: emotionalBenefit, tts: ttsNarration } = applyToneToBenefit(rawBenefit, rawTts, contentTone, benefitCategory, benefitSeed);
  const visionFeatureHint = productVision?.visualFeatures?.slice(0, 2).join(' · ') ?? '';

  const segments: EditSegment[] = [
    {
      index: 0,
      startSec: 0,
      endSec: 3,
      label: '시선 포착',
      purpose: '상위 1% 후킹: 0~3초 시선 강탈, 화면 전환 없음, 오디오 빌드업으로 이탈 방지',
      textOverlay: story.gazeHook,
      position: 'center',
      storyPhase: 'gaze_hook',
      narrationCue: story.narrationCues.gazeHook,
    },
    {
      index: 1,
      startSec: 3,
      endSec: 7,
      label: '서사 전개',
      purpose: '왜 이 제품이 필요한지 리얼리티 서사로 연결, 다각도 입체 컷 전환',
      textOverlay: story.needDiscovery,
      position: 'top',
      storyPhase: 'need_discovery',
      narrationCue: story.narrationCues.needDiscovery,
      emotionalBenefitText: emotionalBenefit,
      ttsNarrationText: ttsNarration,
    },
    {
      index: 2,
      startSec: 7,
      endSec: 11,
      label: '변화·몰입',
      purpose: '사용 후 일상적 변화를 감성적으로 전달, 디테일 클로즈업 전환',
      textOverlay: visionFeatureHint || story.transformation,
      position: 'center',
      storyPhase: 'transformation',
      narrationCue: story.narrationCues.transformation,
      emotionalBenefitText: emotionalBenefit,
      ttsNarrationText: ttsNarration,
    },
    {
      index: 3,
      startSec: 11,
      endSec: 13,
      label: 'CTA',
      purpose: '시청자를 향한 직접적 행동 유도, 감정 최고점에서 클로징',
      textOverlay: disclosureEnabled ? story.ctaCall : segmentTexts.cta,
      position: 'bottom',
      storyPhase: 'cta_call',
      narrationCue: story.narrationCues.ctaCall,
    },
  ];

  const disclosureText = getDisclosureForPlatforms(affiliatePlatforms, autoDisclosure && disclosureEnabled);
  const disclosureShort = getDisclosureShortForPlatforms(affiliatePlatforms, autoDisclosure && disclosureEnabled);

  const disclosureOverlay: DisclosureOverlayPlan = {
    startSec: 13,
    endSec: 15,
    durationSec: 2,
    text: disclosureEnabled ? (disclosureText || '본 영상은 광고/협찬/업체 지원을 받아 제작되었습니다.') : '',
    shortText: disclosureEnabled ? (disclosureShort || '광고·협찬 포함') : '',
    position: 'bottom-center',
    fontSize: 14,
    bgOpacity: 0.75,
  };

  const pacingBpm = platform === 'tiktok' ? 140 : platform === 'youtube' ? 90 : platform === 'naver_clip' ? 110 : 100;

  const bgmTemplate: BgmTemplate = (() => {
    if (bgmOverride) {
      return {
        id: bgmOverride.templateId,
        label: bgmOverride.label,
        mood: bgmOverride.mood,
        bpm: bgmOverride.bpm,
        highlightStartSec: bgmOverride.highlightStartSec,
        highlightDurationSec: bgmOverride.highlightDurationSec,
        energyCurve: bgmOverride.energyCurve,
      };
    }
    const promptLower = customPrompt.toLowerCase();
    if (promptLower.includes('의류') || promptLower.includes('신발') || promptLower.includes('런칭') || promptLower.includes('새제품') || promptLower.includes('패션')) {
      return getBgmTemplateForMood('하이텐션');
    }
    if (promptLower.includes('카페') || promptLower.includes('베이커리') || promptLower.includes('소품') || promptLower.includes('힐링') || promptLower.includes('일상')) {
      return getBgmTemplateForMood('로파이');
    }
    if (promptLower.includes('수제') || promptLower.includes('디저트') || promptLower.includes('자연') || promptLower.includes('친환경') || promptLower.includes('따뜻')) {
      return getBgmTemplateForMood('감성');
    }
    if (promptLower.includes('할인') || promptLower.includes('재고') || promptLower.includes('매진') || promptLower.includes('품절') || promptLower.includes('꿀팁') || promptLower.includes('해결')) {
      return getBgmTemplateForMood('하이텐션');
    }
    return getBgmTemplateForMood('하이텐션');
  })();

  const autoEnhancements: AutoEnhancement[] = [
    {
      id: 'safe_zone_crop',
      label: '안전지대 9:16 자동 크롭',
      description: '플랫폼 규격에 맞춰 불필요한 여백 제거, 화면 중심 자동 정렬',
      icon: 'crop',
    },
    {
      id: 'hook_overlay',
      label: '후킹 자막 오버레이',
      description: '날것 영상 위에 트렌디 폰트 + 심리학적 후킹 문구 자동 얹기',
      icon: 'type',
    },
    {
      id: 'bgm_sync',
      label: 'BGM 템플릿 싱크',
      description: 'AI 이미지 분석 기반 실제 음악 트랙 카테고리 자동 매칭 + 핵심 구간 추출 싱크',
      icon: 'music',
    },
  ];

  const captionStyle = platform === 'tiktok'
    ? '대담한 산세리프, 중앙 대형, 2줄 이내'
    : platform === 'instagram'
    ? '우아한 산세리프, 하단 배치, 그라데이션'
    : platform === 'youtube'
    ? '굵은 산세리프, 상단 배치, 고대비'
    : '굵은 산세리프, 하단 배치, 한국어 가독성 우선';

  return {
    platform,
    platformLabel: label,
    spec,
    safeZone,
    totalDurationSec,
    hookOptions,
    selectedHook: hook,
    customPrompt,
    segments,
    disclosureOverlay,
    disclosureEnabled,
    captionStyle,
    pacingBpm,
    bgmTemplate,
    autoEnhancements,
  };
}

export interface MultiAngleFusionResult {
  primaryBase64: string;
  additionalBase64s: string[];
  spatialDepthHint: string;
  fusionStrategy: 'five_angle_stereo' | 'three_angle_partial' | 'single_fallback';
}

export function describeMultiAngleFusion(shotCount: number): MultiAngleFusionResult | null {
  if (shotCount >= 5) {
    return {
      primaryBase64: '',
      additionalBase64s: [],
      spatialDepthHint: '정면·좌측·우측·후면·상부 5각도 입체 융합',
      fusionStrategy: 'five_angle_stereo',
    };
  }
  if (shotCount >= 3) {
    return {
      primaryBase64: '',
      additionalBase64s: [],
      spatialDepthHint: `${shotCount}각도 부분 입체 융합`,
      fusionStrategy: 'three_angle_partial',
    };
  }
  return null;
}

export interface RetentionFormula {
  hookDurationSec: number;
  cutIntervalSec: number;
  rhythmPattern: 'rapid' | 'medium' | 'slow';
  techniques: string[];
}

export function getRetentionFormula(platform: ShortFormPlatform | string): RetentionFormula {
  const isTikTok = platform === 'tiktok';
  const isYouTube = platform === 'youtube';
  return {
    hookDurationSec: 3,
    cutIntervalSec: isTikTok ? 1.5 : isYouTube ? 2.5 : 2,
    rhythmPattern: isTikTok ? 'rapid' : isYouTube ? 'medium' : 'medium',
    techniques: [
      '초반 3초 훅: 시청자 이탈 방지',
      '사용 맥락 중심 다이내믹 컷 전환: 몰입 유지',
      '시각적 리듬감 부여: BGM 비트에 맞춘 전환',
    ],
  };
}

export function getAvailablePlatforms(): { key: ShortFormPlatform; label: string; spec: PlatformSpec | undefined }[] {
  return (Object.keys(PLATFORM_MAP) as ShortFormPlatform[]).map((key) => {
    const { label, spec } = getPlatformInfo(key);
    return { key, label, spec };
  });
}

export { PLATFORM_SPECS };
