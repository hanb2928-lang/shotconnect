/**
 * Integer-millisecond timeline arithmetic helpers.
 *
 * Floating-point seconds accumulate rounding errors when segments are
 * split, merged, or resized rapidly. By converting to integer milliseconds
 * for all arithmetic and only converting back to seconds at the boundary,
 * we eliminate drift and can assert a strict invariant: the sum of segment
 * durations must equal the master timeline duration.
 */

/** Minimum segment length in ms (0.1s). Segments below this are ghost segments. */
export const MIN_SEGMENT_MS = 100;

/** Round a float-second value to integer milliseconds. */
export function secToMs(sec: number): number {
  return Math.round(sec * 1000);
}

/** Convert integer milliseconds back to seconds (float, 3 decimal places). */
export function msToSec(ms: number): number {
  return Math.round(ms) / 1000;
}

/**
 * Split a total duration (ms) into proportional boundaries using integer
 * arithmetic. Returns an array of [startMs, endMs] pairs that:
 *   - Are strictly contiguous (each startMs == previous endMs)
 *   - Have no zero-length or negative segments
 *   - Sum exactly to totalMs
 *   - Each segment is at least MIN_SEGMENT_MS, dropping any that fall below
 */
export function distributeProportionalMs(
  totalMs: number,
  ratios: number[],
): Array<{ startMs: number; endMs: number }> {
  if (totalMs <= 0) return [];
  const sum = ratios.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];

  // Distribute ms using largest-remainder method to guarantee the sum is exact.
  const raw = ratios.map((r) => (r / sum) * totalMs);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = totalMs - floored.reduce((a, b) => a + b, 0);

  // Assign leftover ms to the largest fractional parts.
  const fractional = raw
    .map((v, i) => ({ i, frac: v - floored[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < fractional.length; k++) {
    floored[fractional[k].i] += 1;
  }

  // First pass: compute all raw boundaries.
  const rawBoundaries: Array<{ startMs: number; endMs: number }> = [];
  let cursor = 0;
  for (let i = 0; i < floored.length; i++) {
    const end = cursor + floored[i];
    rawBoundaries.push({ startMs: cursor, endMs: end });
    cursor = end;
  }

  // Second pass: merge ghost segments (< MIN_SEGMENT_MS) into adjacent
  // segments. Ghosts at the start merge into the next kept segment;
  // ghosts in the middle or end merge into the previous kept segment.
  const result: Array<{ startMs: number; endMs: number }> = [];
  for (const seg of rawBoundaries) {
    const duration = seg.endMs - seg.startMs;
    if (duration >= MIN_SEGMENT_MS) {
      result.push({ ...seg });
    } else if (result.length > 0) {
      result[result.length - 1].endMs = seg.endMs;
    } else {
      // No previous segment — this ghost's time will be absorbed by
      // the next kept segment by extending its startMs back to 0.
      // We'll handle this by pushing a placeholder that the next
      // non-ghost segment will absorb.
      result.push({ ...seg });
    }
  }

  // If the first segment is a ghost, merge it forward into the next.
  if (result.length > 1 && result[0].endMs - result[0].startMs < MIN_SEGMENT_MS) {
    result[1].startMs = result[0].startMs;
    result.shift();
  }

  // Ensure the last segment extends to totalMs (covers tail ghosts).
  if (result.length > 0 && result[result.length - 1].endMs < totalMs) {
    result[result.length - 1].endMs = totalMs;
  }

  return result;
}

/**
 * Invariant check: verify that segments are contiguous, non-overlapping,
 * and sum exactly to the expected total duration in ms.
 * Returns null if valid, or an error description string if violated.
 */
export function validateTimelineInvariant(
  segments: Array<{ startMs: number; endMs: number }>,
  expectedTotalMs: number,
): string | null {
  if (segments.length === 0) {
    if (expectedTotalMs > 0) {
      return `빈 타임라인: 예상 총합 ${expectedTotalMs}ms와 불일치`;
    }
    return null;
  }

  let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.startMs !== cursor) {
      return `세그먼트 ${i} 시작점 불일치: ${seg.startMs}ms, 예상 ${cursor}ms`;
    }
    if (seg.endMs < seg.startMs) {
      return `세그먼트 ${i} 음수 길이: ${seg.endMs - seg.startMs}ms`;
    }
    if (seg.endMs - seg.startMs < MIN_SEGMENT_MS) {
      return `세그먼트 ${i} 유령 세그먼트: ${seg.endMs - seg.startMs}ms (최소 ${MIN_SEGMENT_MS}ms)`;
    }
    cursor = seg.endMs;
  }

  if (cursor !== expectedTotalMs) {
    return `타임라인 총합 불일치: ${cursor}ms, 예상 ${expectedTotalMs}ms (오차 ${cursor - expectedTotalMs}ms)`;
  }

  return null;
}
