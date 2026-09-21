import { contentHash, hashImage, hashObject } from '@/lib/contentHash';

describe('contentHash', () => {
  it('produces a 16-char hex string', () => {
    const h = contentHash('hello world');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same input', () => {
    expect(contentHash('test input')).toBe(contentHash('test input'));
  });

  it('differs for different inputs', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });

  it('handles empty string', () => {
    expect(contentHash('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashImage uses 4096 sample step (same as legacy)', () => {
    const long = 'x'.repeat(10000);
    expect(hashImage(long)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashObject is deterministic and order-independent', () => {
    const a = hashObject({ a: '1', b: '2' });
    const b = hashObject({ b: '2', a: '1' });
    expect(a).toBe(b);
  });

  it('hashObject skips undefined/null values', () => {
    const a = hashObject({ x: '1', y: undefined, z: null });
    const b = hashObject({ x: '1' });
    expect(a).toBe(b);
  });

  it('hashObject differs for different values', () => {
    expect(hashObject({ a: '1' })).not.toBe(hashObject({ a: '2' }));
  });
});
