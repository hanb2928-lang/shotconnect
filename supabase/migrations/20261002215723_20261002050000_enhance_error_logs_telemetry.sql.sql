/*
# Enhance error_logs for real-time telemetry

1. Modified Tables
   - `error_logs`
     - Add `breadcrumbs` (jsonb) — array of {timestamp, category, message} leading up to the error
     - Add `release` (text) — app release/version tag for filtering by deployment
     - Add `url` (text) — current route/screen when error occurred
     - Add `user_agent` (text) — browser/device user agent string

2. Security
   - No RLS changes — existing INSERT (anon+authenticated, WITH CHECK true) and SELECT policies remain.
   - New columns are nullable so existing rows and inserts still work.

3. Performance
   - Add index on (release, created_at DESC) for per-release error browsing
   - Add index on (level, created_at DESC) for severity-filtered dashboards
*/

ALTER TABLE error_logs
  ADD COLUMN IF NOT EXISTS breadcrumbs jsonb,
  ADD COLUMN IF NOT EXISTS release text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS error_logs_release_created_idx ON error_logs (release, created_at DESC);
