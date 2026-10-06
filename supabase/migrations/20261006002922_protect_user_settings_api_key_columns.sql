/*
# Protect user-provided API key columns in user_settings

1. Purpose
- Prevent the public client roles from reading or writing third-party API keys stored in the existing user_settings row.
- Keep ordinary application preferences writable through the existing settings flow.

2. Affected Table
- `public.user_settings`
- Protected columns: `openai_api_key`, `pexels_api_key`, `tts_api_key`, and `runway_api_key`.
- No rows, tables, or column definitions are deleted or renamed.

3. Security Changes
- Revoke SELECT access to the four API key columns from `anon` and `authenticated`.
- Revoke INSERT access to the four API key columns from `anon` and `authenticated`.
- Revoke UPDATE access to the four API key columns from `anon` and `authenticated`.
- Existing row-level policies remain unchanged for non-secret settings columns.
- The service role and table owner retain administrative access for maintenance.

4. Important Notes
- The application now stores newly entered third-party API keys in device-local storage instead of the database.
- Existing database values remain in place but are no longer readable or writable by the public client roles.
- This migration does not alter Supabase authentication or Storage policies.
*/

REVOKE SELECT (openai_api_key, pexels_api_key, tts_api_key, runway_api_key)
ON TABLE public.user_settings
FROM anon, authenticated;

REVOKE INSERT (openai_api_key, pexels_api_key, tts_api_key, runway_api_key)
ON TABLE public.user_settings
FROM anon, authenticated;

REVOKE UPDATE (openai_api_key, pexels_api_key, tts_api_key, runway_api_key)
ON TABLE public.user_settings
FROM anon, authenticated;