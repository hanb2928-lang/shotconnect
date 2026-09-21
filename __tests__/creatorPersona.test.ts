import {
  calculateOriginalityScore,
  type OriginalityFactors,
} from '@/lib/originalityScore';
import {
  buildPersonaDirective,
  TONE_PRESETS,
  type CreatorPersona,
} from '@/lib/creatorPersona';

describe('creatorPersona', () => {
  describe('TONE_PRESETS', () => {
    it('has all 5 tone presets', () => {
      expect(Object.keys(TONE_PRESETS)).toHaveLength(5);
      expect(TONE_PRESETS.honest).toBeDefined();
      expect(TONE_PRESETS.humor).toBeDefined();
      expect(TONE_PRESETS.emotional).toBeDefined();
      expect(TONE_PRESETS.expert).toBeDefined();
      expect(TONE_PRESETS.casual).toBeDefined();
    });

    it('each preset has label, emoji, and description', () => {
      for (const key of Object.keys(TONE_PRESETS) as (keyof typeof TONE_PRESETS)[]) {
        const preset = TONE_PRESETS[key];
        expect(preset.label).toBeTruthy();
        expect(preset.emoji).toBeTruthy();
        expect(preset.description).toBeTruthy();
      }
    });
  });

  describe('buildPersonaDirective', () => {
    it('returns empty string for null persona', () => {
      expect(buildPersonaDirective(null)).toBe('');
    });

    it('includes signature opening when set', () => {
      const persona = {
        id: '1',
        signature_opening: '안녕하세요!',
        signature_ending: null,
        tone_preset: 'casual',
        voice_clone_ref: null,
        signature_font: null,
        signature_color: null,
        caricature_url: null,
        created_at: '',
        updated_at: '',
      } as CreatorPersona;
      const directive = buildPersonaDirective(persona);
      expect(directive).toContain('안녕하세요!');
      expect(directive).toContain('시그니처 오프닝');
    });

    it('includes signature ending when set', () => {
      const persona = {
        id: '1',
        signature_opening: null,
        signature_ending: '오늘도 꿀템 하나 건졌습니다',
        tone_preset: 'casual',
        voice_clone_ref: null,
        signature_font: null,
        signature_color: null,
        caricature_url: null,
        created_at: '',
        updated_at: '',
      } as CreatorPersona;
      const directive = buildPersonaDirective(persona);
      expect(directive).toContain('오늘도 꿀템 하나 건졌습니다');
    });

    it('includes tone preset label', () => {
      const persona = {
        id: '1',
        signature_opening: null,
        signature_ending: null,
        tone_preset: 'honest',
        voice_clone_ref: null,
        signature_font: null,
        signature_color: null,
        caricature_url: null,
        created_at: '',
        updated_at: '',
      } as CreatorPersona;
      const directive = buildPersonaDirective(persona);
      expect(directive).toContain('솔직/비판적 리뷰');
    });

    it('includes signature color when set', () => {
      const persona = {
        id: '1',
        signature_opening: null,
        signature_ending: null,
        tone_preset: 'casual',
        voice_clone_ref: null,
        signature_font: null,
        signature_color: '#ff6b6b',
        caricature_url: null,
        created_at: '',
        updated_at: '',
      } as CreatorPersona;
      const directive = buildPersonaDirective(persona);
      expect(directive).toContain('#ff6b6b');
    });
  });
});

describe('originalityScore', () => {
  const baseFactors: OriginalityFactors = {
    hasPersonaSignature: false,
    hasCustomTone: false,
    hasVoiceClone: false,
    hasMicroEdit: false,
    hasUniqueAngle: false,
    cacheHitCount: 0,
  };

  it('returns danger level for pure AI default (no persona)', () => {
    const result = calculateOriginalityScore(baseFactors);
    expect(result.score).toBe(30);
    expect(result.level).toBe('danger');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('increases score with persona signature', () => {
    const result = calculateOriginalityScore({ ...baseFactors, hasPersonaSignature: true });
    expect(result.score).toBe(50);
  });

  it('increases score with all factors', () => {
    const result = calculateOriginalityScore({
      hasPersonaSignature: true,
      hasCustomTone: true,
      hasVoiceClone: true,
      hasMicroEdit: true,
      hasUniqueAngle: true,
      cacheHitCount: 0,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('unique');
  });

  it('penalizes for high cache hit count', () => {
    const result = calculateOriginalityScore({
      ...baseFactors,
      hasPersonaSignature: true,
      cacheHitCount: 150,
    });
    expect(result.score).toBe(35); // 30 + 20 - 15
  });

  it('caps score at 100', () => {
    const result = calculateOriginalityScore({
      hasPersonaSignature: true,
      hasCustomTone: true,
      hasVoiceClone: true,
      hasMicroEdit: true,
      hasUniqueAngle: true,
      cacheHitCount: 0,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('never goes below 0', () => {
    const result = calculateOriginalityScore({
      ...baseFactors,
      cacheHitCount: 500,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('returns correct level thresholds', () => {
    expect(calculateOriginalityScore({ ...baseFactors, hasPersonaSignature: true, hasCustomTone: true, hasVoiceClone: true, hasMicroEdit: true, hasUniqueAngle: true }).level).toBe('unique');
    expect(calculateOriginalityScore({ ...baseFactors, hasPersonaSignature: true, hasCustomTone: true, hasVoiceClone: true }).level).toBe('good');
    expect(calculateOriginalityScore({ ...baseFactors, hasPersonaSignature: true }).level).toBe('caution');
    expect(calculateOriginalityScore(baseFactors).level).toBe('danger');
  });
});
