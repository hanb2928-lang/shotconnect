/**
 * Tests for step-to-progress mapping in videoGenSteps.ts
 *
 * Verifies that backend step values and Runway API status values
 * correctly map to the 6-step UI progress thresholds.
 */

import { stepToProgress } from '@/lib/videoGenSteps';

describe('stepToProgress — backend step values', () => {
  it('maps "idle" to analyze threshold (0.05)', () => {
    expect(stepToProgress('idle')).toBe(0.05);
  });

  it('maps "analyzing" to analyze threshold (0.05)', () => {
    expect(stepToProgress('analyzing')).toBe(0.05);
  });

  it('maps "hooking" to hook threshold (0.15)', () => {
    expect(stepToProgress('hooking')).toBe(0.15);
  });

  it('maps "planning" to plan threshold (0.25)', () => {
    expect(stepToProgress('planning')).toBe(0.25);
  });

  it('maps "submitting" to submit threshold (0.35)', () => {
    expect(stepToProgress('submitting')).toBe(0.35);
  });

  it('maps "rendering" to render range (0.50)', () => {
    expect(stepToProgress('rendering')).toBe(0.50);
  });

  it('maps "finalizing" to finalize threshold (0.95)', () => {
    expect(stepToProgress('finalizing')).toBe(0.95);
  });

  it('maps "completed" to 1.0', () => {
    expect(stepToProgress('completed')).toBe(1.0);
  });

  it('maps "failed" to 0', () => {
    expect(stepToProgress('failed')).toBe(0);
  });
});

describe('stepToProgress — Runway API status values', () => {
  it('maps PENDING to submitting range', () => {
    expect(stepToProgress('PENDING')).toBe(0.35);
  });

  it('maps PROCESSING to rendering range', () => {
    expect(stepToProgress('PROCESSING')).toBe(0.50);
  });

  it('maps RUNNING to rendering range', () => {
    expect(stepToProgress('RUNNING')).toBe(0.50);
  });

  it('maps THROTTLED to rendering range', () => {
    expect(stepToProgress('THROTTLED')).toBe(0.45);
  });

  it('maps QUEUED to submitting range', () => {
    expect(stepToProgress('QUEUED')).toBe(0.38);
  });

  it('maps SUCCESS to 1.0', () => {
    expect(stepToProgress('SUCCESS')).toBe(1.0);
  });

  it('maps SUCCEEDED to 1.0', () => {
    expect(stepToProgress('SUCCEEDED')).toBe(1.0);
  });

  it('maps FAILED to 0', () => {
    expect(stepToProgress('FAILED')).toBe(0);
  });

  it('maps CANCELED to 0', () => {
    expect(stepToProgress('CANCELED')).toBe(0);
  });
});

describe('stepToProgress — edge cases', () => {
  it('returns null for null input', () => {
    expect(stepToProgress(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(stepToProgress(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(stepToProgress('')).toBeNull();
  });

  it('returns null for unknown step value', () => {
    expect(stepToProgress('unknown_step')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(stepToProgress('RENDERING')).toBe(0.50);
    expect(stepToProgress('Rendering')).toBe(0.50);
    expect(stepToProgress('rendering')).toBe(0.50);
  });
});
