import {
  checkTabooWords,
  calculateSuitabilityScore,
  buildLegalTags,
  injectDisclosure,
  buildTranscreationPrompt,
  getCountryRegulation,
  getTranscreationPreset,
  COUNTRY_REGULATIONS,
  type CountryCode,
  type SuitabilityFactor,
} from '@/lib/localizationSafety';

describe('localizationSafety', () => {
  describe('COUNTRY_REGULATIONS', () => {
    it('has all 12 countries', () => {
      expect(Object.keys(COUNTRY_REGULATIONS)).toHaveLength(12);
    });

    it('each country has required fields', () => {
      for (const code of Object.keys(COUNTRY_REGULATIONS) as CountryCode[]) {
        const reg = COUNTRY_REGULATIONS[code];
        expect(reg.name).toBeTruthy();
        expect(reg.flag).toBeTruthy();
        expect(reg.regulationName).toBeTruthy();
        expect(reg.requiredTags.length).toBeGreaterThan(0);
        expect(['top', 'bottom', 'both']).toContain(reg.disclosurePosition);
      }
    });
  });

  describe('checkTabooWords', () => {
    it('detects Korean taboo word "최고"', () => {
      const violations = checkTabooWords('이건 최고의 제품입니다', 'KR');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.word === '최고')).toBe(true);
    });

    it('detects Japanese taboo word "最強"', () => {
      const violations = checkTabooWords('最強のアイテムです', 'JP');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('detects US taboo word "cure"', () => {
      const violations = checkTabooWords('This will cure your pain', 'US');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('detects Chinese taboo word "绝对"', () => {
      const violations = checkTabooWords('绝对最好的产品', 'CN');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('returns empty for clean text', () => {
      const violations = checkTabooWords('This is a nice product', 'US');
      expect(violations).toHaveLength(0);
    });

    it('only flags words for relevant countries', () => {
      const jpViolations = checkTabooWords('最強のアイテム', 'KR');
      expect(jpViolations).toHaveLength(0);
    });
  });

  describe('calculateSuitabilityScore', () => {
    const optimal: SuitabilityFactor = {
      legalCompliant: true,
      hasDisclosure: true,
      tabooViolations: 0,
      transcreationApplied: true,
      nativeToneMatch: true,
    };

    const worst: SuitabilityFactor = {
      legalCompliant: false,
      hasDisclosure: false,
      tabooViolations: 5,
      transcreationApplied: false,
      nativeToneMatch: false,
    };

    it('returns optimal for all factors satisfied', () => {
      const result = calculateSuitabilityScore(optimal);
      expect(result.score).toBe(100);
      expect(result.level).toBe('optimal');
      expect(result.legalScore).toBe(50);
      expect(result.culturalScore).toBe(50);
    });

    it('returns unsafe for worst case', () => {
      const result = calculateSuitabilityScore(worst);
      expect(result.score).toBeLessThan(40);
      expect(result.level).toBe('unsafe');
    });

    it('returns caution for partial compliance', () => {
      const result = calculateSuitabilityScore({
        legalCompliant: true,
        hasDisclosure: true,
        tabooViolations: 1,
        transcreationApplied: false,
        nativeToneMatch: false,
      });
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.score).toBeLessThan(70);
      expect(result.level).toBe('caution');
    });

    it('returns safe for good compliance', () => {
      const result = calculateSuitabilityScore({
        legalCompliant: true,
        hasDisclosure: true,
        tabooViolations: 0,
        transcreationApplied: true,
        nativeToneMatch: false,
      });
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.level).toBe('safe');
    });

    it('never exceeds 100', () => {
      const result = calculateSuitabilityScore(optimal);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('generates badges for satisfied factors', () => {
      const result = calculateSuitabilityScore(optimal);
      expect(result.badges.length).toBeGreaterThan(0);
    });

    it('generates suggestions for unsatisfied factors', () => {
      const result = calculateSuitabilityScore(worst);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('buildLegalTags', () => {
    it('builds US tags', () => {
      const tags = buildLegalTags('US');
      expect(tags).toContain('#Ad');
      expect(tags).toContain('#PaidLink');
    });

    it('builds JP tags', () => {
      const tags = buildLegalTags('JP');
      expect(tags).toContain('#PR');
    });

    it('builds KR tags', () => {
      const tags = buildLegalTags('KR');
      expect(tags).toContain('소정의 수수료를 제공받을 수 있습니다');
    });
  });

  describe('injectDisclosure', () => {
    it('injects disclosure at top for US', () => {
      const result = injectDisclosure('Check this out!', 'US');
      expect(result).toContain('affiliate links');
      expect(result).toContain('#Ad');
      expect(result).toContain('Check this out!');
      expect(result.indexOf('affiliate links')).toBeLessThan(result.indexOf('Check this out!'));
    });

    it('injects disclosure at bottom for KR', () => {
      const result = injectDisclosure('이거 좋아요', 'KR');
      expect(result).toContain('수수료');
      expect(result).toContain('이거 좋아요');
      expect(result.indexOf('이거 좋아요')).toBeLessThan(result.indexOf('수수료'));
    });

    it('returns original when disabled', () => {
      const result = injectDisclosure('Hello', 'US', false);
      expect(result).toBe('Hello');
    });
  });

  describe('buildTranscreationPrompt', () => {
    it('builds prompt for US', () => {
      const prompt = buildTranscreationPrompt('US', 'praise');
      expect(prompt).toContain('US');
      expect(prompt).toContain('Gen-Z');
      expect(prompt).toContain('칭찬형');
    });

    it('builds prompt for JP', () => {
      const prompt = buildTranscreationPrompt('JP', 'honest');
      expect(prompt).toContain('JP');
      expect(prompt).toContain('若者');
      expect(prompt).toContain('솔직');
    });

    it('returns empty for country without preset', () => {
      const prompt = buildTranscreationPrompt('TH', 'info');
      // TH has no preset
      expect(prompt).toBe('');
    });
  });

  describe('getCountryRegulation', () => {
    it('returns regulation for known country', () => {
      const reg = getCountryRegulation('US');
      expect(reg.name).toBe('미국');
      expect(reg.regulationName).toBe('FTC Endorsement Guides');
    });
  });

  describe('getTranscreationPreset', () => {
    it('returns preset for US', () => {
      const preset = getTranscreationPreset('US');
      expect(preset).not.toBeNull();
      expect(preset!.toneName).toContain('Gen-Z');
      expect(preset!.popularKeywords.length).toBeGreaterThan(0);
    });

    it('returns null for country without preset', () => {
      const preset = getTranscreationPreset('TH');
      expect(preset).toBeNull();
    });
  });
});
