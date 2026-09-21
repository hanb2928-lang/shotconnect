export type VoiceCategory = 'trendy_beauty' | 'professional' | 'emotional' | 'high_energy' | 'chic_smart' | 'friendly_casual' | 'authoritative' | 'trendy_hype' | 'calm_documentarian' | 'analytical_tech' | 'witty_casual' | 'energetic_leader';

export interface TtsVoice {
  key: string;
  label: string;
  gender: 'male' | 'female';
  style: 'shopping' | 'announcer';
  category: VoiceCategory;
  desc: string;
  openaiVoice: string;
  speed: number;
  instructions?: string;
  ageRange: string;
  toneTags: string[];
  optimalProducts: string[];
  tempoProfile: string;
  emotionLine: string;
}

export const VOICE_CATEGORIES: Record<string, { label: string; desc: string }> = {
  trendy_beauty: { label: '트렌디 뷰티', desc: '밝고 세련된 고음역대 — 뷰티·패션·인테리어' },
  professional: { label: '신뢰의 프로', desc: '안정감 있는 중저음 — IT·건강·스마트가전' },
  emotional: { label: '감성 에세이', desc: '여운 있는 호흡 — 브랜드 스토리텔링·감성 소품' },
  high_energy: { label: '하이텐션 꿀팁', desc: '속사포 빠른 템포 — 공구·할인·자취 꿀템' },
  chic_smart: { label: '지적인 커리어우먼', desc: '똑부러지는 명확 발음 — 오피스룩·자기계발·프리미엄' },
  friendly_casual: { label: '친근한 동네언니', desc: '수다 떨듯 편안한 호흡 — 일상 밀착형·내돈내산' },
  authoritative: { label: '신뢰감 있는 전문가', desc: '묵직한 저음 — 자동차·프리미엄 IT·전문 리뷰' },
  trendy_hype: { label: '트렌디 숏폼 호스트', desc: '에너지 넘치는 힙한 텐션 — 틱톡/릴스 메인 훅' },
  calm_documentarian: { label: '차분한 내레이터', desc: '다큐 성우급 깊은 호흡 — 프리미엄 브랜드 철학' },
  analytical_tech: { label: '팩트체크 리뷰어', desc: '깔끔한 스펙 짚어주기 — 가젯·스펙 비교·기능 설명' },
  witty_casual: { label: '유쾌한 스마트보이', desc: '장난기 어린 위트 — 유머러스 반전 훅·캐주얼' },
  energetic_leader: { label: '다부진 리더', desc: '의욕 고취 강한 확신 — 운동용품·건강보조·아웃도어' },
};

export const TTS_VOICES: TtsVoice[] = [
  // ── 여성 성우 프로필 (F1~F6) ──────────────────────────────────────────
  {
    key: 'f1_trendy_beauty',
    label: '트렌디 뷰티',
    gender: 'female',
    style: 'shopping',
    category: 'trendy_beauty',
    desc: '밝고 세련된 고음역대 텐션. 뷰티, 패션, 인테리어 등 시각적 쾌감이 중요한 제품에 최적화.',
    openaiVoice: 'shimmer',
    speed: 1.12,
    instructions: 'Speak in a bright, chic, energetic tone like a trendy beauty influencer in her late 20s. Use a slightly elevated pitch with natural upward inflections. Sound polished but genuinely excited about visual aesthetics.',
    ageRange: '20대 후반',
    toneTags: ['밝음', '세련됨', '고음역대', '텐션'],
    optimalProducts: ['뷰티', '패션', '인테리어', '화장품', '의류'],
    tempoProfile: '중빠름 (1.12x) — 훅 구간 가속, 베네핏 구간 감속',
    emotionLine: '호기심 → 설렘 → 만족 → 행동 촉구',
  },
  {
    key: 'f2_professional',
    label: '신뢰의 프로',
    gender: 'female',
    style: 'announcer',
    category: 'professional',
    desc: '안정감 있고 차분한 중저음 톤. IT 테크, 건강식품, 스마트 가전 등 논리적 설득이 필요한 컷에 적합.',
    openaiVoice: 'shimmer',
    speed: 0.95,
    instructions: 'Speak in a calm, stable, mid-low pitch tone like a professional female reviewer in her 30s. Convey expertise and trustworthiness. Every claim should sound evidence-based and measured.',
    ageRange: '30대',
    toneTags: ['차분함', '중저음', '신뢰감', '논리적'],
    optimalProducts: ['IT 테크', '건강식품', '스마트가전', '전자기기'],
    tempoProfile: '중간 (0.95x) — 일정한 속도 유지, 핵심 포인트에서 미세 감속',
    emotionLine: '문제 제기 → 분석 → 신뢰 형성 → 합리적 추천',
  },
  {
    key: 'f3_emotional',
    label: '감성 에세이',
    gender: 'female',
    style: 'announcer',
    category: 'emotional',
    desc: '여운을 주는 호흡과 따뜻한 뉘앙스. 브랜드 스토리텔링 및 감성 소품 리뷰에 특화.',
    openaiVoice: 'shimmer',
    speed: 0.88,
    instructions: 'Speak in a warm, lingering, emotionally resonant tone like a narrator for a brand story. Use slower pacing with meaningful pauses. Let each sentence breathe and convey genuine feeling.',
    ageRange: '30대',
    toneTags: ['따뜻함', '여운', '호흡감', '감성'],
    optimalProducts: ['감성소품', '브랜드스토리', '핸드메이드', '자연친화'],
    tempoProfile: '느림 (0.88x) — 긴 호흡, 문장 간 0.4초 휴지',
    emotionLine: '도입 → 공감 → 감정 고조 → 여운',
  },
  {
    key: 'f4_high_energy',
    label: '하이텐션 꿀팁',
    gender: 'female',
    style: 'shopping',
    category: 'high_energy',
    desc: '속사포처럼 정보를 꽂아 넣는 빠른 템포와 톡톡 튀는 억양. 공구, 할인 혜택, 자취 꿀템 소개용.',
    openaiVoice: 'alloy',
    speed: 1.22,
    instructions: 'Speak in a rapid-fire, high-energy tone like a tips-sharing influencer. Use bouncy, punchy intonation. Deliver information at machine-gun speed while keeping every word clear. Add excitement on deals and discounts.',
    ageRange: '20대',
    toneTags: ['속사포', '빠른템포', '톡톡튀는억양', '하이텐션'],
    optimalProducts: ['공구', '할인혜택', '자취꿀템', '가성비', '생활용품'],
    tempoProfile: '빠름 (1.22x) — 전 구간 고속, 훅에서 최대 텐션',
    emotionLine: '긴급성 → 꿀팁 폭격 → 혜택 강조 → 즉시 행동',
  },
  {
    key: 'f5_chic_smart',
    label: '지적인 커리어우먼',
    gender: 'female',
    style: 'announcer',
    category: 'chic_smart',
    desc: '똑부러지고 명확한 발음, 당당한 톤앤매너. 오피스룩, 자기계발서, 프리미엄 제품군에 어울림.',
    openaiVoice: 'shimmer',
    speed: 1.0,
    instructions: 'Speak in a crisp, confident, articulate tone like a chic career woman in her 30s. Enunciate every syllable precisely. Convey authority and sophistication without sounding cold.',
    ageRange: '30대',
    toneTags: ['명확함', '당당함', '지성', '세련됨'],
    optimalProducts: ['오피스룩', '자기계발', '프리미엄', '비즈니스용품'],
    tempoProfile: '중간 (1.0x) — 정확한 딕션, 핵심 키워드 강세',
    emotionLine: '화두 → 분석 → 프로 편슨 → 확신',
  },
  {
    key: 'f6_friendly_casual',
    label: '친근한 동네언니',
    gender: 'female',
    style: 'shopping',
    category: 'friendly_casual',
    desc: '수다 떨듯 편안하고 자연스러운 호흡. 일상 밀착형 제품, 내돈내산 리얼 리뷰 톤에 맞춤.',
    openaiVoice: 'alloy',
    speed: 1.05,
    instructions: 'Speak in a friendly, casual, chatty tone like a neighborhood older sister giving honest advice. Use natural conversational pacing with relaxed breathing. Sound genuine and relatable, like a real person talking to a friend.',
    ageRange: '20~30대',
    toneTags: ['친근함', '수다스러움', '자연스러움', '내돈내산'],
    optimalProducts: ['일상밀착형', '내돈내산', '리얼리뷰', '식품', '생활용품'],
    tempoProfile: '중간 (1.05x) — 대화体 자연스러운 완급',
    emotionLine: '공감 → 솔직한 경험 → 추천 → 편안한 마무리',
  },

  // ── 남성 성우 프로필 (M1~M6) ──────────────────────────────────────────
  {
    key: 'm1_authoritative',
    label: '신뢰감 있는 전문가',
    gender: 'male',
    style: 'announcer',
    category: 'authoritative',
    desc: '무게감 있고 묵직한 저음. 자동차, 프리미엄 IT 기기, 전문 리뷰어 톤에 최적화.',
    openaiVoice: 'onyx',
    speed: 0.92,
    instructions: 'Speak in a deep, weighted, authoritative low-pitch tone like a professional male reviewer. Convey gravitas and expertise. Each sentence should land with weight and credibility.',
    ageRange: '30~40대',
    toneTags: ['묵직함', '저음', '무게감', '전문성'],
    optimalProducts: ['자동차', '프리미엄 IT', '전문리뷰', '하이엔드'],
    tempoProfile: '중느림 (0.92x) — 묵직한 호흡, 핵심에서 강세',
    emotionLine: '전문성 → 분석 → 권위 → 신뢰 기반 추천',
  },
  {
    key: 'm2_trendy_hype',
    label: '트렌디 숏폼 호스트',
    gender: 'male',
    style: 'shopping',
    category: 'trendy_hype',
    desc: '에너지가 넘치고 귀에 꽂히는 힙한 텐션. 틱톡/릴스 알고리즘 저격용 숏폼 메인 훅에 제격.',
    openaiVoice: 'echo',
    speed: 1.18,
    instructions: 'Speak in a high-energy, hip, catchy tone like a trendy short-form host. Use punchy delivery with dramatic emphasis. Make every hook line stick in the ear. Sound like you belong on the FYP.',
    ageRange: '20대',
    toneTags: ['에너지', '힙함', '귀에꽂힘', '하이텐션'],
    optimalProducts: ['틱톡', '릴스', '숏폼훅', '트렌드제품', '가전'],
    tempoProfile: '빠름 (1.18x) — 훅 구간 최대 텐션, 베네핏 구간 약간 감속',
    emotionLine: '충격 훅 → 텐션 유지 → 하이라이트 → 폭발적 CTA',
  },
  {
    key: 'm3_calm_documentarian',
    label: '차분한 내레이터',
    gender: 'male',
    style: 'announcer',
    category: 'calm_documentarian',
    desc: '다큐멘터리 성우처럼 호흡이 깊고 안정적인 톤. 고급 가구, 프리미엄 브랜드 철학 전달용.',
    openaiVoice: 'echo',
    speed: 0.85,
    instructions: 'Speak in a deep, calm, documentary-narrator tone with long stable breaths. Pace is slow and deliberate. Convey premium quality and brand philosophy through measured, resonant delivery.',
    ageRange: '40대',
    toneTags: ['깊은호흡', '안정적', '다큐멘터리', '프리미엄'],
    optimalProducts: ['고급가구', '프리미엄브랜드', '인테리어', '레저'],
    tempoProfile: '느림 (0.85x) — 긴 호흡, 문장 간 0.5초 여유',
    emotionLine: '서사 → 철학 → 깊이 → 여운',
  },
  {
    key: 'm4_analytical_tech',
    label: '팩트체크 리뷰어',
    gender: 'male',
    style: 'announcer',
    category: 'analytical_tech',
    desc: '군더더기 없이 깔끔하게 스펙을 짚어주는 스마트한 톤. 가젯, 스펙 비교, 기능 설명에 최적화.',
    openaiVoice: 'echo',
    speed: 1.0,
    instructions: 'Speak in a clean, precise, analytical tone like a tech reviewer. Cut the fluff — deliver specs and features with surgical clarity. Use measured pacing on numbers and comparisons. Sound objective and data-driven.',
    ageRange: '30대',
    toneTags: ['깔끔함', '정확함', '객관적', '스마트'],
    optimalProducts: ['가젯', '스펙비교', '기능설명', 'IT기기', '전자제품'],
    tempoProfile: '중간 (1.0x) — 스펙 숫자에서 미세 감속, 비교 구간 강세',
    emotionLine: '문제 → 스펙 분석 → 비교 → 최적 선택',
  },
  {
    key: 'm5_witty_casual',
    label: '유쾌한 스마트보이',
    gender: 'male',
    style: 'shopping',
    category: 'witty_casual',
    desc: '친근하고 장난기 어린 위트가 묻어나는 음성. 유머러스한 반전 훅이나 캐주얼 제품 소개에 적합.',
    openaiVoice: 'echo',
    speed: 1.1,
    instructions: 'Speak in a witty, playful, casually humorous tone like a fun-loving guy in his 20s. Use dramatic comedic pauses and exaggerated emphasis for punchlines. Sound like you are genuinely enjoying talking about this product.',
    ageRange: '20대',
    toneTags: ['유쾌함', '장난기', '위트', '캐주얼'],
    optimalProducts: ['유머러스훅', '캐주얼제품', '반전숏폼', '트렌드'],
    tempoProfile: '중빠름 (1.1x) — 펀치라인 전 0.3초 정지, 위트 있는 억양',
    emotionLine: '반전 훅 → 유머 → 실용적 이점 → 웃으며 CTA',
  },
  {
    key: 'm6_energetic_leader',
    label: '다부진 리더',
    gender: 'male',
    style: 'shopping',
    category: 'energetic_leader',
    desc: '의욕 고취와 강한 확신을 주는 톤. 운동 용품, 건강 보조식품, 아웃도어 기어에 최적화.',
    openaiVoice: 'onyx',
    speed: 1.08,
    instructions: 'Speak in a strong, motivational, confident tone like a fitness coach or team leader. Use powerful delivery with strong conviction. Inspire action and convey that this product will change your life. Sound authoritative but energetic.',
    ageRange: '30대',
    toneTags: ['다부짐', '확신', '의욕고취', '강성'],
    optimalProducts: ['운동용품', '건강보조식품', '아웃도어', '피트니스'],
    tempoProfile: '중빠름 (1.08x) — 강한 강세, CTA 구간 최대 텐션',
    emotionLine: '동기부여 → 확신 → 베네핏 → 강력한 행동 촉구',
  },
];

export const DEFAULT_TTS_VOICE = 'f1_trendy_beauty';

export function getTtsVoiceByKey(key: string): TtsVoice | undefined {
  return TTS_VOICES.find((v) => v.key === key);
}

export function getVoicesByCategory(category: VoiceCategory): TtsVoice[] {
  return TTS_VOICES.filter((v) => v.category === category);
}

export function getVoicesByGender(gender: 'male' | 'female'): TtsVoice[] {
  return TTS_VOICES.filter((v) => v.gender === gender);
}

export function getOpenAiVoiceParams(key: string, speedOverride?: number | null): { voice: string; speed: number; instructions?: string } {
  const v = getTtsVoiceByKey(key);
  const baseSpeed = v?.speed ?? 1.0;
  const speed = speedOverride != null ? Math.min(Math.max(speedOverride, 0.5), 2.0) : baseSpeed;
  return { voice: v?.openaiVoice ?? 'alloy', speed, instructions: v?.instructions };
}

export function recommendVoiceForProduct(productName: string, productCategory?: string): TtsVoice {
  const hint = `${productName} ${productCategory ?? ''}`.toLowerCase();

  for (const voice of TTS_VOICES) {
    if (voice.optimalProducts.some((p) => hint.includes(p.toLowerCase()))) {
      return voice;
    }
  }

  if (hint.includes('할인') || hint.includes('공구') || hint.includes('가성비')) return getTtsVoiceByKey('f4_high_energy')!;
  if (hint.includes('프리미엄') || hint.includes('럭셔리')) return getTtsVoiceByKey('m3_calm_documentarian')!;
  if (hint.includes('운동') || hint.includes('헬스') || hint.includes('아웃도어')) return getTtsVoiceByKey('m6_energetic_leader')!;
  if (hint.includes('it') || hint.includes('테크') || hint.includes('전자')) return getTtsVoiceByKey('m4_analytical_tech')!;

  return getTtsVoiceByKey(DEFAULT_TTS_VOICE)!;
}

export interface MultilingualVoice {
  code: string;
  label: string;
  nativeName: string;
  openaiVoice: string;
  instructions: string;
}

export const MULTILINGUAL_VOICES: MultilingualVoice[] = [
  { code: 'en', label: 'English', nativeName: 'English', openaiVoice: 'alloy', instructions: 'Speak in a natural, engaging American English tone like a social media influencer reviewing a product.' },
  { code: 'ja', label: '日本語', nativeName: '日本語', openaiVoice: 'nova', instructions: 'Speak in a natural, energetic Japanese tone like a TikTok creator reviewing a product.' },
  { code: 'zh', label: '中文', nativeName: '中文', openaiVoice: 'echo', instructions: 'Speak in a natural, engaging Mandarin Chinese tone like a social media product reviewer.' },
  { code: 'es', label: 'Español', nativeName: 'Español', openaiVoice: 'shimmer', instructions: 'Speak in a natural, energetic Latin American Spanish tone like a product reviewer on TikTok.' },
  { code: 'vi', label: 'Tiếng Việt', nativeName: 'Tiếng Việt', openaiVoice: 'alloy', instructions: 'Speak in a natural, engaging Vietnamese tone like a TikTok product reviewer.' },
  { code: 'th', label: 'ภาษาไทย', nativeName: 'ภาษาไทย', openaiVoice: 'nova', instructions: 'Speak in a natural, friendly Thai tone like a social media product reviewer.' },
  { code: 'id', label: 'Bahasa', nativeName: 'Bahasa Indonesia', openaiVoice: 'echo', instructions: 'Speak in a natural, engaging Indonesian tone like a TikTok product reviewer.' },
  { code: 'pt', label: 'Português', nativeName: 'Português', openaiVoice: 'shimmer', instructions: 'Speak in a natural, energetic Brazilian Portuguese tone like a product reviewer on TikTok.' },
  { code: 'fr', label: 'Français', nativeName: 'Français', openaiVoice: 'alloy', instructions: 'Speak in a natural, engaging French tone like a social media product reviewer.' },
  { code: 'de', label: 'Deutsch', nativeName: 'Deutsch', openaiVoice: 'echo', instructions: 'Speak in a natural, clear German tone like a product reviewer on social media.' },
  { code: 'ar', label: 'العربية', nativeName: 'العربية', openaiVoice: 'nova', instructions: 'Speak in a natural, engaging Modern Standard Arabic tone like a social media product reviewer.' },
  { code: 'hi', label: 'हिन्दी', nativeName: 'हिन्दी', openaiVoice: 'shimmer', instructions: 'Speak in a natural, energetic Hindi tone like a TikTok product reviewer in India.' },
];

export function getMultilingualVoice(code: string): MultilingualVoice | undefined {
  return MULTILINGUAL_VOICES.find((v) => v.code === code);
}
