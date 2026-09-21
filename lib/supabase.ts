import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// These values are inlined by Metro at bundle time from the .env file.
// The fallbacks ensure the app always has a valid URL even if the build
// environment didn't have the .env file present (e.g. a misconfigured CI run).
const FALLBACK_URL = 'https://asjqmhuhvmiekdnvddjv.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzanFtaHVodm1pZWtkbnZkZGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5ODI2NzEsImV4cCI6MjEwNTU1ODY3MX0.tJOzPnjVlxXAqOYbZpf-WVzN8j6NoVNspxepkLVU5Yc';

// Metro inlines EXPO_PUBLIC_ vars as string literals — no runtime lookup needed.
// We still guard with || to handle the case where the var was undefined at bundle time.
export const supabaseUrl: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_URL).trim();

export const supabaseAnonKey: string =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY).trim();

// On native (Android/iOS), use AsyncStorage so auth sessions survive app restarts.
// On web, use the default localStorage-backed storage.
const authStorage =
  Platform.OS !== 'web'
    ? {
        getItem: (key: string) => AsyncStorage.getItem(key),
        setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
        removeItem: (key: string) => AsyncStorage.removeItem(key),
      }
    : undefined;

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
