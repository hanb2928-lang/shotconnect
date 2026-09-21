import { resolveVideoGenSteps, getCurrentStepIndex, VIDEO_GEN_STEPS } from '@/lib/videoGenSteps';
import type { VideoGenProgress } from '@/lib/aiVideoPipeline';

function makeProgress(phase: VideoGenProgress['phase'], progress: number, elapsedSec = 0): VideoGenProgress {
  return { phase, progress, message: 'test', elapsedSec };
}

describe('videoGenSteps', () => {
  it('has 6 steps in correct order', () => {
    expect(VIDEO_GEN_STEPS).toHaveLength(6);
    expect(VIDEO_GEN_STEPS[0].id).toBe('analyze');
    expect(VIDEO_GEN_STEPS[5].id).toBe('finalize');
  });

  it('all steps pending when progress is null', () => {
    const steps = resolveVideoGenSteps(null);
    expect(steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('first step active at low progress', () => {
    const steps = resolveVideoGenSteps(makeProgress('submitting', 0.02));
    expect(steps[0].status).toBe('active');
    expect(steps[1].status).toBe('pending');
  });

  it('analyze done, hook active at 0.10', () => {
    const steps = resolveVideoGenSteps(makeProgress('generating', 0.10));
    expect(steps[0].status).toBe('done');
    expect(steps[1].status).toBe('active');
  });

  it('multiple steps done at mid progress', () => {
    const steps = resolveVideoGenSteps(makeProgress('generating', 0.50));
    expect(steps[0].status).toBe('done');
    expect(steps[1].status).toBe('done');
    expect(steps[2].status).toBe('done');
    expect(steps[3].status).toBe('done');
    expect(steps[4].status).toBe('active');
    expect(steps[5].status).toBe('pending');
  });

  it('all done when completed', () => {
    const steps = resolveVideoGenSteps(makeProgress('completed', 1.0));
    expect(steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('error phase marks submit as active if progress was low', () => {
    const steps = resolveVideoGenSteps(makeProgress('error', 0.20));
    expect(steps[0].status).toBe('done');
    expect(steps[1].status).toBe('done');
    expect(steps[2].status).toBe('active');
    expect(steps[3].status).toBe('pending');
  });

  it('getCurrentStepIndex returns active step index', () => {
    const idx = getCurrentStepIndex(makeProgress('generating', 0.50));
    expect(idx).toBe(4);
  });

  it('getCurrentStepIndex returns last done when no active', () => {
    const idx = getCurrentStepIndex(makeProgress('completed', 1.0));
    expect(idx).toBe(5);
  });

  it('thresholds are monotonically increasing', () => {
    for (let i = 1; i < VIDEO_GEN_STEPS.length; i++) {
      expect(VIDEO_GEN_STEPS[i].threshold).toBeGreaterThan(VIDEO_GEN_STEPS[i - 1].threshold);
    }
  });
});
