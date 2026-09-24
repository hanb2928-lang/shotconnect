import { createClient } from '@supabase/supabase-js';
import { getItem, setItem, removeItem } from '@/lib/storage';

const FALLBACK_URL = 'https://asjqmhuhvmiekdnvddjv.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzanFtaHVodm1pZWtkbnZkZGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5ODI2NzEsImV4cCI6MjEwNTU1ODY3MX0.tJOzPnjVlxXAqOYbZpf-WVzN8j6NoVNspxepkLVU5Yc';

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
