import {
  classifyComplexity,
  routeModel,
  pickModel,
  contentHash,
  buildCacheKey,
} from '@/lib/hybridAiRouter';

describe('hybridAiRouter', () => {
  describe('classifyComplexity', () => {
    it('classifies simple keyword tasks as simple', () => {
      expect(classifyComplexity('keyword-extract', 50)).toBe('simple');
    });

    it('classifies hashtag tasks as simple', () => {
      expect(classifyComplexity('hashtag-generate', 100)).toBe('simple');
    });

    it('classifies localization as complex', () => {
      expect(classifyComplexity('localize', 300)).toBe('complex');
    });

    it('classifies comic scenarios as complex', () => {
      expect(classifyComplexity('comic-scenario', 500)).toBe('complex');
    });

    it('classifies short non-copy text as simple', () => {
      expect(classifyComplexity('product-info', 100)).toBe('simple');
    });

    it('classifies long copy as complex', () => {
      expect(classifyComplexity('copy', 600)).toBe('complex');
    });

    it('classifies short copy as simple', () => {
      expect(classifyComplexity('copy', 200)).toBe('simple');
    });

    it('respects forceComplex option', () => {
      expect(classifyComplexity('keyword', 10, { forceComplex: true })).toBe('complex');
    });
  });

  describe('routeModel', () => {
    it('returns gpt-4o-mini for complex (pinned for cost)', () => {
      const route = routeModel('complex');
      expect(route.model).toBe('gpt-4o-mini');
      expect(route.estimatedCostSavings).toBe(0.95);
    });

    it('returns gpt-4o-mini for simple', () => {
      const route = routeModel('simple');
      expect(route.model).toBe('gpt-4o-mini');
      expect(route.estimatedCostSavings).toBe(0.95);
    });
  });

  describe('pickModel', () => {
    it('picks mini for simple tasks', () => {
      const route = pickModel('hashtag', 'short text');
      expect(route.model).toBe('gpt-4o-mini');
    });

    it('picks gpt-4o-mini for complex tasks (pinned for cost)', () => {
      const route = pickModel('localize', 'a'.repeat(600));
      expect(route.model).toBe('gpt-4o-mini');
    });
  });

  describe('contentHash', () => {
    it('produces deterministic hashes', () => {
      const h1 = contentHash('test input');
      const h2 = contentHash('test input');
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different inputs', () => {
      const h1 = contentHash('test input 1');
      const h2 = contentHash('test input 2');
      expect(h1).not.toBe(h2);
    });

    it('returns a 16-char hex string', () => {
      const h = contentHash('test');
      expect(h).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('buildCacheKey', () => {
    it('includes task type and hash', () => {
      const key = buildCacheKey('generate-copy', 'test input');
      expect(key.startsWith('generate-copy:')).toBe(true);
    });

    it('includes extra params', () => {
      const key = buildCacheKey('generate-copy', 'test', { platform: 'instagram' });
      expect(key.includes('platform:instagram')).toBe(true);
    });

    it('is deterministic for same inputs', () => {
      const k1 = buildCacheKey('task', 'input', { a: '1', b: '2' });
      const k2 = buildCacheKey('task', 'input', { b: '2', a: '1' });
      expect(k1).toBe(k2);
    });
  });
});
