import {
  secToMs,
  msToSec,
  distributeProportionalMs,
  validateTimelineInvariant,
  MIN_SEGMENT_MS,
} from '@/lib/timelineInvariant';

describe('timelineInvariant', () => {
  describe('secToMs / msToSec', () => {
    it('rounds float seconds to integer ms', () => {
      expect(secToMs(15)).toBe(15000);
      expect(secToMs(3.7)).toBe(3700);
      expect(secToMs(0.1)).toBe(100);
    });

    it('converts ms back to seconds with 3 decimal places', () => {
      expect(msToSec(15000)).toBe(15);
      expect(msToSec(3700)).toBe(3.7);
      expect(msToSec(100)).toBe(0.1);
    });

    it('round-trips correctly for integer ms', () => {
      for (let ms = 0; ms <= 60000; ms += 100) {
        expect(secToMs(msToSec(ms))).toBe(ms);
      }
    });
  });

  describe('distributeProportionalMs', () => {
    it('distributes 15s proportionally among 4 segments with exact sum', () => {
      const total = 15000;
      const ratios = [0.20, 0.27, 0.26, 0.14];
      const boundaries = distributeProportionalMs(total, ratios);

      const sum = boundaries.reduce((acc, b) => acc + (b.endMs - b.startMs), 0);
      expect(sum).toBe(total);
    });

    it('segments are contiguous (each startMs == previous endMs)', () => {
      const boundaries = distributeProportionalMs(15000, [0.20, 0.27, 0.26, 0.14]);
      for (let i = 1; i < boundaries.length; i++) {
        expect(boundaries[i].startMs).toBe(boundaries[i - 1].endMs);
      }
    });

    it('first segment starts at 0', () => {
      const boundaries = distributeProportionalMs(15000, [0.20, 0.27, 0.26, 0.14]);
      expect(boundaries[0].startMs).toBe(0);
    });

    it('last segment ends at total', () => {
      const boundaries = distributeProportionalMs(15000, [0.20, 0.27, 0.26, 0.14]);
      expect(boundaries[boundaries.length - 1].endMs).toBe(15000);
    });

    it('each segment is at least MIN_SEGMENT_MS', () => {
      const boundaries = distributeProportionalMs(15000, [0.20, 0.27, 0.26, 0.14]);
      for (const b of boundaries) {
        expect(b.endMs - b.startMs).toBeGreaterThanOrEqual(MIN_SEGMENT_MS);
      }
    });

    it('handles short durations (3s) without ghost segments', () => {
      const boundaries = distributeProportionalMs(3000, [0.20, 0.27, 0.26, 0.14]);
      const sum = boundaries.reduce((acc, b) => acc + (b.endMs - b.startMs), 0);
      expect(sum).toBe(3000);
      for (const b of boundaries) {
        expect(b.endMs - b.startMs).toBeGreaterThanOrEqual(MIN_SEGMENT_MS);
      }
    });

    it('handles 5 emotion curve ratios with exact sum', () => {
      const ratios = [0.15, 0.25, 0.30, 0.20, 0.10];
      const boundaries = distributeProportionalMs(20000, ratios);
      const sum = boundaries.reduce((acc, b) => acc + (b.endMs - b.startMs), 0);
      expect(sum).toBe(20000);
    });

    it('returns empty array for zero or negative total', () => {
      expect(distributeProportionalMs(0, [0.5, 0.5])).toEqual([]);
      expect(distributeProportionalMs(-100, [0.5, 0.5])).toEqual([]);
    });

    it('drops segments below MIN_SEGMENT_MS and extends last segment to fill gap', () => {
      // 500ms total with 5 ratios — some segments will be below 100ms
      const boundaries = distributeProportionalMs(500, [0.15, 0.25, 0.30, 0.20, 0.10]);
      const sum = boundaries.reduce((acc, b) => acc + (b.endMs - b.startMs), 0);
      expect(sum).toBe(500);
      for (const b of boundaries) {
        expect(b.endMs - b.startMs).toBeGreaterThanOrEqual(MIN_SEGMENT_MS);
      }
    });

    it('handles extreme ratio imbalance', () => {
      const boundaries = distributeProportionalMs(10000, [0.99, 0.01]);
      const sum = boundaries.reduce((acc, b) => acc + (b.endMs - b.startMs), 0);
      expect(sum).toBe(10000);
      for (const b of boundaries) {
        expect(b.endMs - b.startMs).toBeGreaterThanOrEqual(MIN_SEGMENT_MS);
      }
    });
  });

  describe('validateTimelineInvariant', () => {
    it('returns null for valid contiguous segments', () => {
      const segments = [
        { startMs: 0, endMs: 3000 },
        { startMs: 3000, endMs: 7000 },
        { startMs: 7000, endMs: 10000 },
      ];
      expect(validateTimelineInvariant(segments, 10000)).toBeNull();
    });

    it('returns error for gap between segments', () => {
      const segments = [
        { startMs: 0, endMs: 3000 },
        { startMs: 3500, endMs: 10000 },
      ];
      const error = validateTimelineInvariant(segments, 10000);
      expect(error).toContain('시작점 불일치');
    });

    it('returns error for overlapping segments', () => {
      const segments = [
        { startMs: 0, endMs: 5000 },
        { startMs: 4000, endMs: 10000 },
      ];
      const error = validateTimelineInvariant(segments, 10000);
      expect(error).toContain('시작점 불일치');
    });

    it('returns error for sum mismatch', () => {
      const segments = [
        { startMs: 0, endMs: 3000 },
        { startMs: 3000, endMs: 9000 },
      ];
      const error = validateTimelineInvariant(segments, 10000);
      expect(error).toContain('총합 불일치');
      expect(error).toContain('1000ms');
    });

    it('returns error for ghost segment below MIN_SEGMENT_MS', () => {
      const segments = [
        { startMs: 0, endMs: 50 },
        { startMs: 50, endMs: 10000 },
      ];
      const error = validateTimelineInvariant(segments, 10000);
      expect(error).toContain('유령 세그먼트');
    });

    it('returns error for negative-length segment', () => {
      const segments = [
        { startMs: 0, endMs: 5000 },
        { startMs: 5000, endMs: 3000 },
      ];
      const error = validateTimelineInvariant(segments, 3000);
      expect(error).toContain('음수 길이');
    });

    it('returns error for empty segments with non-zero expected total', () => {
      expect(validateTimelineInvariant([], 10000)).toContain('빈 타임라인');
    });

    it('returns null for empty segments with zero expected total', () => {
      expect(validateTimelineInvariant([], 0)).toBeNull();
    });
  });

  describe('integration: distributeProportionalMs output always passes invariant', () => {
    it('15s with 4 phase ratios', () => {
      const boundaries = distributeProportionalMs(15000, [0.20, 0.27, 0.26, 0.14]);
      expect(validateTimelineInvariant(boundaries, 15000)).toBeNull();
    });

    it('20s with 5 emotion ratios', () => {
      const boundaries = distributeProportionalMs(20000, [0.15, 0.25, 0.30, 0.20, 0.10]);
      expect(validateTimelineInvariant(boundaries, 20000)).toBeNull();
    });

    it('3s (edge case) with 4 phase ratios', () => {
      const boundaries = distributeProportionalMs(3000, [0.20, 0.27, 0.26, 0.14]);
      expect(validateTimelineInvariant(boundaries, 3000)).toBeNull();
    });

    it('30s with 5 emotion ratios', () => {
      const boundaries = distributeProportionalMs(30000, [0.15, 0.25, 0.30, 0.20, 0.10]);
      expect(validateTimelineInvariant(boundaries, 30000)).toBeNull();
    });
  });
});
