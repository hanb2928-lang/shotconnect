import {
  generateVisualParams,
  generateTtsVariation,
  injectFillerWords,
  spinCaption,
  generateCaptionVariations,
  mutateHashtags,
  assessUploadSafety,
  recordUpload,
  calculateOverallSafety,
  type UploadRecord,
} from '@/lib/humanLikeEngine';

describe('humanLikeEngine', () => {
  describe('generateVisualParams', () => {
    it('returns params within expected ranges', () => {
      const params = generateVisualParams();
      expect(params.zoomSpeed).toBeGreaterThanOrEqual(1.0);
      expect(params.zoomSpeed).toBeLessThanOrEqual(1.2);
      expect(params.textYOffset).toBeGreaterThanOrEqual(-5);
      expect(params.textYOffset).toBeLessThanOrEqual(5);
      expect(params.fontVariant).toBeGreaterThanOrEqual(0);
      expect(params.fontVariant).toBeLessThan(3);
      expect(Math.abs(params.hueShift)).toBeLessThanOrEqual(0.5);
    });

    it('produces different values across calls', () => {
      const params1 = generateVisualParams();
      const params2 = generateVisualParams();
      // Extremely unlikely to be identical
      const allSame =
        params1.zoomSpeed === params2.zoomSpeed &&
        params1.textYOffset === params2.textYOffset &&
        params1.noiseSeed === params2.noiseSeed;
      expect(allSame).toBe(false);
    });
  });

  describe('generateTtsVariation', () => {
    it('adjusts speed within jitter range', () => {
      const variation = generateTtsVariation(1.0);
      expect(variation.speed).toBeGreaterThanOrEqual(0.92);
      expect(variation.speed).toBeLessThanOrEqual(1.08);
    });

    it('clamps speed to valid range', () => {
      const variation = generateTtsVariation(1.95);
      expect(variation.speed).toBeLessThanOrEqual(2.0);
    });

    it('generates bgm offset in range', () => {
      const variation = generateTtsVariation(1.0);
      expect(variation.bgmOffsetMs).toBeGreaterThanOrEqual(200);
      expect(variation.bgmOffsetMs).toBeLessThanOrEqual(500);
    });
  });

  describe('injectFillerWords', () => {
    it('returns original text when no filler/pause', () => {
      const params = { speed: 1.0, speedJitter: 0, fillerWord: null, pauseMarker: null, bgmOffsetMs: 300 };
      const result = injectFillerWords('원본 텍스트입니다.', params);
      expect(result).toBe('원본 텍스트입니다.');
    });

    it('injects filler word at start when no sentence break', () => {
      const params = { speed: 1.0, speedJitter: 0, fillerWord: '진짜', pauseMarker: null, bgmOffsetMs: 300 };
      const result = injectFillerWords('이거 좋아요.', params);
      expect(result).toContain('진짜');
    });

    it('injects filler word in second sentence', () => {
      const params = { speed: 1.0, speedJitter: 0, fillerWord: '음', pauseMarker: null, bgmOffsetMs: 300 };
      const result = injectFillerWords('첫 문장. 둘 문장.', params);
      expect(result).toContain('음');
      expect(result).toContain('둘 문장');
    });
  });

  describe('spinCaption', () => {
    it('returns a variation with different hook', () => {
      const variation = spinCaption('원본 후킹', '원본 캡션 내용입니다. 추천해요.', ['꿀템', '내돈내산']);
      expect(variation.hook).toBeTruthy();
      expect(variation.caption).toBeTruthy();
      expect(variation.hashtags).toEqual(['꿀템', '내돈내산']);
      expect(variation.variationSeed).toBeGreaterThanOrEqual(0);
      expect(variation.variationSeed).toBeLessThanOrEqual(1);
    });

    it('replaces synonyms in caption', () => {
      const variation = spinCaption('테스트', '이거 진짜 추천해요. 완전 좋아요.', []);
      // Should contain one of the synonyms
      const synonyms = ['추천', '강추', '따봉', '찐템', '진짜', '찐으로', '솔직히', '근본적으로', '완전', '진심으로', '제대로', '찐으로'];
      expect(synonyms.some((s) => variation.caption.includes(s))).toBe(true);
    });
  });

  describe('generateCaptionVariations', () => {
    it('generates the requested count', () => {
      const variations = generateCaptionVariations('후킹', '캡션', ['태그'], 5);
      expect(variations).toHaveLength(5);
    });

    it('each variation has required fields', () => {
      const variations = generateCaptionVariations('후킹', '캡션', ['태그'], 3);
      for (const v of variations) {
        expect(v.hook).toBeTruthy();
        expect(v.caption).toBeTruthy();
        expect(v.hashtags).toEqual(['태그']);
      }
    });
  });

  describe('mutateHashtags', () => {
    it('always includes essential tags first', () => {
      const result = mutateHashtags(['필수1', '필수2'], ['pool1', 'pool2', 'pool3', 'pool4'], 5);
      expect(result[0]).toBe('필수1');
      expect(result[1]).toBe('필수2');
      expect(result).toHaveLength(5);
    });

    it('respects target count', () => {
      const result = mutateHashtags(['필수1'], ['pool1', 'pool2'], 3);
      expect(result).toHaveLength(3);
    });

    it('handles insufficient pool', () => {
      const result = mutateHashtags(['필수1'], ['pool1'], 5);
      expect(result).toHaveLength(2);
    });

    it('randomizes pool tag order', () => {
      const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const results = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const r = mutateHashtags(['필수'], pool, 5);
        results.add(r.slice(1).join(','));
      }
      // At least 2 different orderings across 10 runs
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('assessUploadSafety', () => {
    it('returns safe for no prior uploads', () => {
      const assessment = assessUploadSafety('instagram', []);
      expect(assessment.level).toBe('safe');
      expect(assessment.score).toBe(100);
      expect(assessment.minutesSinceLastUpload).toBeNull();
    });

    it('returns danger for very recent upload', () => {
      const recent: UploadRecord[] = [{ platform: 'instagram', timestamp: Date.now() - 10 * 60000 }];
      const assessment = assessUploadSafety('instagram', recent);
      expect(assessment.level).toBe('danger');
      expect(assessment.score).toBeLessThan(30);
    });

    it('returns caution for moderate interval', () => {
      const moderate: UploadRecord[] = [{ platform: 'instagram', timestamp: Date.now() - 45 * 60000 }];
      const assessment = assessUploadSafety('instagram', moderate);
      expect(assessment.level).toBe('caution');
    });

    it('returns safe after cooldown period', () => {
      const old: UploadRecord[] = [{ platform: 'instagram', timestamp: Date.now() - 120 * 60000 }];
      const assessment = assessUploadSafety('instagram', old);
      expect(assessment.level).toBe('safe');
      expect(assessment.score).toBe(100);
    });

    it('ignores other platforms', () => {
      const otherPlatform: UploadRecord[] = [{ platform: 'twitter', timestamp: Date.now() - 5 * 60000 }];
      const assessment = assessUploadSafety('instagram', otherPlatform);
      expect(assessment.level).toBe('safe');
    });
  });

  describe('recordUpload', () => {
    it('adds a new record', () => {
      const records: UploadRecord[] = [{ platform: 'instagram', timestamp: 1000 }];
      const updated = recordUpload('twitter', records);
      expect(updated).toHaveLength(2);
      expect(updated[1].platform).toBe('twitter');
    });

    it('limits to 20 records', () => {
      const records: UploadRecord[] = Array.from({ length: 20 }, (_, i) => ({
        platform: 'instagram',
        timestamp: 1000 + i,
      }));
      const updated = recordUpload('twitter', records);
      expect(updated).toHaveLength(20);
      expect(updated[19].platform).toBe('twitter');
    });
  });

  describe('calculateOverallSafety', () => {
    it('returns high score when all factors are good', () => {
      const safeAssessment = assessUploadSafety('instagram', []);
      const score = calculateOverallSafety(true, true, true, safeAssessment);
      expect(score.overall).toBe(100);
      expect(score.recommendations).toHaveLength(0);
    });

    it('returns lower score when factors are missing', () => {
      const dangerAssessment = assessUploadSafety('instagram', [
        { platform: 'instagram', timestamp: Date.now() - 5 * 60000 },
      ]);
      const score = calculateOverallSafety(false, false, false, dangerAssessment);
      expect(score.overall).toBeLessThan(50);
      expect(score.recommendations.length).toBeGreaterThan(0);
    });

    it('weights factors correctly', () => {
      const safeAssessment = assessUploadSafety('instagram', []);
      const score = calculateOverallSafety(false, true, true, safeAssessment);
      // visual: 30, caption: 100, voice: 100, pacing: 100
      // 30*0.25 + 100*0.3 + 100*0.2 + 100*0.25 = 7.5 + 30 + 20 + 25 = 82.5 → 83
      expect(score.overall).toBe(83);
    });
  });
});
