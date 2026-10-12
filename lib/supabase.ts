import { createClient } from '@supabase/supabase-js';
import { getItem, setItem, removeItem } from '@/lib/storage';

const FALLBACK_URL = 'https://covcgemepkdrohktqlhc.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvdmNnZW1lcGtkcm9oa3RxbGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NjU3OTcsImV4cCI6MjEwNjM0MTc5N30.hCme7ue6PcPauYGB1vS8bpVdsx2VRA6pyqUvstixHNU';

export const supabaseUrl: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_URL).trim();

export const supabaseAnonKey: string =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY).trim();

// Delegate to storage.ts which has a unified init sequence with timeout
// and fallback. This avoids a second independent AsyncStorage load that
// could race the native bridge and throw TypeError when methods are undefined.
const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const val = await getItem(key);
      if (val === null || val === undefined) return null;
      const trimmed = val.trim();
      if (trimmed === '') return null;
      return val;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof value !== 'string' || value.trim() === '') return;
    try {
      await setItem(key, value);
    } catch {
      // session won't persist, but app continues
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await removeItem(key);
    } catch {
      // best-effort
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: authStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Ensure the auth session is fresh before a resume fetch. On background→
 * foreground transition the token may have expired; autoRefreshToken fires
 * asynchronously but may not complete before our resume burst polls run.
 * Calling getSession() forces the client to resolve the current session
 * (refreshing if needed) so subsequent DB queries use a valid token.
 *
 * The result is cached for SESSION_CACHE_TTL_MS so that multiple hooks
 * firing on the same foreground transition (useAppLifecycleSync,
 * useVideoJobRecovery, useOrphanJobRecovery, useVideoGen, useResultPolling)
 * all share a single getSession() call instead of each triggering their own
 * — a major source of the foreground thundering-herd bridge flood.
 */
let sessionPromise: Promise<void> | null = null;
let sessionAbort: AbortController | null = null;
let sessionCachedAt = 0;
const SESSION_CACHE_TTL_MS = 5000;
const SESSION_FETCH_TIMEOUT_MS = 3_000;

/**
 * Force-abort any pending session Promise and clear the cache. Called on
 * foreground return (immediate phase) to ensure that a getSession() call
 * that was started before the app backgrounded — and whose underlying
 * AsyncStorage read may be stuck on a locked native bridge — is rejected
 * immediately rather than lingering as a dead Promise that blocks the
 * resume burst. A fresh ensureFreshSession() call will then start a new
 * getSession() with a new AbortController.
 */
export function resetSessionCache(): void {
  if (sessionAbort) {
    try { sessionAbort.abort(); } catch { /* ignore */ }
    sessionAbort = null;
  }
  sessionPromise = null;
  sessionCachedAt = 0;
}

export async function ensureFreshSession(): Promise<void> {
  const now = Date.now();
  if (sessionPromise) return sessionPromise;
  if (now - sessionCachedAt < SESSION_CACHE_TTL_MS) return;
  sessionCachedAt = now;
  sessionAbort = new AbortController();
  const abortSignal = sessionAbort.signal;
  sessionPromise = (async () => {
    try {
      await Promise.race([
        (async () => {
          const { data } = await supabase.auth.getSession();
          if (abortSignal.aborted) return;
          const session = data.session;
          if (session?.expires_at) {
            const nowSec = Math.floor(Date.now() / 1000);
            if (session.expires_at - nowSec <= 120) {
              await supabase.auth.refreshSession().catch(() => {});
            }
          }
        })(),
        new Promise<void>((resolve) =>
          setTimeout(resolve, SESSION_FETCH_TIMEOUT_MS),
        ),
        // Abort guard: if resetSessionCache() fires (foreground return),
        // this rejects immediately so the caller doesn't wait for a dead
        // AsyncStorage Promise that will never resolve on a locked bridge.
        new Promise<void>((_, reject) => {
          if (abortSignal.aborted) { reject(new Error('aborted')); return; }
          abortSignal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          }, { once: true });
        }),
      ]);
    } catch {
      // Token refresh failure is non-fatal — the resume fetch will simply
      // use whatever token is available and retry via the normal poll loop.
    } finally {
      sessionPromise = null;
      sessionAbort = null;
    }
  })();
  return sessionPromise;
}

export const ANALYSIS_FUNCTION_URL = `${supabaseUrl}/functions/v1/analyze-photo`;
export const REVIEW_FUNCTION_URL = `${supabaseUrl}/functions/v1/generate-review`;
export const COPY_FUNCTION_URL = `${supabaseUrl}/functions/v1/generate-copy`;
export const KEYWORD_TRENDS_URL = `${supabaseUrl}/functions/v1/keyword-trends`;
export const TREND_COPY_FUNCTION_URL = `${supabaseUrl}/functions/v1/trend-copy`;
export const TTS_FUNCTION_URL = `${supabaseUrl}/functions/v1/generate-tts`;
export const BATCH_TTS_FUNCTION_URL = `${supabaseUrl}/functions/v1/generate-batch-tts`;
export const VARIANT_FUNCTION_URL = `${supabaseUrl}/functions/v1/generate-variants`;
export const OCR_TEXT_FUNCTION_URL = `${supabaseUrl}/functions/v1/extract-ocr-text`;
export const VIRAL_PREDICT_FUNCTION_URL = `${supabaseUrl}/functions/v1/viral-predict`;
export const LOCALIZE_FUNCTION_URL = `${supabaseUrl}/functions/v1/translate-localize`;
export const SHORTFORM_GUIDE_URL = `${supabaseUrl}/functions/v1/generate-shortform-guide`;
export const PERSONA_SIMULATOR_URL = `${supabaseUrl}/functions/v1/persona-simulator`;
export const TREND_MATCH_URL = `${supabaseUrl}/functions/v1/trend-match`;
export const PEXELS_VIDEO_SEARCH_URL = `${supabaseUrl}/functions/v1/search-pexels-videos`;
export const VIDEO_EDIT_PLAN_URL = `${supabaseUrl}/functions/v1/generate-video-edit-plan`;
export const GENERATE_IMAGE_URL = `${supabaseUrl}/functions/v1/generate-image`;
export const EXTRACT_VIDEO_FRAME_URL = `${supabaseUrl}/functions/v1/extract-video-frame`;

/**
 * Wrap a Supabase query promise with a hard timeout. If the query doesn't
 * resolve within `timeoutMs`, the promise rejects with a timeout error,
 * releasing any row-level locks the transaction holds on the server side.
 *
 * This prevents the "underground deadlock" where a flaky network causes a
 * DB query to hang indefinitely, holding row locks that block all
 * subsequent reads/writes and freezing the entire app.
 */
export function withQueryTimeout<T>(
  queryPromise: PromiseLike<T>,
  timeoutMs = 5000,
  label = 'query',
): Promise<T> {
  const promise = Promise.resolve(queryPromise);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    new Promise<T>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error(`DB query timeout (${label}) after ${timeoutMs}ms`));
      }, { once: true });
    }),
  ]);
}
