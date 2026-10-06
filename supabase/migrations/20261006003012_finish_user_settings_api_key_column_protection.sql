/*
# Finish API key column privilege revocation

1. Purpose
- Remove previously granted column-level privileges that remained after table-wide privileges were revoked.

2. Affected Columns
- `public.user_settings.openai_api_key`
- `public.user_settings.pexels_api_key`
- `public.user_settings.tts_api_key`
- `public.user_settings.runway_api_key`

3. Security Changes
- Revoke SELECT, INSERT, and UPDATE on these four columns from `anon` and `authenticated`.
- Non-secret settings column grants from the preceding migration remain unchanged.
- No table or data is deleted or altered.
*/

REVOKE SELECT, INSERT, UPDATE
(
  openai_api_key,
  pexels_api_key,
  tts_api_key,
  runway_api_key
)
ON TABLE public.user_settings
FROM anon, authenticated;