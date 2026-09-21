import { supabase } from '@/lib/supabase';
import { getItem, setItem } from '@/lib/storage';
import type { UserSettings } from '@/types/database';

const SINGLETON_ID = 1;

const API_KEY_FIELDS: (keyof UserSettings)[] = [
  'openai_api_key',
  'pexels_api_key',
  'tts_api_key',
  'runway_api_key',
];

const LOCAL_API_KEY_PREFIX = 'apikey:';

let cachedSettings: UserSettings | null | undefined;

export async function getUserSettings(): Promise<UserSettings | null> {
  if (cachedSettings !== undefined) return cachedSettings;

  const { data, error } = await supabase
    .from('user_settings')
    .select('id, coupang_partners_id, naver_shopping_id, toss_share_id, openai_api_key, pexels_api_key, tts_api_key, logo_url, default_video_duration, default_tts_voice, tts_speed, tts_pitch, progress_style, auto_disclosure, brand_persona, mascot_enabled, mascot_style, capture_guide_mode, ui_performance, theme_mode, display_density, theme_preset, app_language, default_caption_tone, fixed_hook_phrase, affiliate_priority_mapping, auto_publish_reels, auto_publish_tiktok, auto_publish_shorts, auto_publish_sandbox_mode, clean_footage_enabled, runway_api_key, updated_at')
    .eq('id', SINGLETON_ID)
    .maybeSingle();

  if (error || !data) {
    const fallback = await loadApiKeysFromLocal();
    if (fallback) {
      cachedSettings = fallback as UserSettings;
      return cachedSettings;
    }
    return null;
  }

  cachedSettings = data as UserSettings;

  for (const field of API_KEY_FIELDS) {
    const localVal = await getItem(LOCAL_API_KEY_PREFIX + field);
    if (!cachedSettings[field] && localVal) {
      (cachedSettings as unknown as Record<string, unknown>)[field] = localVal;
    } else if (cachedSettings[field]) {
      await setItem(LOCAL_API_KEY_PREFIX + field, cachedSettings[field] as string);
    }
  }

  return cachedSettings;
}

async function loadApiKeysFromLocal(): Promise<Partial<UserSettings> | null> {
  const result: Partial<UserSettings> = {};
  let hasAny = false;
  for (const field of API_KEY_FIELDS) {
    const val = await getItem(LOCAL_API_KEY_PREFIX + field);
    if (val) {
      (result as Record<string, unknown>)[field] = val;
      hasAny = true;
    }
  }
  return hasAny ? result : null;
}

export function invalidateSettingsCache(): void {
  cachedSettings = undefined;
}

export async function updateUserSettings(
  settings: Partial<UserSettings>,
): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      id: SINGLETON_ID,
      ...settings,
      updated_at: new Date().toISOString(),
    });

  if (error) throw new Error(`Failed to save settings: ${error.message}`);

  for (const field of API_KEY_FIELDS) {
    if (field in settings) {
      const val = settings[field];
      await setItem(LOCAL_API_KEY_PREFIX + field, typeof val === 'string' ? val : '');
    }
  }

  invalidateSettingsCache();
}
