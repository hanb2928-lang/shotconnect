import { useState, useCallback, useRef, useEffect } from 'react';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

export interface RunwayCreditsState {
  credits: number | null;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const LOW_CREDIT_THRESHOLD = 5;

export function useRunwayCredits() {
  const [state, setState] = useState<RunwayCreditsState>({
    credits: null,
    loading: false,
    error: null,
    lastFetchedAt: null,
  });
  const cacheRef = useRef<{ credits: number; ts: number } | null>(null);
  const inFlightRef = useRef(false);

  const fetchCredits = useCallback(async (force = false): Promise<number | null> => {
    if (!force && cacheRef.current) {
      const age = Date.now() - cacheRef.current.ts;
      if (age < CACHE_TTL_MS) {
        setState((prev) => ({
          ...prev,
          credits: cacheRef.current!.credits,
          loading: false,
          error: null,
          lastFetchedAt: cacheRef.current!.ts,
        }));
        return cacheRef.current.credits;
      }
    }
    if (inFlightRef.current) return state.credits;
    inFlightRef.current = true;
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${supabaseUrl}/functions/v1/check-runway-credits`, {
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        setState((prev) => ({ ...prev, loading: false, error: '크레딧 조회 실패' }));
        return null;
      }

      const data = await resp.json();
      if (typeof data.credits === 'number') {
        cacheRef.current = { credits: data.credits, ts: Date.now() };
        setState({
          credits: data.credits,
          loading: false,
          error: null,
          lastFetchedAt: Date.now(),
        });
        return data.credits;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: data.error ?? '크레딧 정보를 가져올 수 없습니다.',
      }));
      return null;
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      setState((prev) => ({
        ...prev,
        loading: false,
        error: isAbort ? '크레딧 조회 시간 초과' : '네트워크 오류',
      }));
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [state.credits]);

  useEffect(() => {
    fetchCredits(false);
  }, [fetchCredits]);

  const isLow = state.credits !== null && state.credits <= LOW_CREDIT_THRESHOLD;
  const isCritical = state.credits !== null && state.credits <= 1;

  return {
    ...state,
    isLow,
    isCritical,
    threshold: LOW_CREDIT_THRESHOLD,
    refresh: () => fetchCredits(true),
  };
}
