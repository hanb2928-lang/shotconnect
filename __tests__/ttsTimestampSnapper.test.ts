import {
  normalizeTtsText,
  estimateSyllables,
  estimateAudioDurationMs,
  snapSegmentTimestamp,
  snapSegmentBatch,
  SYNC_DRIFT_THRESHOLD_MS,
} from '@/lib/ttsTimestampSnapper';

describe('ttsTimestampSnapper', () => {
  describe('normalizeTtsText', () => {
    it('returns empty string for null/undefined/empty input', () => {
      expect(normalizeTtsText('')).toBe('');
      expect(normalizeTtsText(null as any)).toBe('');
      expect(normalizeTtsText(undefined as any)).toBe('');
    });

    it('strips emoji and decorative symbols', () => {
      const result = normalizeTtsText('이거 진짜 좋아요 🛍️🔥 최고예요 ✨');
      expect(result).not.toContain('🛍️');
      expect(result).not.toContain('🔥');
      expect(result).not.toContain('✨');
      expect(result).toContain('이거 진짜 좋아요');
      expect(result).toContain('최고예요');
    });

    it('collapses consecutive punctuation', () => {
      expect(normalizeTtsText('진짜!!! 좋아요???')).toBe('진짜! 좋아요?');
      expect(normalizeTtsText('대박。。。 좋아요。。。')).toBe('대박。 좋아요。');
    });

    it('merges empty syllables (punctuation with only whitespace between)', () => {
      expect(normalizeTtsText('좋아요 . ! ? 정말')).toBe('좋아요.!? 정말');
    });

    it('collapses consecutive whitespace to single space', () => {
      expect(normalizeTtsText('이거   진짜   좋아요')).toBe('이거 진짜 좋아요');
      expect(normalizeTtsText('이거\t\t진짜\n\n좋아요')).toBe('이거 진짜 좋아요');
    });

    it('removes zero-width characters', () => {
      expect(normalizeTtsText('이거\u200B진짜\uFEFF좋아요')).toBe('이거진짜좋아요');
    });

    it('preserves valid Hangul and punctuation', () => {
      expect(normalizeTtsText('이거 진짜 좋아요. 한번 써보세요!')).toBe('이거 진짜 좋아요. 한번 써보세요!');
    });

    it('repairs orphaned surrogates via sanitizeEncodedText', () => {
      const broken = '이거 진짜\uD800좋아요';
      const result = normalizeTtsText(broken);
      expect(result).not.toContain('\uD800');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeTtsText('   이거 좋아요   ')).toBe('이거 좋아요');
    });

    it('handles mixed Korean and English text', () => {
      const result = normalizeTtsText('이거 really 좋아요. amazing!');
      expect(result).toBe('이거 really 좋아요. amazing!');
    });
  });

  describe('estimateSyllables', () => {
    it('returns 0 for empty string', () => {
      expect(estimateSyllables('')).toBe(0);
    });

    it('counts each Hangul character as 1 syllable', () => {
      expect(estimateSyllables('이거진짜좋아요')).toBe(7);
    });

    it('counts English syllables via vowel groups', () => {
      const count = estimateSyllables('amazing product');
      // a-ma-zing = 3 vowels, pro-duct = 2 vowels → ~5
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(6);
    });

    it('counts CJK characters as 1 syllable each', () => {
      expect(estimateSyllables('商品真好')).toBe(4);
    });

    it('counts numbers as ~1 syllable per 2 digits', () => {
      const count = estimateSyllables('12345');
      // 5 digits → ceil(5/2) = 3
      expect(count).toBe(3);
    });

    it('handles mixed Korean and English', () => {
      const count = estimateSyllables('이거 amazing 좋아요');
      // 4 Hangul + ~3 English vowels = ~7
      expect(count).toBeGreaterThanOrEqual(6);
    });
  });

  describe('estimateAudioDurationMs', () => {
    it('returns 0 for empty text', () => {
      expect(estimateAudioDurationMs('', 1.0)).toBe(0);
    });

    it('estimates duration based on syllable count and speed', () => {
      // 7 Korean syllables at speed 1.0 → 7/7.5 = 0.933s → ~933ms
      const duration = estimateAudioDurationMs('이거진짜좋아요', 1.0);
      expect(duration).toBeGreaterThan(800);
      expect(duration).toBeLessThan(1100);
    });

    it('reduces duration at higher speed', () => {
      const normalDuration = estimateAudioDurationMs('이거진짜좋아요', 1.0);
      const fastDuration = estimateAudioDurationMs('이거진짜좋아요', 1.5);
      expect(fastDuration).toBeLessThan(normalDuration);
    });

    it('increases duration at lower speed', () => {
      const normalDuration = estimateAudioDurationMs('이거진짜좋아요', 1.0);
      const slowDuration = estimateAudioDurationMs('이거진짜좋아요', 0.5);
      expect(slowDuration).toBeGreaterThan(normalDuration);
    });
  });

  describe('snapSegmentTimestamp', () => {
    it('does not correct when drift is below threshold', () => {
      // 5 Korean syllables at speed 1.0 → ~667ms, allocated 700ms → drift = -33ms
      const result = snapSegmentTimestamp(0, 700, '이거진짜좋', 1.0);
      expect(result.corrected).toBe(false);
      expect(result.endMs).toBe(700);
    });

    it('corrects when audio is significantly longer than allocated', () => {
      // 15 Korean syllables at speed 1.0 → ~2000ms, allocated 1000ms → drift = +1000ms
      const result = snapSegmentTimestamp(0, 1000, '이거진짜좋아요정말좋아요대박', 1.0);
      expect(result.corrected).toBe(true);
      expect(result.driftMs).toBeGreaterThan(SYNC_DRIFT_THRESHOLD_MS);
      expect(result.endMs).toBeGreaterThan(1000);
    });

    it('corrects when audio is significantly shorter than allocated', () => {
      // 2 Korean syllables at speed 2.0 → ~133ms, allocated 3000ms → drift = -2867ms
      const result = snapSegmentTimestamp(0, 3000, '이거', 2.0);
      expect(result.corrected).toBe(true);
      expect(result.driftMs).toBeLessThan(-SYNC_DRIFT_THRESHOLD_MS);
      expect(result.endMs).toBeLessThan(3000);
    });

    it('clamps corrected end to at least 100ms from start', () => {
      const result = snapSegmentTimestamp(5000, 5100, '', 1.0);
      expect(result.endMs).toBeGreaterThanOrEqual(5000 + 100);
    });

    it('clamps corrected end to at most 2x allocated or +1000ms', () => {
      // Very long text, very short allocation
      const result = snapSegmentTimestamp(0, 100, '이거진짜좋아요정말좋아요대박이거진짜좋아요정말좋아요대박', 0.5);
      const maxBound = Math.max(100 * 2, 100 + 1000);
      expect(result.endMs).toBeLessThanOrEqual(0 + maxBound);
    });

    it('preserves start time', () => {
      const result = snapSegmentTimestamp(5000, 8000, '이거진짜좋', 1.0);
      expect(result.startMs).toBe(5000);
    });
  });

  describe('snapSegmentBatch', () => {
    it('returns empty result for empty input', () => {
      const result = snapSegmentBatch([]);
      expect(result.segments).toEqual([]);
      expect(result.totalDriftMs).toBe(0);
      expect(result.correctedCount).toBe(0);
    });

    it('snaps each segment independently', () => {
      const result = snapSegmentBatch([
        { text: '이거진짜좋아요정말좋아요대박', startSec: 0, endSec: 1, speed: 1.0 },
        { text: '이거진짜좋아요정말좋아요대박', startSec: 1, endSec: 2, speed: 1.0 },
      ]);
      expect(result.segments).toHaveLength(2);
      expect(result.correctedCount).toBeGreaterThan(0);
    });

    it('keeps consecutive segments contiguous after snapping', () => {
      const result = snapSegmentBatch([
        { text: '이거진짜좋아요정말좋아요대박이거', startSec: 0, endSec: 1, speed: 1.0 },
        { text: '이거진짜좋', startSec: 1, endSec: 5, speed: 1.0 },
      ]);
      // Second segment's start should equal first segment's end
      expect(result.segments[1].startSec).toBeCloseTo(result.segments[0].endSec, 3);
    });

    it('reports total drift across all segments', () => {
      const result = snapSegmentBatch([
        { text: '이거진짜좋아요정말좋아요대박', startSec: 0, endSec: 0.5, speed: 1.0 },
        { text: '이거진짜좋아요정말좋아요대박', startSec: 0.5, endSec: 1, speed: 1.0 },
      ]);
      expect(result.totalDriftMs).toBeGreaterThan(0);
    });

    it('does not correct segments within threshold', () => {
      // ~5 syllables at speed 1 → ~667ms, allocated 700ms → drift -33ms (under 50ms)
      const result = snapSegmentBatch([
        { text: '이거진짜좋', startSec: 0, endSec: 0.7, speed: 1.0 },
      ]);
      expect(result.correctedCount).toBe(0);
    });
  });
});
