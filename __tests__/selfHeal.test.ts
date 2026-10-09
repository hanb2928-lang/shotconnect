import { classifyFailure, getRetryStrategy } from '@/lib/selfHeal';

describe('classifyFailure', () => {
  it('detects payload too large (413)', () => {
    expect(classifyFailure(new Error('413 Payload Too Large'))).toBe('payload_too_large');
    expect(classifyFailure(new Error('entity too large'))).toBe('payload_too_large');
  });

  it('detects memory pressure', () => {
    expect(classifyFailure(new Error('out of memory'))).toBe('memory_pressure');
    expect(classifyFailure(new Error('OOM killer sigkill'))).toBe('memory_pressure');
    expect(classifyFailure(new Error('native heap overflow'))).toBe('memory_pressure');
  });

  it('detects network timeout', () => {
    expect(classifyFailure(new Error('Request timeout'))).toBe('network_timeout');
    expect(classifyFailure(new Error('시간 초과'))).toBe('network_timeout');
  });

  it('detects network instability', () => {
    expect(classifyFailure(new Error('failed to fetch'))).toBe('network_unstable');
    expect(classifyFailure(new Error('network error'))).toBe('network_unstable');
  });

  it('detects rate limiting (429)', () => {
    expect(classifyFailure(new Error('429 rate limit exceeded'))).toBe('rate_limited');
    expect(classifyFailure(new Error('quota exceeded'))).toBe('rate_limited');
  });

  it('detects server errors (5xx)', () => {
    expect(classifyFailure(new Error('502 Bad Gateway'))).toBe('server_error');
    expect(classifyFailure(new Error('503 Service Unavailable'))).toBe('server_error');
  });

  it('detects auth errors', () => {
    expect(classifyFailure(new Error('401 unauthorized'))).toBe('auth_error');
    expect(classifyFailure(new Error('Invalid api key'))).toBe('auth_error');
  });

  it('returns unknown for unclassifiable errors', () => {
    expect(classifyFailure(new Error('something weird'))).toBe('unknown');
    expect(classifyFailure(null)).toBe('unknown');
    expect(classifyFailure(undefined)).toBe('unknown');
  });
});

describe('getRetryStrategy', () => {
  it('retries payload_too_large with progressive quality reduction', () => {
    const s0 = getRetryStrategy('payload_too_large', 0);
    expect(s0.shouldRetry).toBe(true);
    expect(s0.reduceQualityBy).toBe(0);
    expect(s0.triggerMemoryGuard).toBe(true);

    const s1 = getRetryStrategy('payload_too_large', 1);
    expect(s1.shouldRetry).toBe(true);
    expect(s1.reduceQualityBy).toBe(0.15);
    expect(s1.reduceMaxDimensionBy).toBe(200);

    const s3 = getRetryStrategy('payload_too_large', 3);
    expect(s3.shouldRetry).toBe(false);
  });

  it('retries memory_pressure with longer delays', () => {
    const s0 = getRetryStrategy('memory_pressure', 0);
    expect(s0.shouldRetry).toBe(true);
    expect(s0.delayMs).toBe(1500);
    expect(s0.triggerMemoryGuard).toBe(true);

    const s2 = getRetryStrategy('memory_pressure', 2);
    expect(s2.shouldRetry).toBe(false);
  });

  it('retries network_timeout with backoff', () => {
    const s0 = getRetryStrategy('network_timeout', 0);
    expect(s0.shouldRetry).toBe(true);
    expect(s0.delayMs).toBe(2000);

    const s1 = getRetryStrategy('network_timeout', 1);
    expect(s1.shouldRetry).toBe(true);
    expect(s1.delayMs).toBe(4000);
  });

  it('does not retry auth errors', () => {
    const s = getRetryStrategy('auth_error', 0);
    expect(s.shouldRetry).toBe(false);
  });

  it('does not retry unknown errors', () => {
    const s = getRetryStrategy('unknown', 0);
    expect(s.shouldRetry).toBe(false);
  });

  it('rate-limits to a single retry with long delay', () => {
    const s0 = getRetryStrategy('rate_limited', 0);
    expect(s0.shouldRetry).toBe(true);
    expect(s0.delayMs).toBe(5000);

    const s1 = getRetryStrategy('rate_limited', 1);
    expect(s1.shouldRetry).toBe(false);
  });
});
