/*
# Restore public access to non-secret user settings columns

1. Purpose
- Fix the browser 401 error caused by the previous column-protection migration granting only UPDATE column privileges instead of separate SELECT, INSERT, and UPDATE privileges.
- Keep third-party API key columns protected from the public client roles.

2. Affected Table
- `public.user_settings`
- Restores access only to non-secret preference and profile columns already used by the app.
- Does not change rows, column definitions, or API key values.

3. Security Changes
- Grants SELECT, INSERT, and UPDATE separately for non-secret columns to `anon` and `authenticated`.
- Leaves `openai_api_key`, `pexels_api_key`, `tts_api_key`, and `runway_api_key` inaccessible to public client roles.
- Does not grant DELETE access.

4. Important Notes
- This is intentionally a single-tenant settings table used by the current app.
- The correction is idempotent and safe to re-run.
*/

GRANT SELECT (
  id,
  coupang_partners_id,
  naver_shopping_id,
  toss_share_id,
  logo_url,
  default_video_duration,
  default_tts_voice,
  tts_speed,
  tts_pitch,
  progress_style,
  auto_disclosure,
  brand_persona,
  mascot_enabled,
  mascot_style,
  capture_guide_mode,
  ui_performance,
  theme_mode,
  display_density,
  theme_preset,
  app_language,
  default_caption_tone,
  fixed_hook_phrase,
  affiliate_priority_mapping,
  auto_publish_reels,
  auto_publish_tiktok,
  auto_publish_shorts,
  auto_publish_sandbox_mode,
  clean_footage_enabled,
  updated_at
) ON TABLE public.user_settings TO anon, authenticated;

GRANT INSERT (
  id,
  coupang_partners_id,
  naver_shopping_id,
  toss_share_id,
  logo_url,
  default_video_duration,
  default_tts_voice,
  tts_speed,
  tts_pitch,
  progress_style,
  auto_disclosure,
  brand_persona,
  mascot_enabled,
  mascot_style,
  capture_guide_mode,
  ui_performance,
  theme_mode,
  display_density,
  theme_preset,
  app_language,
  default_caption_tone,
  fixed_hook_phrase,
  affiliate_priority_mapping,
  auto_publish_reels,
  auto_publish_tiktok,
  auto_publish_shorts,
  auto_publish_sandbox_mode,
  clean_footage_enabled,
  updated_at
) ON TABLE public.user_settings TO anon, authenticated;

GRANT UPDATE (
  id,
  coupang_partners_id,
  naver_shopping_id,
  toss_share_id,
  logo_url,
  default_video_duration,
  default_tts_voice,
  tts_speed,
  tts_pitch,
  progress_style,
  auto_disclosure,
  brand_persona,
  mascot_enabled,
  mascot_style,
  capture_guide_mode,
  ui_performance,
  theme_mode,
  display_density,
  theme_preset,
  app_language,
  default_caption_tone,
  fixed_hook_phrase,
  affiliate_priority_mapping,
  auto_publish_reels,
  auto_publish_tiktok,
  auto_publish_shorts,
  auto_publish_sandbox_mode,
  clean_footage_enabled,
  updated_at
) ON TABLE public.user_settings TO anon, authenticated;