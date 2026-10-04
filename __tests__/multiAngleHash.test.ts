/**
 * Multi-angle image hash + contentTone cache key tests
 *
 * Verifies that:
 * 1. Same images + same tone → same hash (deterministic)
 * 2. Different images → different hash
 * 3. Same images + different tone → different hash
 * 4. Image order doesn't affect the hash
 * 5. Empty additional images falls back to single-image hash
 */

import { hashImage, hashMultiAngle, contentHash, hashMotionTemplate } from '@/lib/contentHash';

describe('hashMultiAngle', () => {
  const img1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
  const img2 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQBBBQABAAD';
  const img3 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQCCCQABAAD';

  it('produces the same hash for the same images + tone', () => {
    const h1 = hashMultiAngle([img1, img2], 'studio');
    const h2 = hashMultiAngle([img1, img2], 'studio');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different images', () => {
    const h1 = hashMultiAngle([img1, img2], 'studio');
    const h2 = hashMultiAngle([img1, img3], 'studio');
    expect(h1).not.toBe(h2);
  });

  it('produces different hashes for same images + different tone', () => {
    const h1 = hashMultiAngle([img1, img2], 'studio');
    const h2 = hashMultiAngle([img1, img2], 'raw');
    expect(h1).not.toBe(h2);
  });

  it('produces different hashes for same images + no tone vs a tone', () => {
    const h1 = hashMultiAngle([img1, img2]);
    const h2 = hashMultiAngle([img1, img2], 'studio');
    expect(h1).not.toBe(h2);
  });

  it('is order-independent — shuffled images produce the same hash', () => {
    const h1 = hashMultiAngle([img1, img2, img3], 'studio');
    const h2 = hashMultiAngle([img3, img1, img2], 'studio');
    const h3 = hashMultiAngle([img2, img3, img1], 'studio');
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('handles a single image', () => {
    const h1 = hashMultiAngle([img1], 'studio');
    const h2 = hashMultiAngle([img1], 'studio');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it('handles empty array', () => {
    const h = hashMultiAngle([], 'studio');
    expect(h).toHaveLength(16);
    expect(typeof h).toBe('string');
  });

  it('different number of images produces different hashes', () => {
    const h1 = hashMultiAngle([img1, img2], 'studio');
    const h2 = hashMultiAngle([img1, img2, img3], 'studio');
    expect(h1).not.toBe(h2);
  });
});

describe('hashImage — single image backward compatibility', () => {
  it('produces a 16-char hex string', () => {
    const h = hashImage('data:image/jpeg;base64,abc123');
    expect(h).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(h)).toBe(true);
  });

  it('is deterministic', () => {
    const h1 = hashImage('data:image/jpeg;base64,abc123');
    const h2 = hashImage('data:image/jpeg;base64,abc123');
    expect(h1).toBe(h2);
  });

  it('different inputs produce different hashes', () => {
    const h1 = hashImage('data:image/jpeg;base64,abc123');
    const h2 = hashImage('data:image/jpeg;base64,xyz789');
    expect(h1).not.toBe(h2);
  });
});

describe('contentHash — base function', () => {
  it('is deterministic for the same input', () => {
    const h1 = contentHash('hello world');
    const h2 = contentHash('hello world');
    expect(h1).toBe(h2);
  });

  it('differs for different inputs', () => {
    const h1 = contentHash('hello');
    const h2 = contentHash('world');
    expect(h1).not.toBe(h2);
  });
});

describe('hashMotionTemplate — video generation params', () => {
  it('is deterministic for the same params', () => {
    const h1 = hashMotionTemplate({ stylePreset: 'cinematic', durationSec: 15, aspectRatio: '9:16' });
    const h2 = hashMotionTemplate({ stylePreset: 'cinematic', durationSec: 15, aspectRatio: '9:16' });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different style presets', () => {
    const h1 = hashMotionTemplate({ stylePreset: 'cinematic', durationSec: 15 });
    const h2 = hashMotionTemplate({ stylePreset: 'realistic', durationSec: 15 });
    expect(h1).not.toBe(h2);
  });

  it('produces different hashes for different durations', () => {
    const h1 = hashMotionTemplate({ stylePreset: 'cinematic', durationSec: 15 });
    const h2 = hashMotionTemplate({ stylePreset: 'cinematic', durationSec: 30 });
    expect(h1).not.toBe(h2);
  });

  it('produces different hashes for different aspect ratios', () => {
    const h1 = hashMotionTemplate({ aspectRatio: '9:16' });
    const h2 = hashMotionTemplate({ aspectRatio: '16:9' });
    expect(h1).not.toBe(h2);
  });

  it('ignores undefined and false boolean params', () => {
    const h1 = hashMotionTemplate({ stylePreset: 'cinematic', enableOrbit360: false, orbitSpeed: undefined });
    const h2 = hashMotionTemplate({ stylePreset: 'cinematic' });
    expect(h1).toBe(h2);
  });

  it('includes true boolean params', () => {
    const h1 = hashMotionTemplate({ stylePreset: 'cinematic', enableOrbit360: true });
    const h2 = hashMotionTemplate({ stylePreset: 'cinematic', enableOrbit360: false });
    expect(h1).not.toBe(h2);
  });

  it('produces consistent hash for empty params', () => {
    const h1 = hashMotionTemplate({});
    const h2 = hashMotionTemplate({});
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });
});
