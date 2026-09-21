/*
# Add rate-limit logging table for AI generation quota enforcement

## Purpose
Prevents unbounded abuse of the `generate-video` edge function (which proxies
paid Runway API calls) by enforcing a per-IP daily submission cap at the
database level. Each `submit` mode call to `generate-video` inserts a row; a
SECURITY DEFINER function counts today's rows for the caller's IP and rejects
the request if the daily limit is exceeded.

## New Tables
- `rate_limit_log`
  - `id` (uuid, PK)
  - `identifier` (text, NOT NULL) — client IP or user identifier being rate-limited
  - `feature` (text, NOT NULL) — which feature is being limited (e.g. 'generate_video')
  - `created_at` (timestamptz, default now())
  - Index on (identifier, feature, created_at) for fast daily count queries

## New Functions
- `check_rate_limit(p_identifier text, p_feature text, p_daily_limit int)`
  SECURITY DEFINER function that:
  1. Counts rows in `rate_limit_log` for the given identifier+feature created today
  2. Returns true if under the limit (allowed), false if over (blocked)
  Called by the `generate-video` edge function before submitting to Runway.

## Security
- RLS enabled on `rate_limit_log` — no direct client access (anon/authenticated
  cannot read or write). Only the SECURITY DEFINER function and service-role
  edge functions interact with it.
- The `check_rate_limit` function is callable by `anon, authenticated` so edge
  functions can invoke it, but it only returns a boolean — no row data is exposed.
*/

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  feature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup
  ON rate_limit_log (identifier, feature, created_at);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- No direct client policies — only service role (edge functions) and the
-- SECURITY DEFINER function below interact with this table.

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier text,
  p_feature text,
  p_daily_limit int DEFAULT 10
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_count int;
BEGIN
  SELECT COUNT(*) INTO today_count
  FROM rate_limit_log
  WHERE identifier = p_identifier
    AND feature = p_feature
    AND created_at >= CURRENT_DATE;

  IF today_count >= p_daily_limit THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_log (identifier, feature)
  VALUES (p_identifier, p_feature);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, int) TO anon, authenticated;
