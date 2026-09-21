import type { AffiliatePlatformKey } from '@/components/AffiliatePlatformSwitch';

export interface DetectedAffiliate {
  platform: AffiliatePlatformKey;
  platformLabel: string;
  isAffiliate: boolean;
  marketingCopy: string;
  shortHint: string;
}

const COUPANG_SEARCH = /coupang\.com\/(np\/search|v\/p)/i;
const COUPANG_PRODUCT = /coupang\.com\/vp\/products/i;
const SMARTSTORE = /smartstore\.naver\.com|brand\.naver\.com|search\.shopping\.naver\.com/i;
const TOSS = /toss\.(to|im)/i;
const TOSS_SEND = /toss\.to\/send\//i;
const OLIVEYOUNG = /oliveyoung\.co\.kr/i;
const ZIGZAG = /zigzag\.be/i;
const TODAYHOUSE = /ohou\.se|todayhouse\.com/i;
const KURLY = /kurly\.com/i;
const ALIEXPRESS = /aliexpress\.com|aliexpress\.kr/i;
const AMAZON = /amazon\.(com|co\.uk|co\.jp|de|fr|it|es|ca|com\.au|in|sg|com\.mx|com\.br)/i;
const MYREALTRIP = /myrealtrip\.com/i;
const KLOOK = /klook\.com/i;

const PLATFORM_PATTERNS: { pattern: RegExp; key: AffiliatePlatformKey }[] = [
  { pattern: /coupang\.com/i, key: 'Coupang' },
  { pattern: TOSS, key: 'Toss' },
  { pattern: SMARTSTORE, key: 'BrandConnect' },
  { pattern: OLIVEYOUNG, key: 'OliveYoung' },
  { pattern: ZIGZAG, key: 'Zigzag' },
  { pattern: TODAYHOUSE, key: 'TodayHouse' },
  { pattern: KURLY, key: 'Kurly' },
  { pattern: ALIEXPRESS, key: 'AliExpress' },
  { pattern: AMAZON, key: 'Amazon' },
  { pattern: MYREALTRIP, key: 'MyRealTrip' },
  { pattern: KLOOK, key: 'Klook' },
];

export function detectAffiliatePlatform(url: string): AffiliatePlatformKey {
  for (const { pattern, key } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return key;
  }
  return 'Custom';
}

export function isKnownAffiliateUrl(url: string): boolean {
  return PLATFORM_PATTERNS.some((p) => p.pattern.test(url));
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  platform?: AffiliatePlatformKey;
}

export function validateAffiliateUrl(rawUrl: string): UrlValidationResult {
  let trimmed = rawUrl.trim().replace(/\s+/g, '');
  if (!trimmed) {
    return { valid: false, error: '링크를 입력해주세요.' };
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = 'https://' + trimmed;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: '올바르지 않은 링크 형식이에요. URL을 확인해주세요.' };
  }
  if (!parsed.hostname.includes('.')) {
    return { valid: false, error: '올바르지 않은 도메인이에요. URL을 다시 확인해주세요.' };
  }
  const platform = detectAffiliatePlatform(trimmed);
  if (AMAZON.test(trimmed)) {
    const country = detectAmazonCountry(trimmed);
    return {
      valid: true,
      platform: 'Amazon',
      warning: `아마존 ${country} 링크가 감지되었습니다. 아마존 어소시에이트 프로그램 별도 가입이 필요하며, 국내 공정위 문구와 별도로 해외 배송비·통관 등 안내가 필요할 수 있어요.`,
    };
  }
  if (ALIEXPRESS.test(trimmed)) {
    return {
      valid: true,
      platform: 'AliExpress',
      warning: '알리익스프레스 링크입니다. 알리익스프레스 어필리이트 프로그램 가입이 필요하며, 해외직구 안내(배송 2~3주·통관번호)를 함께 표기하는 것을 권장해요.',
    };
  }
  return { valid: true, platform };
}

function detectAmazonCountry(url: string): string {
  const match = url.match(/amazon\.([\w.]+)/i);
  if (!match) return '';
  const tld = match[1].toLowerCase();
  const map: Record<string, string> = {
    'com': 'US',
    'co.uk': 'UK',
    'co.jp': 'JP',
    'de': 'DE',
    'fr': 'FR',
    'it': 'IT',
    'es': 'ES',
    'ca': 'CA',
    'com.au': 'AU',
    'in': 'IN',
    'sg': 'SG',
    'com.mx': 'MX',
    'com.br': 'BR',
  };
  return map[tld] || tld.toUpperCase();
}

function extractProductNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const params = u.searchParams;
    const q = params.get('q') || params.get('query') || params.get('keyword');
    if (q) return q.replace(/\+/g, ' ').trim();

    const pathParts = u.pathname.split('/').filter(Boolean);
    const lastSegment = pathParts[pathParts.length - 1] || '';
    if (lastSegment && lastSegment !== 'products' && lastSegment !== 'search') {
      const cleaned = lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\.\w+$/, '')
        .trim();
      if (cleaned && cleaned.length > 1 && !/^\d+$/.test(cleaned)) return cleaned;
    }
  } catch {
    // not a valid URL yet
  }
  return '';
}

export function generateMarketingCopy(url: string, productName: string, priceLabel: string): DetectedAffiliate {
  const platform = detectAffiliatePlatform(url);
  const name = extractProductNameFromUrl(url) || productName || '이 제품';
  const price = priceLabel ? ` ${priceLabel}에` : '';

  if (platform === 'Coupang') {
    const isSearch = COUPANG_SEARCH.test(url);
    return {
      platform,
      platformLabel: '쿠팡 파트너스',
      isAffiliate: true,
      shortHint: isSearch ? '쿠팡 검색 링크' : '쿠팡 상품 링크',
      marketingCopy: `${name}${price} 확인하기\n지금 바로 쿠팡에서 최저가 비교하고 구매하세요!\n#쿠팡 #파트너스 #${name.replace(/\s+/g, '')}`,
    };
  }

  if (platform === 'Toss') {
    const isSend = TOSS_SEND.test(url);
    return {
      platform,
      platformLabel: '토스 쉐어링크',
      isAffiliate: true,
      shortHint: isSend ? '토스 송금 링크' : '토스 쉐어 링크',
      marketingCopy: `${name} 함께해요\n토스로 간편하게 참여하세요. 링크 클릭 한 번이면 끝!\n#토스 #쉐어링크`,
    };
  }

  if (SMARTSTORE_TEST(url)) {
    return {
      platform,
      platformLabel: '네이버 브랜드커넥트',
      isAffiliate: true,
      shortHint: '네이버 스마트스토어 링크',
      marketingCopy: `${name}${price} 만나보기\n네이버 쇼핑에서 안심하고 구매하세요.\n#네이버쇼핑 #스마트스토어 #${name.replace(/\s+/g, '')}`,
    };
  }

  const PLATFORM_COPY: Record<AffiliatePlatformKey, { label: string; hint: string; copy: string; tag: string }> = {
    Coupang: { label: '', hint: '', copy: '', tag: '' },
    Toss: { label: '', hint: '', copy: '', tag: '' },
    BrandConnect: { label: '', hint: '', copy: '', tag: '' },
    OliveYoung: { label: '올리브영', hint: '올리브영 링크', tag: '올리브영', copy: `${name}${price} 확인하기\n올리브영에서 만나보세요!\n#올리브영 #뷰티 #${name.replace(/\s+/g, '')}` },
    Zigzag: { label: '지그재그', hint: '지그재그 링크', tag: '지그재그', copy: `${name}${price} 확인하기\n지그재그에서 최저가로 만나보세요!\n#지그재그 #패션 #${name.replace(/\s+/g, '')}` },
    TodayHouse: { label: '오늘의집', hint: '오늘의집 링크', tag: '오늘의집', copy: `${name}${price} 확인하기\n오늘의집에서 홈스타일링하세요!\n#오늘의집 #홈데코 #${name.replace(/\s+/g, '')}` },
    Kurly: { label: '컬리', hint: '컬리 링크', tag: '컬리', copy: `${name}${price} 확인하기\n컬리에서 신선하게 만나보세요!\n#컬리 #신선식품 #${name.replace(/\s+/g, '')}` },
    AliExpress: { label: '알리익스프레스', hint: '알리 링크', tag: '알리익스프레스', copy: `${name}${price} 확인하기\n알리익스프레스에서 최저가로!\n#알리익스프레스 #해외직구 #${name.replace(/\s+/g, '')}` },
    Amazon: { label: '아마존', hint: '아마존 링크', tag: '아마존', copy: `${name}${price} 확인하기\n아마존에서 최저가로!\n#아마존 #해외직구 #${name.replace(/\s+/g, '')}` },
    MyRealTrip: { label: '마이리얼트립', hint: '마이리얼트립 링크', tag: '마이리얼트립', copy: `${name} 예약하기\n마이리얼트립에서 특가를 만나보세요!\n#마이리얼트립 #여행 #${name.replace(/\s+/g, '')}` },
    Klook: { label: '클룩', hint: '클룩 링크', tag: '클룩', copy: `${name} 예약하기\n클룩에서 할인가로 만나보세요!\n#클룩 #여행 #${name.replace(/\s+/g, '')}` },
    Custom: { label: '직접 추가', hint: '커스텀 링크', tag: '제휴', copy: `${name}${price} 확인하기\n링크를 통해 더 자세한 정보를 확인하세요.\n#${name.replace(/\s+/g, '')}` },
  };

  const copyInfo = PLATFORM_COPY[platform];
  if (copyInfo.label) {
    return {
      platform,
      platformLabel: copyInfo.label,
      isAffiliate: true,
      shortHint: copyInfo.hint,
      marketingCopy: copyInfo.copy,
    };
  }

  return {
    platform,
    platformLabel: '직접 추가 링크',
    isAffiliate: isKnownAffiliateUrl(url),
    shortHint: '커스텀 제휴 링크',
    marketingCopy: `${name}${price} 확인하기\n링크를 통해 더 자세한 정보를 확인하세요.\n#${name.replace(/\s+/g, '')}`,
  };
}

function SMARTSTORE_TEST(url: string): boolean {
  return SMARTSTORE.test(url);
}
