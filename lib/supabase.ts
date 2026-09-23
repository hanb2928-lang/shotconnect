import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const FALLBACK_URL = 'https://asjqmhuhvmiekdnvddjv.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzanFtaHVodm1pZWtkbnZkZGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5ODI2NzEsImV4cCI6MjEwNTU1ODY3MX0.tJOzPnjVlxXAqOYbZpf-WVzN8j6NoVNspxepkLVU5Yc';

export const supabaseUrl: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_URL).trim();

export const supabaseAnonKey: string =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY).trim();

// Lazy-load AsyncStorage so module-eval never touches the native binding.
// On native, the native module may not be registered yet at boot time.
let asyncStorageModule: typeof import('@react-native-async-storage/async-storage') | null = null;
let asyncStorageLoadFailed = false;

async function getAsyncStorage() {
  if (asyncStorageLoadFailed) return null;
  if (asyncStorageModule) return asyncStorageModule;
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000),
    );
    const mod = await Promise.race([
      import('@react-native-async-storage/async-storage'),
      timeout,
    ]);
    if (!mod) {
      asyncStorageLoadFailed = true;
      return null;
    }
    asyncStorageModule = mod;
    return asyncStorageModule;
  } catch {
    asyncStorageLoadFailed = true;
    return null;
  }
}

// Build a storage adapter that lazy-loads AsyncStorage on first call.
// If AsyncStorage is unavailable, falls back to no-op (in-memory only sessions).
// On web, provide an explicit safe adapter so localStorage exceptions
// (private browsing, sandboxed iframes, restricted contexts) don't propagate.
const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      }
      const storage = await getAsyncStorage();
      if (!storage?.default) return null;
      return await storage.default.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
        return;
      }
      const storage = await getAsyncStorage();
      if (!storage?.default) return;
      await storage.default.setItem(key, value);
    } catch {
      // storage write failed — session won't persist, but app continues
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
        return;
      }
      const storage = await getAsyncStorage();
      if (!storage?.default) return;
      await storage.default.removeItem(key);
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
