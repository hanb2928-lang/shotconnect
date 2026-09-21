import {
  isCoupangUrl,
  isTossUrl,
  generateAffiliateLinks,
  generateAffiliateLinkForMatch,
} from '@/lib/affiliate';
import type { AnalysisResult, UserSettings } from '@/types/database';

const baseAnalysis: AnalysisResult = {
  title: '테스트 제품',
  summary: '',
  contacts: [],
  tags: [],
  productName: '나이키 에어포스 1',
  productCategory: 'sneakers',
  priceEstimate: '100,000원',
  oneLiner: '',
  shoppingMatches: [],
  templateData: {
    priceLabel: '',
    oneLiner: '',
    category: '',
    accentColor: '#2f9dff',
    hook: '',
    hashtags: [],
    productAdvantages: [],
    caption: '',
  },
  detectedProducts: [],
};

const fullSettings: UserSettings = {
  coupang_partners_id: 'mypartner123',
  naver_shopping_id: 'navershop456',
  toss_share_id: 'tossshare789',
  openai_api_key: null,
  pexels_api_key: null,
  tts_api_key: null,
  logo_url: null,
  default_video_duration: null,
  default_tts_voice: null,
  tts_speed: null,
  tts_pitch: null,
  progress_style: null,
  auto_disclosure: null,
  brand_persona: null,
  mascot_enabled: null,
  mascot_style: null,
  capture_guide_mode: null,
  ui_performance: null,
  theme_mode: null,
  display_density: null,
  theme_preset: null,
  app_language: null,
  default_caption_tone: null,
  fixed_hook_phrase: null,
  affiliate_priority_mapping: null,
  auto_publish_reels: null,
  auto_publish_tiktok: null,
  auto_publish_shorts: null,
  auto_publish_sandbox_mode: null,
  clean_footage_enabled: null,
  runway_api_key: null,
};

describe('isCoupangUrl', () => {
  it('쿠팡 URL을 인식한다', () => {
    expect(isCoupangUrl('https://www.coupang.com/vp/12345')).toBe(true);
    expect(isCoupangUrl('https://coupang.com/np/search?q=shoes')).toBe(true);
  });

  it('쿠팡이 아닌 URL을 거부한다', () => {
    expect(isCoupangUrl('https://www.naver.com')).toBe(false);
    expect(isCoupangUrl('https://www.toss.im')).toBe(false);
    expect(isCoupangUrl('')).toBe(false);
  });
});

describe('isTossUrl', () => {
  it('토스 URL을 인식한다', () => {
    expect(isTossUrl('https://toss.im/share123')).toBe(true);
    expect(isTossUrl('https://toss.to/send/abc')).toBe(true);
  });

  it('토스가 아닌 URL을 거부한다', () => {
    expect(isTossUrl('https://www.naver.com')).toBe(false);
    expect(isTossUrl('https://www.coupang.com')).toBe(false);
  });
});

describe('generateAffiliateLinks', () => {
  it('설정이 있을 때 세 개의 제휴 링크를 생성한다', () => {
    const links = generateAffiliateLinks(baseAnalysis, fullSettings);
    expect(links).toHaveLength(3);

    const coupang = links.find((l) => l.platform === 'Coupang');
    expect(coupang).toBeDefined();
    expect(coupang!.url).toContain('partner=mypartner123');
    expect(coupang!.url).toContain(encodeURIComponent('나이키 에어포스 1'));

    const toss = links.find((l) => l.platform === 'Toss');
    expect(toss).toBeDefined();
    expect(toss!.url).toContain('tossshare789');

    const naver = links.find((l) => l.platform === 'BrandConnect');
    expect(naver).toBeDefined();
    expect(naver!.url).toContain('nsh=navershop456');
  });

  it('설정이 없을 때 기본 링크를 생성한다', () => {
    const links = generateAffiliateLinks(baseAnalysis, null);
    expect(links).toHaveLength(3);

    const coupang = links.find((l) => l.platform === 'Coupang');
    expect(coupang!.url).toBe('https://partners.coupang.com/');
    expect(coupang!.label).toContain('ID 미설정');
  });

  it('제품명이 없으면 빈 배열을 반환한다', () => {
    const noName: AnalysisResult = { ...baseAnalysis, productName: '', title: '' };
    expect(generateAffiliateLinks(noName, fullSettings)).toHaveLength(0);
  });

  it('특수문자가 포함된 제품명을 안전하게 인코딩한다', () => {
    const specialName: AnalysisResult = {
      ...baseAnalysis,
      productName: "아이폰 15 Pro & Max 100%",
    };
    const links = generateAffiliateLinks(specialName, fullSettings);
    const coupang = links.find((l) => l.platform === 'Coupang');
    expect(coupang!.url).toContain(encodeURIComponent("아이폰 15 Pro & Max 100%"));
  });
});

describe('generateAffiliateLinkForMatch', () => {
  it('쿠팡 URL에 파트너 ID를 추가한다', async () => {
    const result = await generateAffiliateLinkForMatch(
      'https://www.coupang.com/vp/123',
      'Coupang',
      fullSettings,
    );
    expect(result).toContain('partner=mypartner123');
  });

  it('이미 쿼리 파라미터가 있으면 &로 연결한다', async () => {
    const result = await generateAffiliateLinkForMatch(
      'https://www.coupang.com/vp/123?channel=abc',
      'Coupang',
      fullSettings,
    );
    expect(result).toContain('&partner=mypartner123');
  });

  it('네이버 쇼핑 URL에 nsh 파라미터를 추가한다', async () => {
    const result = await generateAffiliateLinkForMatch(
      'https://search.shopping.naver.com/search/all?query=shoes',
      'BrandConnect',
      fullSettings,
    );
    expect(result).toContain('nsh=navershop456');
  });

  it('설정이 없으면 원본 URL을 그대로 반환한다', async () => {
    const url = 'https://www.coupang.com/vp/123';
    expect(await generateAffiliateLinkForMatch(url, 'Coupang', null)).toBe(url);
  });
});
