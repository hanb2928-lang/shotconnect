export interface PlatformDisclosure {
  platform: string;
  short: string;
  full: string;
}

export const COUPANG_DISCLOSURE =
  '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

export const COUPANG_DISCLOSURE_SHORT = '쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다.';

export const NAVER_DISCLOSURE =
  '이 포스팅은 네이버 커넥트(네이버쇼핑 파트너스) 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.';

export const NAVER_DISCLOSURE_SHORT = '네이버 커넥트(파트너스) 활동의 일환으로 수수료를 제공받을 수 있습니다.';

export const BRANDCONNECT_DISCLOSURE =
  '이 포스팅은 네이버 브랜드커넥트 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.';

export const BRANDCONNECT_DISCLOSURE_SHORT = '네이버 브랜드커넥트 활동의 일환으로 수수료를 제공받을 수 있습니다.';

export const TOSS_DISCLOSURE =
  '이 포스팅은 토스 쉐어링크를 포함하고 있으며, 링크를 통해 송금 시 일정액의 보상을 제공받을 수 있습니다.';

export const TOSS_DISCLOSURE_SHORT = '토스 쉐어링크를 통해 보상을 제공받을 수 있습니다.';

export const SMARTSTORE_DISCLOSURE =
  '이 포스팅은 네이버 커넥트 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.';

export const SMARTSTORE_DISCLOSURE_SHORT =
  '네이버 커넥트 활동의 일환으로 수수료를 제공받을 수 있습니다.';

export const GENERIC_DISCLOSURE =
  '이 포스팅은 제휴 마케팅 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.';

export const GENERIC_DISCLOSURE_SHORT = '제휴 마케팅 활동의 일환으로 수수료를 제공받을 수 있습니다.';

const PLATFORM_DISCLOSURES: Record<string, PlatformDisclosure> = {
  Coupang: {
    platform: 'Coupang',
    short: COUPANG_DISCLOSURE_SHORT,
    full: COUPANG_DISCLOSURE,
  },
  NaverShopping: {
    platform: 'NaverShopping',
    short: NAVER_DISCLOSURE_SHORT,
    full: NAVER_DISCLOSURE,
  },
  BrandConnect: {
    platform: 'BrandConnect',
    short: BRANDCONNECT_DISCLOSURE_SHORT,
    full: BRANDCONNECT_DISCLOSURE,
  },
  Toss: {
    platform: 'Toss',
    short: TOSS_DISCLOSURE_SHORT,
    full: TOSS_DISCLOSURE,
  },
  OliveYoung: {
    platform: 'OliveYoung',
    short: '올리브영 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 올리브영 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  Zigzag: {
    platform: 'Zigzag',
    short: '지그재그 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 지그재그 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  TodayHouse: {
    platform: 'TodayHouse',
    short: '오늘의집 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 오늘의집 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  Kurly: {
    platform: 'Kurly',
    short: '컬리 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 컬리 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  AliExpress: {
    platform: 'AliExpress',
    short: '알리익스프레스 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 알리익스프레스 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  Amazon: {
    platform: 'Amazon',
    short: '아마존 어소시에이트 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 아마존 어소시에이트 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  Shopee: {
    platform: 'Shopee',
    short: '쇼피 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 쇼피 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  MyRealTrip: {
    platform: 'MyRealTrip',
    short: '마이리얼트립 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 마이리얼트립 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  Klook: {
    platform: 'Klook',
    short: '클룩 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 클룩 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  '11st': {
    platform: '11st',
    short: '11번가 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 11번가 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
  Gmarket: {
    platform: 'Gmarket',
    short: 'G마켓 제휴 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    full: '이 포스팅은 G마켓 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  },
};

const PLATFORM_ALIASES: Record<string, string> = {
  coupang: 'Coupang',
  '쿠팡': 'Coupang',
  '쿠팡파트너스': 'Coupang',
  naver: 'BrandConnect',
  'navershopping': 'NaverShopping',
  'smartstore': 'NaverShopping',
  '스마트스토어': 'NaverShopping',
  '네이버쇼핑': 'NaverShopping',
  '네이버스마트스토어': 'NaverShopping',
  brandconnect: 'BrandConnect',
  '네이버커넥트': 'NaverShopping',
  '네이버파트너스': 'NaverShopping',
  '네이버브랜드커넥트': 'BrandConnect',
  '브랜드커넥트': 'BrandConnect',
  toss: 'Toss',
  '토스': 'Toss',
  '토스쉐어링크': 'Toss',
  oliveyoung: 'OliveYoung',
  '올리브영': 'OliveYoung',
  zigzag: 'Zigzag',
  '지그재그': 'Zigzag',
  todayhouse: 'TodayHouse',
  '오늘의집': 'TodayHouse',
  kurly: 'Kurly',
  '컬리': 'Kurly',
  '마켓컬리': 'Kurly',
  aliexpress: 'AliExpress',
  '알리익스프레스': 'AliExpress',
  '알리': 'AliExpress',
  amazon: 'Amazon',
  '아마존': 'Amazon',
  shopee: 'Shopee',
  '쇼피': 'Shopee',
  myrealtrip: 'MyRealTrip',
  '마이리얼트립': 'MyRealTrip',
  klook: 'Klook',
  '클룩': 'Klook',
  '11st': '11st',
  '11번가': '11st',
  '스마일배송': '11st',
  gmarket: 'Gmarket',
  'g마켓': 'Gmarket',
  '지마켓': 'Gmarket',
  '옥션': 'Gmarket',
};

function normalizePlatformKey(platform: string): string {
  const trimmed = platform.trim();
  const lower = trimmed.toLowerCase();
  if (PLATFORM_ALIASES[trimmed]) return PLATFORM_ALIASES[trimmed];
  if (PLATFORM_ALIASES[lower]) return PLATFORM_ALIASES[lower];
  for (const key of Object.keys(PLATFORM_DISCLOSURES)) {
    if (key.toLowerCase() === lower) return key;
  }
  return trimmed;
}

export function getPlatformDisclosure(platform: string): PlatformDisclosure {
  const normalized = normalizePlatformKey(platform);
  return PLATFORM_DISCLOSURES[normalized] || {
    platform: normalized,
    short: GENERIC_DISCLOSURE_SHORT,
    full: GENERIC_DISCLOSURE,
  };
}

export function getDisclosureForPlatforms(platforms: string[], enabled = true): string {
  if (!enabled) return '';
  if (platforms.length === 0) return GENERIC_DISCLOSURE;
  if (platforms.length === 1) return getPlatformDisclosure(platforms[0]).full;
  return platforms
    .map((p) => getPlatformDisclosure(p).full)
    .join('\n');
}

export function getDisclosureShortForPlatforms(platforms: string[], enabled = true): string {
  if (!enabled) return '';
  if (platforms.length === 0) return GENERIC_DISCLOSURE_SHORT;
  if (platforms.length === 1) return getPlatformDisclosure(platforms[0]).short;
  return platforms
    .map((p) => getPlatformDisclosure(p).short)
    .join(' / ');
}

export function getShareDisclosureForPlatforms(platforms: string[], enabled = true): string {
  if (!enabled) return '';
  if (platforms.length === 0) return GENERIC_DISCLOSURE;
  return platforms
    .map((p) => `(${getPlatformDisclosure(p).platform}) ${getPlatformDisclosure(p).full}`)
    .join('\n');
}

export function buildCaptionWithDisclosure(
  caption: string,
  platforms: string[],
  enabled = true,
): string {
  const disclosure = getDisclosureForPlatforms(platforms, enabled);
  if (!disclosure) return caption;
  return `${disclosure}\n\n${caption}`;
}

export interface LocalizedDisclosure {
  languageCode: string;
  label: string;
  text: string;
  regulation: string;
}

const LOCALIZED_DISCLOSURES: LocalizedDisclosure[] = [
  { languageCode: 'ko', label: '한국', text: '이 포스팅은 제휴 마케팅 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.', regulation: '공정위' },
  { languageCode: 'en', label: 'USA', text: '*This post contains affiliate links. I may earn a commission from purchases made through these links.', regulation: 'FTC' },
  { languageCode: 'ja', label: '日本', text: '※本ページにはプロモーションが含まれています。', regulation: 'ステマ規制' },
  { languageCode: 'zh', label: '中国', text: '※本页面包含推广内容。', regulation: '广告法' },
  { languageCode: 'es', label: 'LATAM', text: '*Esta publicación contiene enlaces de afiliados. Puede recibir una comisión por las compras realizadas a través de estos enlaces.', regulation: 'FTC-style' },
  { languageCode: 'vi', label: 'Việt Nam', text: '*Bài viết này có chứa liên kết tiếp thị liên kết.', regulation: 'Bộ Công Thương' },
  { languageCode: 'th', label: 'ประเทศไทย', text: '*โพสต์นี้มีลิงก์พันธมิตร', regulation: 'OCPB' },
  { languageCode: 'id', label: 'Indonesia', text: '*Postingan ini mengandung tautan afiliasi.', regulation: 'KPPU' },
  { languageCode: 'pt', label: 'Brasil', text: '*Este post contém links de afiliados. Posso receber uma comissão por compras feitas através destes links.', regulation: 'CONAR' },
  { languageCode: 'fr', label: 'France', text: '*Ce post contient des liens d\'affiliation. Je peux percevoir une commission pour les achats effectués via ces liens.', regulation: 'DGCCRF' },
  { languageCode: 'de', label: 'Deutschland', text: '*Dieser Beitrag enthält Affiliate-Links. Ich kann eine Provision für über diese Links getätigte Einkäufe erhalten.', regulation: 'TMG' },
  { languageCode: 'ar', label: 'العربية', text: '*تتضمن هذه المشاركة روابط تابعة. قد أتلقى عمولة عن المشتريات التي تتم عبر هذه الروابط.', regulation: 'FTC-style' },
  { languageCode: 'hi', label: 'भारत', text: '*इस पोस्ट में एफिलिएट लिंक शामिल हैं। इन लिंक से खरीदारी पर मुझे कमीशन मिल सकता है।', regulation: 'ASCI' },
];

export function getLocalizedDisclosure(langCode: string): LocalizedDisclosure | null {
  return LOCALIZED_DISCLOSURES.find((d) => d.languageCode === langCode) ?? null;
}

export function getAllLocalizedDisclosures(): LocalizedDisclosure[] {
  return LOCALIZED_DISCLOSURES;
}
