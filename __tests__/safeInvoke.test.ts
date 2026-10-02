import { ApiError, safeInvoke } from '@/lib/apiClient';

jest.mock('@/hooks/useNetworkStatus', () => ({
  isOnline: () => true,
}));

type InvokeResult<T> = { data: T | null; error: { message: string; status?: number } | null };

function makeSuccess<T>(data: T): InvokeResult<T> {
  return { data, error: null };
}

function makeError(msg: string, status?: number): InvokeResult<never> {
  return { data: null, error: { message: msg, status } };
}

describe('safeInvoke', () => {
  it('returns data on success', async () => {
    const result = await safeInvoke(() =>
      Promise.resolve(makeSuccess({ hello: 'world' })),
    );
    expect(result).toEqual({ hello: 'world' });
  });

  it('retries on 500 error then succeeds', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      if (attempts < 2) return Promise.resolve(makeError('server error', 500));
      return Promise.resolve(makeSuccess('ok'));
    };

    const result = await safeInvoke(fn, 2);
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('retries on 429 rate limit', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      if (attempts < 2) return Promise.resolve(makeError('rate limited', 429));
      return Promise.resolve(makeSuccess('ok'));
    };

    const result = await safeInvoke(fn, 2);
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does not retry on 404 client error', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      return Promise.resolve(makeError('not found', 404));
    };

    await expect(safeInvoke(fn, 2)).rejects.toThrow('not found');
    expect(attempts).toBe(1);
  });

  it('does not retry on 401 auth error', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      return Promise.resolve(makeError('unauthorized', 401));
    };

    await expect(safeInvoke(fn, 2)).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('throws ApiError on auth errors', async () => {
    const fn = (): Promise<InvokeResult<string>> =>
      Promise.resolve(makeError('forbidden', 403));

    await expect(safeInvoke(fn, 2)).rejects.toThrow('인증이 만료되었습니다');
  });

  it('retries on network error (failed to fetch)', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      if (attempts < 2) return Promise.reject(new Error('Failed to fetch'));
      return Promise.resolve(makeSuccess('recovered'));
    };

    const result = await safeInvoke(fn, 2);
    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('exhausts retries and throws on persistent 500', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      return Promise.resolve(makeError('server down', 500));
    };

    await expect(safeInvoke(fn, 1)).rejects.toThrow('server down');
    expect(attempts).toBe(2);
  });

  it('returns null when data is null and error is null', async () => {
    const fn = (): Promise<InvokeResult<string>> =>
      Promise.resolve({ data: null, error: null });

    const result = await safeInvoke(fn, 0);
    expect(result).toBeNull();
  });

  it('does not retry when retries=0', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      return Promise.resolve(makeError('error', 500));
    };

    await expect(safeInvoke(fn, 0)).rejects.toThrow('error');
    expect(attempts).toBe(1);
  });

  it('preserves error message from invoke', async () => {
    const fn = (): Promise<InvokeResult<string>> =>
      Promise.resolve(makeError('커스텀 에러 메시지', 500));

    await expect(safeInvoke(fn, 0)).rejects.toThrow('커스텀 에러 메시지');
  });
});

describe('safeInvoke - error types', () => {
  it('throws ApiError for retryable failures that exhaust', async () => {
    const fn = (): Promise<InvokeResult<string>> =>
      Promise.resolve(makeError('timeout', 408));

    try {
      await safeInvoke(fn, 0);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });

  it('throws ApiError for non-retryable 4xx that exhaust', async () => {
    const fn = (): Promise<InvokeResult<string>> =>
      Promise.resolve(makeError('bad request', 400));

    try {
      await safeInvoke(fn, 0);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });

  it('retries on timeout (408) then succeeds', async () => {
    let attempts = 0;
    const fn = (): Promise<InvokeResult<string>> => {
      attempts++;
      if (attempts < 2) return Promise.resolve(makeError('timeout', 408));
      return Promise.resolve(makeSuccess('ok'));
    };

    const result = await safeInvoke(fn, 2);
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });
});
