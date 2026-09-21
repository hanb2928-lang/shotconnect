import { getSafeVideoConstraints, clampCaptureDimensions, CAPTURE_MAX_WIDTH, CAPTURE_MAX_HEIGHT } from '@/lib/captureConstraints';

describe('captureConstraints', () => {
  it('enforces hard max bounds on video dimensions', () => {
    const constraints = getSafeVideoConstraints('environment');
    expect(constraints.width.max).toBe(CAPTURE_MAX_WIDTH);
    expect(constraints.height.max).toBe(CAPTURE_MAX_HEIGHT);
    expect(constraints.facingMode).toBe('environment');
  });

  it('clamps oversized capture dimensions to maxDim', () => {
    const { width, height } = clampCaptureDimensions(3840, 2160, 1280);
    expect(Math.max(width, height)).toBeLessThanOrEqual(1280);
    expect(width).toBe(1280);
    expect(height).toBe(720);
  });

  it('does not upscale small dimensions', () => {
    const { width, height } = clampCaptureDimensions(640, 480, 1280);
    expect(width).toBe(640);
    expect(height).toBe(480);
  });

  it('handles portrait orientation', () => {
    const { width, height } = clampCaptureDimensions(2160, 3840, 1080);
    expect(height).toBe(1080);
    expect(width).toBe(608);
  });

  it('handles zero dimensions gracefully', () => {
    const { width, height } = clampCaptureDimensions(0, 0, 1280);
    expect(width).toBe(0);
    expect(height).toBe(0);
  });

  it('accepts optional facingMode', () => {
    const constraints = getSafeVideoConstraints();
    expect(constraints.facingMode).toBeUndefined();
    expect(constraints.width.ideal).toBe(1080);
  });
});
