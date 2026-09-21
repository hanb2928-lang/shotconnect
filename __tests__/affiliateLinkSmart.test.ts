import {
  detectAffiliatePlatform,
  isKnownAffiliateUrl,
  generateMarketingCopy,
  validateAffiliateUrl,
} from '@/lib/affiliateLinkSmart';

describe('detectAffiliatePlatform', () => {
  it('쿠팡 URL을 감지한다', () => {
    expect(detectAffiliatePlatform('https://www.coupang.com/vp/12345')).toBe('Coupang');
    expect(detectAffiliatePlatform('https://coupang.com/np/search?q=shoes')).toBe('Coupang');
  });

  it('토스 URL을 감지한다', () => {
    expect(detectAffiliatePlatform('https://toss.im/share/abc')).toBe('Toss');
    expect(detectAffiliatePlatform('https://toss.to/send/xyz')).toBe('Toss');
  });

  it('네이버 스마트스토어 URL을 감지한다', () => {
    expect(detectAffiliatePlatform('https://smartstore.naver.com/shop')).toBe('BrandConnect');
    expect(detectAffiliatePlatform('https://search.shopping.naver.com/all')).toBe('BrandConnect');
    expect(detectAffiliatePlatform('https://brand.naver.com/abc')).toBe('BrandConnect');
  });

  it('올리브영 URL을 감지한다', () => {
    expect(detectAffiliatePlatform('https://www.oliveyoung.co.kr/store')).toBe('OliveYoung');
  });

  it('알리익스프레스 URL을 감지한다', () => {
    expect(detectAffiliatePlatform('https://www.aliexpress.com/item/123')).toBe('AliExpress');
    expect(detectAffiliatePlatform('https://www.aliexpress.kr/i/456')).toBe('AliExpress');
  });

  it('아마존 URL을 감지한다', () => {
    expect(detectAffiliatePlatform('https://www.amazon.com/dp/B123')).toBe('Amazon');
    expect(detectAffiliatePlatform('https://www.amazon.co.jp/dp/B456')).toBe('Amazon');
    expect(detectAffiliatePlatform('https://www.amazon.co.uk/dp/B789')).toBe('Amazon');
    expect(detectAffiliatePlatform('https://www.amazon.de/dp/B999')).toBe('Amazon');
  });

  it('알 수 없는 URL은 Custom을 반환한다', () => {
    expect(detectAffiliatePlatform('https://www.example.com')).toBe('Custom');
    expect(detectAffiliatePlatform('https://blog.naver.com/abc')).toBe('Custom');
    expect(detectAffiliatePlatform('')).toBe('Custom');
  });
});

describe('isKnownAffiliateUrl', () => {
  it('알려진 제휴 URL에 true를 반환한다', () => {
    expect(isKnownAffiliateUrl('https://www.coupang.com/vp/123')).toBe(true);
    expect(isKnownAffiliateUrl('https://toss.im/share/abc')).toBe(true);
    expect(isKnownAffiliateUrl('https://smartstore.naver.com/shop')).toBe(true);
  });

  it('알 수 없는 URL에 false를 반환한다', () => {
    expect(isKnownAffiliateUrl('https://www.example.com')).toBe(false);
    expect(isKnownAffiliateUrl('https://google.com')).toBe(false);
  });
});

describe('generateMarketingCopy', () => {
  it('쿠팡 링크용 마케팅 카피를 생성한다', () => {
    const result = generateMarketingCopy(
      'https://www.coupang.com/vp/123',
      '에어포스 1',
      '100,000원',
    );
    expect(result.platform).toBe('Coupang');
    expect(result.isAffiliate).toBe(true);
    expect(result.marketingCopy).toContain('쿠팡');
    expect(result.marketingCopy).toContain('에어포스 1');
  });

  it('가격 라벨이 없으면 가격 텍스트를 생략한다', () => {
    const result = generateMarketingCopy(
      'https://www.coupang.com/vp/123',
      '에어포스 1',
      '',
    );
    expect(result.marketingCopy).not.toContain('원에');
  });

  it('쿠팡 검색 링크와 상품 링크를 구분한다', () => {
    const searchResult = generateMarketingCopy(
      'https://coupang.com/np/search?q=shoes',
      '신발',
      '',
    );
    const productResult = generateMarketingCopy(
      'https://coupang.com/vp/products/123',
      '신발',
      '',
    );
    expect(searchResult.shortHint).toContain('검색');
    expect(productResult.shortHint).toContain('상품');
  });

  it('커스텀 URL도 마케팅 카피를 생성한다', () => {
    const result = generateMarketingCopy(
      'https://www.example.com/product/123',
      '커스텀 제품',
      '50,000원',
    );
    expect(result.platform).toBe('Custom');
    expect(result.marketingCopy).toContain('커스텀 제품');
    expect(result.marketingCopy).toContain('50,000원');
  });

  it('URL에서 제품명을 추출한다', () => {
    const result = generateMarketingCopy(
      'https://www.coupang.com/np/search?q=나이키+에어포스',
      '무시됨',
      '',
    );
    expect(result.marketingCopy).toContain('나이키 에어포스');
  });
});

describe('validateAffiliateUrl', () => {
  it('빈 입력을 거부한다', () => {
    const result = validateAffiliateUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('잘못된 URL 형식을 거부한다', () => {
    const result = validateAffiliateUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('일반 제휴 링크는 valid를 반환한다', () => {
    const result = validateAffiliateUrl('https://www.coupang.com/vp/123');
    expect(result.valid).toBe(true);
    expect(result.platform).toBe('Coupang');
    expect(result.warning).toBeUndefined();
  });

  it('아마존 URL에 경고를 포함한다', () => {
    const result = validateAffiliateUrl('https://www.amazon.com/dp/B123');
    expect(result.valid).toBe(true);
    expect(result.platform).toBe('Amazon');
    expect(result.warning).toBeTruthy();
    expect(result.warning).toContain('아마존');
  });

  it('알리익스프레스 URL에 경고를 포함한다', () => {
    const result = validateAffiliateUrl('https://www.aliexpress.com/item/123');
    expect(result.valid).toBe(true);
    expect(result.platform).toBe('AliExpress');
    expect(result.warning).toBeTruthy();
    expect(result.warning).toContain('알리');
  });
});
