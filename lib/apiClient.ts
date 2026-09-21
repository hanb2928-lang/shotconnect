import { supabaseAnonKey } from '@/lib/supabase';
import { getCached, setCached, getStaleCached } from '@/lib/offlineCache';
import { isOnline } from '@/hooks/useNetworkStatus';

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
      return inflightGets.get(key)!;
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
    const cached = await getCached<Response>(cacheKey);
    if (cached) return cached;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

      if (response.status === 401 || response.status === 403) {
        throw new ApiError('인증이 만료되었습니다. 앱을 새로고침하고 다시 시도해주세요.', response.status);
      }

      if (response.status === 429) {
        if (attempt < retries) {
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

      if (cacheKey && err instanceof Error && /failed to fetch|network|abort/i.test(err.message)) {
        const stale = await getStaleCached<Response>(cacheKey);
        if (stale) return stale;
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

export async function safeSupabaseCall<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
  retries = 1,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await operation();
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
        err.message.includes('abort')
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
