/*
# Add a safe public user settings view

1. Purpose
- Fix REST SELECT failures without restoring access to stored third-party API keys.
- Expose only the non-secret settings columns the browser already uses.

2. New View
- `public.user_settings_public`
- Contains the singleton settings row without `openai_api_key`, `pexels_api_key`, `tts_api_key`, or `runway_api_key`.

3. Security Changes
- Uses invoker security so row and column permissions are evaluated for the requesting role.
- Grants SELECT on the view to `anon` and `authenticated` only.
- The underlying API key columns remain excluded and inaccessible to the public client.

4. Important Notes
- The existing write path continues to use `public.user_settings` with its non-secret column grants.
- This migration does not change data or delete any objects.
*/

CREATE OR REPLACE VIEW public.user_settings_public
WITH (security_invoker = true)
AS
SELECT
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
FROM public.user_settings;

GRANT SELECT ON public.user_settings_public TO anon, authenticated;