import type { AnalysisResult, AffiliateLink, UserSettings } from '@/types/database';
import { detectAffiliatePlatform } from '@/lib/affiliateLinkSmart';
import { fetchAffiliatePlatforms, injectTrackingCode, findPlatformByUrl } from '@/lib/affiliatePlatformManager';

export function isCoupangUrl(url: string): boolean {
  return /coupang\.com/i.test(url);
}

export function isTossUrl(url: string): boolean {
  return /toss\.(to|im)/i.test(url);
}

export function isAmazonUrl(url: string): boolean {
  return /amazon\.(com|co\.[a-z]{2}|com\.[a-z]{2}|de|fr|co\.jp)/i.test(url);
}

export function isAliExpressUrl(url: string): boolean {
  return /aliexpress\.(com|kr)/i.test(url);
}

export function isShopeeUrl(url: string): boolean {
  return /shopee\.(com|co\.[a-z]{2}|sg|my|th|vn|ph|id|br)/i.test(url);
}

export interface UrlValidationResult {
  valid: boolean;
  platform: string;
  error: string | null;
  warning: string | null;
  normalizedUrl: string;
}

export function validateAffiliateUrl(rawUrl: string): UrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, platform: '', error: 'URL을 입력해주세요.', warning: null, normalizedUrl: '' };
  }

  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, platform: '', error: 'URL 형식이 올바르지 않아요. 주소를 다시 확인해주세요.', warning: null, normalizedUrl: url };
  }

  if (!parsed.hostname.includes('.')) {
    return { valid: false, platform: '', error: 'URL에 도메인이 포함되어 있지 않아요.', warning: null, normalizedUrl: url };
  }

  const platform = detectAffiliatePlatform(url);

  let warning: string | null = null;

  if (isAmazonUrl(url)) {
    if (!/tag=/i.test(url)) {
      warning = '아마존 제휴 링크에는 ?tag=YOUR-ID 파라미터가 필요해요. Amazon Associates에서 발급받은 링크를 사용하세요.';
    }
    if (/amazon\.co\.kr/i.test(url)) {
      warning = '아마존 한국 사이트는 제휴 프로그램이 제한적이에요. 글로벌 amazon.com 링크 사용을 권장해요.';
    }
  }

  if (isAliExpressUrl(url)) {
    if (!/aff_trace=/i.test(url) && !/aff_short_key=/i.test(url)) {
      warning = '알리익스프레스 제휴 링크에는 추적 코드(aff_trace)가 포함되어야 해요. AliExpress Portals에서 링크를 발급받으세요.';
    }
    if (/aliexpress\.kr/i.test(url) && !/aliexpress\.com/i.test(url)) {
      warning = '알리익스프레스 한국 사이트는 글로벌 포털과 추적 방식이 다를 수 있어요. SNS 공유용으로는 글로벌 링크를 권장해요.';
    }
  }

  if (isShopeeUrl(url)) {
    if (!/aff_f=/i.test(url) && !/aff_short=/i.test(url)) {
      warning = '쇼피 제휴 링크에는 추적 코드(aff_f)가 필요해요. Shopee Affiliate Program에서 발급받은 링크를 사용하세요.';
    }
    warning = (warning ?? '') + ' 쇼피는 국가별 도메인(sg/my/th/vn/ph/id/br)이 달라요. 타겟 국가에 맞는 링크인지 확인하세요.';
  }

  const knownDomestic = /coupang\.com|toss\.(to|im)|naver\.com|oliveyoung\.co\.kr|zigzag\.be|ohou\.se|kurly\.com/i.test(url);
  const knownOverseas = isAmazonUrl(url) || isAliExpressUrl(url) || isShopeeUrl(url);
  if (!knownDomestic && !knownOverseas && platform === 'Custom') {
    warning = '인식되지 않은 플랫폼이에요. 제휴 링크가 맞는지 URL을 다시 확인해주세요.';
  }

  return { valid: true, platform, error: null, warning, normalizedUrl: url };
}

export function generateAffiliateLinks(
  analysis: AnalysisResult,
  settings: UserSettings | null,
): AffiliateLink[] {
  const links: AffiliateLink[] = [];
  const query = analysis.productName || analysis.title || '';
  if (!query) return links;

  const encoded = encodeURIComponent(query);

  if (settings?.coupang_partners_id) {
    links.push({
      platform: 'Coupang',
      label: '쿠팡 파트너스',
      url: `https://www.coupang.com/np/search?component=&q=${encoded}&partner=${encodeURIComponent(settings.coupang_partners_id)}`,
    });
  } else {
    links.push({
      platform: 'Coupang',
      label: '쿠팡 파트너스 (ID 미설정)',
      url: 'https://partners.coupang.com/',
    });
  }

  if (settings?.toss_share_id) {
    links.push({
      platform: 'Toss',
      label: '토스 쉐어링크',
      url: `https://sharelink.toss.im/${encodeURIComponent(settings.toss_share_id)}`,
    });
  } else {
    links.push({
      platform: 'Toss',
      label: '토스 쉐어링크 (ID 미설정)',
      url: 'https://sharelink.toss.im/',
    });
  }

  if (settings?.naver_shopping_id) {
    links.push({
      platform: 'BrandConnect',
      label: '네이버 쇼핑',
      url: `https://search.shopping.naver.com/search/all?query=${encoded}&nsh=${encodeURIComponent(settings.naver_shopping_id)}`,
    });
  } else {
    links.push({
      platform: 'BrandConnect',
      label: '네이버 브랜드커넥트',
      url: 'https://brandconnect.naver.com/about/creator',
    });
  }

  return links;
}

export async function generateAffiliateLinkForMatch(
  matchUrl: string,
  platform: string,
  settings: UserSettings | null,
): Promise<string> {
  if (settings?.coupang_partners_id && isCoupangUrl(matchUrl)) {
    const sep = matchUrl.includes('?') ? '&' : '?';
    return `${matchUrl}${sep}partner=${settings.coupang_partners_id}`;
  }
  if (settings?.naver_shopping_id && /search\.shopping\.naver\.com/i.test(matchUrl)) {
    const sep = matchUrl.includes('?') ? '&' : '?';
    return `${matchUrl}${sep}nsh=${settings.naver_shopping_id}`;
  }
  if (settings?.toss_share_id && isTossUrl(matchUrl)) {
    return `https://sharelink.toss.im/${settings.toss_share_id}`;
  }

  // Check managed affiliate platforms (including custom ones) from Supabase
  try {
    const managedPlatforms = await fetchAffiliatePlatforms();
    const matchedPlatform = findPlatformByUrl(matchUrl, managedPlatforms);
    if (matchedPlatform) {
      return injectTrackingCode(matchUrl, matchedPlatform);
    }
    // For custom platforms not matched by URL pattern, try matching by platform key
    const customPlatform = managedPlatforms.find(
      (p) => p.key === platform && !p.is_builtin && p.hasId && p.is_enabled,
    );
    if (customPlatform) {
      return injectTrackingCode(matchUrl, customPlatform);
    }
  } catch {
    // Supabase unavailable — fall through to return original URL
  }

  return matchUrl;
}
