import { getLocalizedDisclosure, getAllLocalizedDisclosures, type LocalizedDisclosure } from '@/lib/disclosure';

export type CountryCode = 'US' | 'JP' | 'KR' | 'CN' | 'VN' | 'TH' | 'ID' | 'BR' | 'FR' | 'DE' | 'ES' | 'TW';
export type ToneMode = 'praise' | 'honest' | 'info';

export interface CountryRegulation {
  code: CountryCode;
  name: string;
  flag: string;
  regulationName: string;
  requiredTags: string[];
  disclosurePosition: 'top' | 'bottom' | 'both';
  languageCode: string;
}

export const COUNTRY_REGULATIONS: Record<CountryCode, CountryRegulation> = {
  US: {
    code: 'US',
    name: '미국',
    flag: '🇺🇸',
    regulationName: 'FTC Endorsement Guides',
    requiredTags: ['#Ad', '#PaidLink', '#Sponsored'],
    disclosurePosition: 'top',
    languageCode: 'en',
  },
  JP: {
    code: 'JP',
    name: '일본',
    flag: '🇯🇵',
    regulationName: 'ステルスマーケティング規制 (CAA)',
    requiredTags: ['#PR', '#プロモーション'],
    disclosurePosition: 'top',
    languageCode: 'ja',
  },
  KR: {
    code: 'KR',
    name: '한국',
    flag: '🇰🇷',
    regulationName: '공정거래위원회 표시광고법',
    requiredTags: ['소정의 수수료를 제공받을 수 있습니다'],
    disclosurePosition: 'bottom',
    languageCode: 'ko',
  },
  CN: {
    code: 'CN',
    name: '중국',
    flag: '🇨🇳',
    regulationName: '广告法 (광고법)',
    requiredTags: ['#广告', '#推广'],
    disclosurePosition: 'top',
    languageCode: 'zh',
  },
  VN: {
    code: 'VN',
    name: '베트남',
    flag: '🇻🇳',
    regulationName: 'Bộ Công Thương (공상부)',
    requiredTags: ['#QuảngCáo', '#TiepThi'],
    disclosurePosition: 'bottom',
    languageCode: 'vi',
  },
  TH: {
    code: 'TH',
    name: '태국',
    flag: '🇹🇭',
    regulationName: 'OCPB (소비자보호국)',
    requiredTags: ['#โฆษณา'],
    disclosurePosition: 'bottom',
    languageCode: 'th',
  },
  ID: {
    code: 'ID',
    name: '인도네시아',
    flag: '🇮🇩',
    regulationName: 'KPPU (공정거래위원회)',
    requiredTags: ['#Iklan', '#Promosi'],
    disclosurePosition: 'bottom',
    languageCode: 'id',
  },
  BR: {
    code: 'BR',
    name: '브라질',
    flag: '🇧🇷',
    regulationName: 'CONAR (광고자율규제)',
    requiredTags: ['#Publicidade', '#Publi'],
    disclosurePosition: 'top',
    languageCode: 'pt',
  },
  FR: {
    code: 'FR',
    name: '프랑스',
    flag: '🇫🇷',
    regulationName: 'DGCCRF (소자청)',
    requiredTags: ['#Publicité', '#Partenaire'],
    disclosurePosition: 'top',
    languageCode: 'fr',
  },
  DE: {
    code: 'DE',
    name: '독일',
    flag: '🇩🇪',
    regulationName: 'TMG §6 (전자상거래법)',
    requiredTags: ['#Werbung', '#Anzeige'],
    disclosurePosition: 'top',
    languageCode: 'de',
  },
  ES: {
    code: 'ES',
    name: '스페인/라틴',
    flag: '🇪🇸',
    regulationName: 'FTC-style / CONAR',
    requiredTags: ['#Publicidad', '#Ad'],
    disclosurePosition: 'top',
    languageCode: 'es',
  },
  TW: {
    code: 'TW',
    name: '대만',
    flag: '🇹🇼',
    regulationName: '公平交易法 (공평거역법)',
    requiredTags: ['#廣告', '#業配'],
    disclosurePosition: 'top',
    languageCode: 'zh',
  },
};

interface TabooWordEntry {
  word: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  countries: CountryCode[];
}

const TABOO_WORDS: TabooWordEntry[] = [
  { word: '最強', severity: 'high', reason: '일본 경쟁거래법 위반 (최고급 표현 금지)', countries: ['JP'] },
  { word: 'Number 1', severity: 'high', reason: '미국 FTC 근거 없는 최고 주장 금지', countries: ['US'] },
  { word: '제일', severity: 'medium', reason: '한국 공정위 최고/제일 표현 제한', countries: ['KR'] },
  { word: '최고', severity: 'medium', reason: '한국 공정위 최고/제일 표현 제한', countries: ['KR'] },
  { word: '治病', severity: 'high', reason: '중국 의료/치료 효과 표현 금지', countries: ['CN'] },
  { word: 'cure', severity: 'high', reason: '미국 FDA 의료 효능 주장 금지', countries: ['US'] },
  { word: ' miraculous', severity: 'medium', reason: '기적적 효과 과장 표현', countries: ['US', 'KR', 'JP'] },
  { word: '100% guaranteed', severity: 'high', reason: '근거 없는 100% 보장 표현 금지', countries: ['US', 'KR'] },
  { word: '完全無料', severity: 'medium', reason: '일본 완전 무료 표현 제한 (조건 명시 필요)', countries: ['JP'] },
  { word: '绝对', severity: 'medium', reason: '중국 절대적 표현 금지 (광고법)', countries: ['CN'] },
  { word: '治療', severity: 'high', reason: '일본/대만 의료 효능 표현 제한', countries: ['JP', 'TW'] },
  { word: 'magical', severity: 'low', reason: '과장 표현 (마법적)', countries: ['US', 'KR'] },
];

interface TranscreationPreset {
  country: CountryCode;
  toneName: string;
  styleGuide: string;
  examplePhrase: string;
  popularKeywords: string[];
}

const TRANSCREATION_PRESETS: TranscreationPreset[] = [
  {
    country: 'US',
    toneName: 'Gen-Z TikTok Casual',
    styleGuide: 'Use casual, energetic tone with current slang. Avoid formal language. Keep sentences short and punchy. Use emojis sparingly but naturally.',
    examplePhrase: "POV: you found the BEST thing on the internet rn 🔥",
    popularKeywords: ['POV', 'rn', 'tbh', 'no cap', 'slay', 'game changer', 'obsessed'],
  },
  {
    country: 'JP',
    toneName: '若者トレンド口語体',
    styleGuide: 'インスタ・TikTok風のカジュアルな若者言葉を使用。丁寧すぎない自然な語り口。絵文字を適度に使用。',
    examplePhrase: 'これマジでやばい！使う前と後でもう戻れない😭✨',
    popularKeywords: ['マジで', 'やばい', 'えぐい', 'しい', '知らなかった', 'もう戻れない'],
  },
  {
    country: 'KR',
    toneName: '한국 2030 숏폼 구어체',
    styleGuide: '친근하고 자연스러운 구어체. 과장 없이 솔직한 리뷰 톤. 유행어는 적절히 활용하되 너무 과하지 않게.',
    examplePhrase: '이거 진짜 꿀템이에요 ㅠㅠ 왜 이제야 알았지',
    popularKeywords: ['꿀템', '대박', '진짜', '왜 이제야', '무조건', '인생템'],
  },
  {
    country: 'VN',
    toneName: 'Gen-Z Việt Nam',
    styleGuide: 'Tự nhiên, trẻ trung, sử dụng từ lóng hiện tại. Tránh văn phong trang trọng.',
    examplePhrase: 'Trời ơi tìm mãi mới ra cái này, quá xịn! 🔥',
    popularKeywords: ['xịn', 'quá đỉnh', 'trời ơi', 'huhu', 'tiếc quá', 'đỉnh chóp'],
  },
  {
    country: 'TW',
    toneName: '台灣年輕人語氣',
    styleGuide: '使用台灣年輕人自然口語。避免書面語。適度使用流行語。',
    examplePhrase: '這個真的太讚了吧！為什麼現在才知道 😭',
    popularKeywords: ['太讚了', '有夠', '為什麼現在才知道', '超', '必買', '回購'],
  },
  {
    country: 'BR',
    toneName: 'Gen-Z Brasileiro',
    styleGuide: 'Linguagem casual e energética. Use gírias atuais sem exagero.',
    examplePhrase: 'Gente, isso aqui é TUDO! Não consigo mais viver sem 😍',
    popularKeywords: ['gente', 'tudo', 'amei', 'preciso', 'demais', 'top'],
  },
];

export interface SuitabilityFactor {
  legalCompliant: boolean;
  hasDisclosure: boolean;
  tabooViolations: number;
  transcreationApplied: boolean;
  nativeToneMatch: boolean;
}

export interface SuitabilityResult {
  score: number;
  level: 'unsafe' | 'caution' | 'safe' | 'optimal';
  legalScore: number;
  culturalScore: number;
  message: string;
  badges: string[];
  suggestions: string[];
}

export function checkTabooWords(text: string, country: CountryCode): TabooWordEntry[] {
  const lowerText = text.toLowerCase();
  return TABOO_WORDS.filter(
    (entry) =>
      entry.countries.includes(country) &&
      lowerText.includes(entry.word.toLowerCase())
  );
}

export function getCountryRegulation(country: CountryCode): CountryRegulation {
  return COUNTRY_REGULATIONS[country];
}

export function getTranscreationPreset(country: CountryCode): TranscreationPreset | null {
  return TRANSCREATION_PRESETS.find((p) => p.country === country) ?? null;
}

export function getCountryDisclosure(country: CountryCode): LocalizedDisclosure | null {
  const reg = COUNTRY_REGULATIONS[country];
  return getLocalizedDisclosure(reg.languageCode);
}

export function buildLegalTags(country: CountryCode): string {
  const reg = COUNTRY_REGULATIONS[country];
  return reg.requiredTags.join(' ');
}

export function injectDisclosure(
  caption: string,
  country: CountryCode,
  enabled: boolean = true,
): string {
  if (!enabled) return caption;
  const disclosure = getCountryDisclosure(country);
  if (!disclosure) return caption;
  const reg = COUNTRY_REGULATIONS[country];
  const tags = buildLegalTags(country);

  if (reg.disclosurePosition === 'top') {
    return `${disclosure.text}\n${tags}\n\n${caption}`;
  }
  return `${caption}\n\n${disclosure.text}\n${tags}`;
}

export function calculateSuitabilityScore(
  factors: SuitabilityFactor,
): SuitabilityResult {
  let legalScore = 0;
  let culturalScore = 0;
  const badges: string[] = [];
  const suggestions: string[] = [];

  // Legal compliance (0-50)
  if (factors.legalCompliant) {
    legalScore += 25;
    badges.push('법적 규제 준수');
  } else {
    suggestions.push('대가성 표기를 활성화하세요 (필수)');
  }

  if (factors.hasDisclosure) {
    legalScore += 25;
    badges.push('대가성 표기 포함');
  } else {
    suggestions.push('현지 대가성 고지문구가 누락되었습니다');
  }

  // Cultural compliance (0-50)
  if (factors.tabooViolations === 0) {
    culturalScore += 20;
    badges.push('금기어 0건');
  } else if (factors.tabooViolations <= 2) {
    culturalScore += 10;
    suggestions.push(`${factors.tabooViolations}개 금기어가 감지되었습니다. 대체어를 확인하세요.`);
  } else {
    suggestions.push(`${factors.tabooViolations}개 금기어 감지! 발행 전 수정이 필요합니다.`);
  }

  if (factors.transcreationApplied) {
    culturalScore += 15;
    badges.push('현지 문화 재창조 적용');
  } else {
    suggestions.push('단순 번역 대신 현지 톤 재창조(Transcreation)를 적용하세요');
  }

  if (factors.nativeToneMatch) {
    culturalScore += 15;
    badges.push('현지 인플루언서 톤 일치');
  } else {
    suggestions.push('현지 2030 인플루언서 톤을 적용하면 자연스러워집니다');
  }

  const score = Math.min(100, legalScore + culturalScore);

  let level: SuitabilityResult['level'];
  let message: string;

  if (score >= 90) {
    level = 'optimal';
    message = '현지 적합성이 최적입니다. 법적·문화적 안전성 모두 확보되었습니다.';
  } else if (score >= 70) {
    level = 'safe';
    message = '현지 적합성이 양호합니다. 발행해도 안전합니다.';
  } else if (score >= 40) {
    level = 'caution';
    message = '현지 적합성에 주의가 필요합니다. 발행 전 검토하세요.';
  } else {
    level = 'unsafe';
    message = '현지 발행 위험! 법적/문화적 위반이 감지되었습니다. 수정 후 발행하세요.';
  }

  return { score, level, legalScore, culturalScore, message, badges, suggestions: suggestions.slice(0, 3) };
}

export function buildTranscreationPrompt(country: CountryCode, tone: ToneMode): string {
  const preset = getTranscreationPreset(country);
  if (!preset) return '';

  const toneGuide: Record<ToneMode, string> = {
    praise: '칭찬형: 제품의 장점을 강조하되 과장 없이 진정성 있게 표현',
    honest: '솔직 후기형: 장단점을 모두 언급하며 신뢰감을 구축',
    info: '정보 전달형: 객관적 정보와 팩트 위주로 구성',
  };

  return [
    `[현지화 지시사항]`,
    `국가: ${preset.country}`,
    `톤: ${preset.toneName}`,
    `스타일 가이드: ${preset.styleGuide}`,
    `어조 모드: ${toneGuide[tone]}`,
    `유행 키워드 참고: ${preset.popularKeywords.join(', ')}`,
    `예시 문구: "${preset.examplePhrase}"`,
    ``,
    `주의: 직역하지 말고 현지인이 쓰는 자연스러운 구어체로 재창조하세요. 기계 번역 느낌이 나면 안 됩니다.`,
  ].join('\n');
}

export function getAllCountries(): CountryRegulation[] {
  return Object.values(COUNTRY_REGULATIONS);
}
