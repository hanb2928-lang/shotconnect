/*
# Complete protection for API key columns in user_settings

1. Purpose
- Make the API key protection effective by removing table-wide privileges that would otherwise imply access to every column.

2. Affected Table
- `public.user_settings`
- Protected columns remain `openai_api_key`, `pexels_api_key`, `tts_api_key`, and `runway_api_key`.
- No data is deleted and no column definitions are changed.

3. Security Changes
- Revoke table-wide SELECT, INSERT, and UPDATE from `anon` and `authenticated`.
- Restore SELECT, INSERT, and UPDATE only for non-secret user_settings columns.
- The four API key columns therefore have no public-client read or write privilege.
- Existing row-level policies remain in place for the allowed non-secret columns.

4. Important Notes
- Device-local storage is now the application path for newly entered third-party API keys.
- Existing key values remain stored for administrative recovery but cannot be accessed through the public client roles.
- Delete policy behavior is unchanged because deleting the singleton settings row does not reveal its values; it can be tightened separately if needed.
*/

REVOKE SELECT, INSERT, UPDATE
ON TABLE public.user_settings
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE (
  id,
  coupang_partners_id,
  naver_shopping_id,
  toss_share_id,
  updated_at,
  logo_url,
  default_video_duration,
  default_tts_voice,
  auto_disclosure,
  brand_persona,
  tts_speed,
  tts_pitch,
  progress_style,
  mascot_enabled,
  mascot_style,
  capture_guide_mode,
  ui_performance,
  theme_mode,
  display_density,
  app_language,
  theme_preset,
  default_caption_tone,
  fixed_hook_phrase,
  affiliate_priority_mapping,
  auto_publish_reels,
  auto_publish_tiktok,
  auto_publish_shorts,
  auto_publish_sandbox_mode,
  clean_footage_enabled
)
ON TABLE public.user_settings
TO anon, authenticated;