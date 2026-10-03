import { ApiError, friendlyApiError, safeFetch, safeInvoke } from '@/lib/apiClient';

jest.mock('@/lib/supabase', () => ({
  supabaseAnonKey: 'test-anon-key',
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  isOnline: () => true,
}));

jest.mock('@/lib/offlineCache', () => ({
  getCached: jest.fn().mockResolvedValue(null),
  setCached: jest.fn().mockResolvedValue(undefined),
  getStaleCached: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/errorLogger', () => ({
  addBreadcrumb: jest.fn(),
  logWarning: jest.fn(),
}));

jest.useFakeTimers();

const mockResponse = (status: number, body: unknown = {}): Response => {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone: () => mockResponse(status, body),
  } as Response;
};

describe('ApiError', () => {
  it('메시지와 상태 코드를 저장한다', () => {
    const err = new ApiError('테스트 에러', 500);
    expect(err.message).toBe('테스트 에러');
    expect(err.status).toBe(500);
    expect(err.name).toBe('ApiError');
  });

  it('Error를 상속한다', () => {
    const err = new ApiError('테스트', 404);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('friendlyApiError', () => {
  it('ApiError는 메시지를 그대로 반환한다', () => {
    const err = new ApiError('커스텀 메시지', 400);
    expect(friendlyApiError(err, '기본')).toBe('커스텀 메시지');
  });

  it('일반 Error는 메시지를 반환한다', () => {
    expect(friendlyApiError(new Error('일반 에러'), '기본')).toBe('일반 에러');
  });

  it('문자열은 기본값을 반환한다 (Error가 아니므로)', () => {
    expect(friendlyApiError('문자열 에러', '기본')).toBe('기본');
  });

  it('알 수 없는 타입은 기본값을 반환한다', () => {
    expect(friendlyApiError(42, '기본값')).toBe('기본값');
    expect(friendlyApiError(null, '기본값')).toBe('기본값');
  });
});

describe('safeFetch retry behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('5xx 에러 시 지수 백오프로 재시도한다', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(500, { error: 'server error' }))
      .mockResolvedValueOnce(mockResponse(500, { error: 'server error' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const fetchPromise = safeFetch('https://test.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ test: true }),
      timeoutMs: 5000,
    });

    // Allow backoff timers to fire
    await jest.advanceTimersByTimeAsync(10000);

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('429 rate limit 시 재시도한다', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const fetchPromise = safeFetch('https://test.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ test: true }),
      timeoutMs: 5000,
    });

    await jest.advanceTimersByTimeAsync(5000);
    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('4xx 클라이언트 에러는 재시도하지 않고 응답을 반환한다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(400, { error: 'bad request' }));

    const response = await safeFetch('https://test.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ test: true }),
      timeoutMs: 5000,
    });

    expect(response.status).toBe(400);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류 시 재시도한다', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const fetchPromise = safeFetch('https://test.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ test: true }),
      timeoutMs: 5000,
    });

    await jest.advanceTimersByTimeAsync(5000);
    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('최대 재시도 횟수 초과 시 에러를 throw한다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(500, { error: 'persistent server error' }));

    const fetchPromise = safeFetch('https://test.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ test: true }),
      timeoutMs: 5000,
      retries: 1,
    });

    // Catch immediately to prevent unhandled rejection
    fetchPromise.catch(() => {});

    await jest.advanceTimersByTimeAsync(30000);
    await expect(fetchPromise).rejects.toThrow('persistent server error');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('safeInvoke retry behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('5xx 에러 시 재시도한다', async () => {
    const invokeFn = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'server error', status: 500 } })
      .mockResolvedValueOnce({ data: { result: 'ok' }, error: null });

    const invokePromise = safeInvoke(invokeFn, 1);

    await jest.advanceTimersByTimeAsync(5000);
    const result = await invokePromise;
    expect(result).toEqual({ result: 'ok' });
    expect(invokeFn).toHaveBeenCalledTimes(2);
  });

  it('4xx 클라이언트 에러는 재시도하지 않는다', async () => {
    const invokeFn = jest.fn()
      .mockResolvedValue({ data: null, error: { message: 'bad request', status: 400 } });

    await expect(safeInvoke(invokeFn, 2)).rejects.toThrow();
    expect(invokeFn).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류 시 재시도한다', async () => {
    const invokeFn = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { result: 'ok' }, error: null });

    const invokePromise = safeInvoke(invokeFn, 1);

    await jest.advanceTimersByTimeAsync(5000);
    const result = await invokePromise;
    expect(result).toEqual({ result: 'ok' });
    expect(invokeFn).toHaveBeenCalledTimes(2);
  });
});
