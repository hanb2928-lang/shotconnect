import type { UserSettings } from '@/types/database';

export interface GlobalAffiliatePlatform {
  key: string;
  label: string;
  icon: string;
  color: string;
  signupUrl: string;
  desc: string;
  region: 'kr' | 'global';
  idField?: keyof UserSettings;
  linkPattern?: (url: string, id: string) => string;
}

export const GLOBAL_AFFILIATE_PLATFORMS: GlobalAffiliatePlatform[] = [
  // Korean platforms
  {
    key: 'Coupang',
    label: '쿠팡 파트너스',
    icon: 'ShoppingBag',
    color: '#FF3E3E',
    signupUrl: 'https://partners.coupang.com/',
    desc: '쿠팡 상품 링크를 공유하고 수수료를 받으세요',
    region: 'kr',
  },
  {
    key: 'Toss',
    label: '토스 쉐어링크',
    icon: 'Send',
    color: '#0064FF',
    signupUrl: 'https://sharelink.toss.im/',
    desc: '토스로 링크를 공유하고 보상을 받으세요',
    region: 'kr',
  },
  {
    key: 'BrandConnect',
    label: '네이버 브랜드커넥트',
    icon: 'Globe',
    color: '#03C75A',
    signupUrl: 'https://brandconnect.naver.com/about/creator',
    desc: '네이버 쇼핑 제휴 링크를 발급받으세요',
    region: 'kr',
  },
  // Global platforms
  {
    key: 'Amazon',
    label: 'Amazon Associates',
    icon: 'ShoppingBag',
    color: '#FF9900',
    signupUrl: 'https://affiliate-program.amazon.com/',
    desc: '아마존 상품 링크로 글로벌 수수료를 받으세요',
    region: 'global',
  },
  {
    key: 'AliExpress',
    label: 'AliExpress Affiliate',
    icon: 'Globe',
    color: '#E62E04',
    signupUrl: 'https://portals.aliexpress.com/',
    desc: '알리익스프레스 제휴 링크로 전 세계 고객에게 홍보하세요',
    region: 'global',
  },
  {
    key: 'Shopee',
    label: 'Shopee Affiliate',
    icon: 'ShoppingBag',
    color: '#EE4D2D',
    signupUrl: 'https://shopee.com/m/affiliate-program',
    desc: '동남아시아 쇼피 플랫폼 제휴 링크를 발급받으세요',
    region: 'global',
  },
];

export function isGlobalPlatform(key: string): boolean {
  const p = GLOBAL_AFFILIATE_PLATFORMS.find((p) => p.key === key);
  return p?.region === 'global';
}

export function getGlobalPlatforms(): GlobalAffiliatePlatform[] {
  return GLOBAL_AFFILIATE_PLATFORMS.filter((p) => p.region === 'global');
}

export function getKoreanPlatforms(): GlobalAffiliatePlatform[] {
  return GLOBAL_AFFILIATE_PLATFORMS.filter((p) => p.region === 'kr');
}

export function generateGlobalAffiliateLink(
  platformKey: string,
  productUrl: string,
  settings: UserSettings | null,
): string {
  if (!productUrl) return '';
  const trimmed = productUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';

  switch (platformKey) {
    case 'Amazon':
      // Amazon associates tag appended to URL
      const amazonTag = (settings as any)?.amazon_associate_tag as string | undefined;
      if (amazonTag) {
        const sep = trimmed.includes('?') ? '&' : '?';
        return `${trimmed}${sep}tag=${encodeURIComponent(amazonTag)}`;
      }
      return trimmed;
    case 'AliExpress':
      // AliExpress affiliate — append AFF tracking param if available
      const aliAffId = (settings as any)?.aliexpress_aff_id as string | undefined;
      if (aliAffId) {
        const sep = trimmed.includes('?') ? '&' : '?';
        return `${trimmed}${sep}aff_short_key=${encodeURIComponent(aliAffId)}`;
      }
      return trimmed;
    case 'Shopee':
      // Shopee affiliate — append aff_id param
      const shopeeAffId = (settings as any)?.shopee_aff_id as string | undefined;
      if (shopeeAffId) {
        const sep = trimmed.includes('?') ? '&' : '?';
        return `${trimmed}${sep}aff_id=${encodeURIComponent(shopeeAffId)}`;
      }
      return trimmed;
    default:
      return trimmed;
  }
}

export interface TargetLanguage {
  code: string;
  label: string;
  nativeName: string;
  flag: string;
  region: string;
  ttsVoice: string;
  affiliatePlatform: string;
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { code: 'en', label: 'English', nativeName: 'English', flag: 'US', region: 'North America', ttsVoice: 'alloy', affiliatePlatform: 'Amazon US / TikTok Shop US' },
  { code: 'ja', label: '日本語', nativeName: '日本語', flag: 'JP', region: 'Japan', ttsVoice: 'nova', affiliatePlatform: 'Amazon JP / TikTok Shop JP' },
  { code: 'zh', label: '中文', nativeName: '中文', flag: 'CN', region: 'China', ttsVoice: 'echo', affiliatePlatform: 'AliExpress / TikTok Shop CN' },
  { code: 'es', label: 'Español', nativeName: 'Español', flag: 'ES', region: 'Latin America', ttsVoice: 'shimmer', affiliatePlatform: 'Amazon ES / TikTok Shop LATAM' },
  { code: 'vi', label: 'Tiếng Việt', nativeName: 'Tiếng Việt', flag: 'VN', region: 'Vietnam', ttsVoice: 'alloy', affiliatePlatform: 'Shopee VN / TikTok Shop VN' },
  { code: 'th', label: 'ภาษาไทย', nativeName: 'ภาษาไทย', flag: 'TH', region: 'Thailand', ttsVoice: 'nova', affiliatePlatform: 'Shopee TH / TikTok Shop TH' },
  { code: 'id', label: 'Bahasa', nativeName: 'Bahasa Indonesia', flag: 'ID', region: 'Indonesia', ttsVoice: 'echo', affiliatePlatform: 'Shopee ID / TikTok Shop ID' },
  { code: 'pt', label: 'Português', nativeName: 'Português', flag: 'BR', region: 'Brazil', ttsVoice: 'shimmer', affiliatePlatform: 'Amazon BR / TikTok Shop BR' },
  { code: 'fr', label: 'Français', nativeName: 'Français', flag: 'FR', region: 'France', ttsVoice: 'alloy', affiliatePlatform: 'Amazon FR / TikTok Shop FR' },
  { code: 'de', label: 'Deutsch', nativeName: 'Deutsch', flag: 'DE', region: 'Germany', ttsVoice: 'echo', affiliatePlatform: 'Amazon DE / TikTok Shop DE' },
  { code: 'ar', label: 'العربية', nativeName: 'العربية', flag: 'SA', region: 'Middle East', ttsVoice: 'nova', affiliatePlatform: 'AliExpress ME / TikTok Shop ME' },
  { code: 'hi', label: 'हिन्दी', nativeName: 'हिन्दी', flag: 'IN', region: 'India', ttsVoice: 'shimmer', affiliatePlatform: 'Amazon IN / TikTok Shop IN' },
];

export function getLanguageByCode(code: string): TargetLanguage | undefined {
  return TARGET_LANGUAGES.find((l) => l.code === code);
}
