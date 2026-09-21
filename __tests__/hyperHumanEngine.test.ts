import {
  HOOK_TEMPLATES,
  generateHook,
  generateHookVariations,
  generateMultiHookVariations,
  buildHookSystemPrompt,
  getHookTypeLabel,
  getHookTypeEmoji,
  type HookType,
} from '@/lib/hyperHumanEngine';

describe('hyperHumanEngine', () => {
  describe('HOOK_TEMPLATES', () => {
    it('has 3 hook types', () => {
      expect(Object.keys(HOOK_TEMPLATES)).toHaveLength(3);
    });

    it('each type has templates', () => {
      for (const type of Object.keys(HOOK_TEMPLATES) as HookType[]) {
        expect(HOOK_TEMPLATES[type].templates.length).toBeGreaterThan(3);
        expect(HOOK_TEMPLATES[type].label).toBeTruthy();
        expect(HOOK_TEMPLATES[type].emoji).toBeTruthy();
      }
    });
  });

  describe('generateHook', () => {
    it('generates a reversal hook', () => {
      const result = generateHook('reversal', '무선청소기', '이거 진짜 좋아요', ['꿀템', '가성비']);
      expect(result.type).toBe('reversal');
      expect(result.hook).toBeTruthy();
      expect(result.caption).toBeTruthy();
      expect(result.hashtags).toEqual(['꿀템', '가성비']);
    });

    it('generates an empathy hook', () => {
      const result = generateHook('empathy', '무선청소기', '이거 진짜 좋아요', ['꿀템']);
      expect(result.type).toBe('empathy');
      expect(result.hook).toBeTruthy();
    });

    it('generates a selfDeprecating hook', () => {
      const result = generateHook('selfDeprecating', '무선청소기', '이거 진짜 좋아요', ['꿀템']);
      expect(result.type).toBe('selfDeprecating');
      expect(result.hook).toBeTruthy();
    });
  });

  describe('generateHookVariations', () => {
    it('generates requested number of variations', () => {
      const results = generateHookVariations('reversal', '청소기', '좋아요', ['꿀템'], 3);
      expect(results).toHaveLength(3);
      results.forEach((r) => {
        expect(r.type).toBe('reversal');
        expect(r.hook).toBeTruthy();
      });
    });

    it('handles count=1', () => {
      const results = generateHookVariations('empathy', '청소기', '좋아요', ['꿀템'], 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('generateMultiHookVariations', () => {
    it('generates variations for all 3 types', () => {
      const multi = generateMultiHookVariations('청소기', '좋아요', ['꿀템'], 2);
      expect(multi).toHaveLength(3);
      expect(multi[0].type).toBe('reversal');
      expect(multi[1].type).toBe('empathy');
      expect(multi[2].type).toBe('selfDeprecating');
      multi.forEach((group) => {
        expect(group.results).toHaveLength(2);
      });
    });
  });

  describe('buildHookSystemPrompt', () => {
    it('includes product name and hook type label', () => {
      const prompt = buildHookSystemPrompt('무선청소기', 'reversal');
      expect(prompt).toContain('무선청소기');
      expect(prompt).toContain('반전형');
    });
  });

  describe('getHookTypeLabel / getHookTypeEmoji', () => {
    it('returns correct labels', () => {
      expect(getHookTypeLabel('reversal')).toBe('반전형');
      expect(getHookTypeLabel('empathy')).toBe('공감 유발형');
      expect(getHookTypeLabel('selfDeprecating')).toBe('자학적 유머형');
    });

    it('returns correct emojis', () => {
      expect(getHookTypeEmoji('reversal')).toBe('🔄');
      expect(getHookTypeEmoji('empathy')).toBe('🤝');
      expect(getHookTypeEmoji('selfDeprecating')).toBe('😂');
    });
  });
});
