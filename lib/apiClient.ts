import { supabaseAnonKey } from '@/lib/supabase';
import { getCached, setCached, getStaleCached } from '@/lib/offlineCache';
import { isOnline } from '@/hooks/useNetworkStatus';
import { addBreadcrumb } from '@/lib/errorLogger';

interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  cacheKey?: string;
  cacheTtlMs?: number;
}

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 800;
const OFFLINE_WAIT_MAX_MS = 8000;

function waitForOnline(): Promise<boolean> {
  if (isOnline()) return Promise.resolve(true);
  // Fail fast if definitively offline — don't block the user for 30 seconds
  return new Promise((resolve) => {
    const timer = setTimeout(() => { clearInterval(poll); resolve(false); }, OFFLINE_WAIT_MAX_MS);
    const poll = setInterval(() => {
      if (isOnline()) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve(true);
      }
    }, 500);
  });
}

const inflightGets = new Map<string, Promise<Response>>();

function isCacheableGet(options: SafeFetchOptions): boolean {
  const method = (options.method || 'GET').toUpperCase();
  return method === 'GET' && !options.body;
}

function responseFromCachedData(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('abort');
  }
  return false;
}

function backoffDelay(attempt: number): number {
  return BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 60000, retries = MAX_RETRIES, cacheKey, cacheTtlMs, ...fetchOptions } = options;

  if (isCacheableGet(options)) {
    const key = cacheKey || url;
    if (inflightGets.has(key)) {
      return inflightGets.get(key)!.then((response) => response.clone());
    }
    const promise = doFetch(url, { timeoutMs, retries, ...fetchOptions }, cacheKey, cacheTtlMs)
      .finally(() => inflightGets.delete(key));
    inflightGets.set(key, promise);
    return promise;
  }

  return doFetch(url, { timeoutMs, retries, ...fetchOptions }, cacheKey, cacheTtlMs);
}

async function doFetch(
  url: string,
  options: SafeFetchOptions,
  cacheKey?: string,
  cacheTtlMs?: number,
): Promise<Response> {
  const { timeoutMs = 60000, retries = MAX_RETRIES, ...fetchOptions } = options;

  if (cacheKey) {
    const cached = await getCached<unknown>(cacheKey);
    if (cached !== null) return responseFromCachedData(cached);
  }

  let lastError: unknown = null;

  const callerSignal = fetchOptions.signal;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Link caller's abort signal to the per-attempt controller so that
    // external cancellation (user navigation) aborts in-flight requests,
    // not just the timeout.
    const callerAbortListener = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener('abort', callerAbortListener, { once: true });
      }
    }

    try {
      const headers = {
        ...fetchOptions.headers,
        apikey: supabaseAnonKey,
      };

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', callerAbortListener);

      if (response.status === 401 || response.status === 403) {
        throw new ApiError('인증이 만료되었습니다. 앱을 새로고침하고 다시 시도해주세요.', response.status);
      }

      if (response.status === 429) {
        if (attempt < retries) {
          addBreadcrumb('api', `Rate limited (429), retrying attempt ${attempt + 1}`, 'warning', { url });
          lastError = new ApiError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', response.status);
          await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
          continue;
        }
        throw new ApiError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', response.status);
      }

      if (response.status >= 500) {
        let serverMsg = '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
        try {
          const errData = await response.json();
          if (errData?.error) serverMsg = errData.error;
        } catch {
          // body isn't JSON; keep default message
        }
        if (attempt < retries) {
          addBreadcrumb('api', `Server error (${response.status}), retrying attempt ${attempt + 1}`, 'warning', { url });
          lastError = new ApiError(serverMsg, response.status);
          await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
          continue;
        }
        throw new ApiError(serverMsg, response.status);
      }

      if (cacheKey && response.ok) {
        const cloned = response.clone();
        cloned.json().then((data) => setCached(cacheKey, data)).catch(() => {});
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', callerAbortListener);

      if (cacheKey && err instanceof Error && /failed to fetch|network|abort/i.test(err.message)) {
        const stale = await getStaleCached<unknown>(cacheKey);
        if (stale !== null) return responseFromCachedData(stale);
      }

      if (err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))) {
        lastError = new ApiError('요청 시간이 초과되었습니다. 네트워크 환경을 확인 후 다시 시도해주세요.', 408);
      } else if (err instanceof ApiError) {
        lastError = err;
      } else {
        lastError = err;
      }

      if (attempt < retries && isRetryableError(lastError)) {
        if (!isOnline()) {
          const recovered = await waitForOnline();
          if (!recovered) {
            throw new ApiError('네트워크 연결이 끊겨 재시도할 수 없습니다. 인터넷 연결을 확인해주세요.', 0);
          }
        }
        await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('요청에 실패했습니다.');
}

const SUPABASE_OP_TIMEOUT_MS = 15000;

export async function safeSupabaseCall<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
  retries = 1,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        timeoutId = setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), SUPABASE_OP_TIMEOUT_MS);
      });
      let result: { data: T | null; error: { message: string } | null };
      try {
        result = await Promise.race([operation(), timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      if (result.error) {
        const msg = result.error?.message ?? String(result.error);
        if (msg.includes('JWT') || msg.includes('token') || msg.includes('auth')) {
          throw new ApiError('인증 세션이 만료되었습니다. 앱을 새로고침해주세요.', 401);
        }
        throw new Error(msg);
      }
      if (result.data == null) {
        throw new Error('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
      return result.data as T;
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError) throw err;

      const isNetwork = err instanceof Error && (
        err.message.includes('Failed to fetch') ||
        err.message.includes('network') ||
        err.message.includes('abort') ||
        err.message.includes('timeout')
      );

      if (isNetwork && attempt < retries) {
        if (!isOnline()) {
          const recovered = await waitForOnline();
          if (!recovered) {
            throw new ApiError('네트워크 연결이 끊겨 재시도할 수 없습니다. 인터넷 연결을 확인해주세요.', 0);
          }
        }
        await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      if (isNetwork) {
        throw new ApiError('네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.', 0);
      }
      throw err;
    }
  }

  throw lastError || new Error('작업에 실패했습니다.');
}

export function friendlyApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

// --- safeInvoke: retry wrapper for supabase.functions.invoke ---

const INVOKE_DEFAULT_RETRIES = 2;

interface InvokeResult<T> {
  data: T | null;
  error: { message: string; status?: number } | null;
}

function isInvokeRetryableError(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const status = error.status;
  if (status !== undefined) {
    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }
  const msg = (error.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('abort');
}

/**
 * Wraps supabase.functions.invoke with exponential backoff retry.
 * Retries on network errors, timeouts, 429 (rate limit), and 5xx server errors.
 * Does NOT retry on 4xx client errors (except 408/429) since those are permanent.
 */
export async function safeInvoke<T>(
  invokeFn: () => Promise<InvokeResult<T>>,
  retries: number = INVOKE_DEFAULT_RETRIES,
): Promise<T> {
  let lastError: { message: string; status?: number } | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await invokeFn();

      if (result.error) {
        const msg = result.error.message || '알 수 없는 오류가 발생했습니다.';
        const errObj = { message: msg, status: result.error.status };

        if (attempt < retries && isInvokeRetryableError(errObj)) {
          addBreadcrumb('invoke', `Retryable error, retrying attempt ${attempt + 1}`, 'warning', { message: msg, status: result.error.status });
          lastError = errObj;
          if (!isOnline()) {
            const recovered = await waitForOnline();
            if (!recovered) {
              throw new ApiError('네트워크 연결이 끊겨 재시도할 수 없습니다. 인터넷 연결을 확인해주세요.', 0);
            }
          }
          await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
          continue;
        }

        if (result.error.status === 401 || result.error.status === 403) {
          throw new ApiError('인증이 만료되었습니다. 앱을 새로고침하고 다시 시도해주세요.', result.error.status);
        }
        throw new ApiError(msg, result.error.status ?? 0);
      }

      return result.data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;

      const msg = err instanceof Error ? err.message : String(err);
      const errObj = { message: msg };

      if (attempt < retries && isInvokeRetryableError(errObj)) {
        lastError = errObj;
        if (!isOnline()) {
          const recovered = await waitForOnline();
          if (!recovered) {
            throw new ApiError('네트워크 연결이 끊겨 재시도할 수 없습니다. 인터넷 연결을 확인해주세요.', 0);
          }
        }
        await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
        continue;
      }

      if (isInvokeRetryableError(errObj)) {
        throw new ApiError('네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.', 0);
      }
      throw err;
    }
  }

  throw new ApiError(lastError?.message || '요청에 실패했습니다.', lastError?.status ?? 0);
}

// --- safeFetchJson: fetch + JSON parse with retry + typed result ---

export async function safeFetchJson<T>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<T> {
  const response = await safeFetch(url, options);
  if (!response.ok) {
    let msg = `서버 오류 (${response.status})`;
    try {
      const errData = await response.json();
      if (errData?.error) msg = errData.error;
    } catch {}
    throw new ApiError(msg, response.status);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError('서버 응답을 파싱하지 못했습니다.', response.status);
  }
}
