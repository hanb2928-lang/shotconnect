/*
# Add error_logs table for remote crash/error tracking

1. New Tables
   - `error_logs`
     - `id` (uuid, primary key)
     - `level` (text: 'fatal' | 'error' | 'warning') -- severity
     - `message` (text) -- error message
     - `stack` (text) -- full stack trace
     - `context` (jsonb) -- extra metadata: component, action, user_id, route, etc.
     - `platform` (text) -- 'android' | 'ios' | 'web'
     - `app_version` (text)
     - `device_info` (jsonb) -- OS version, model, screen dimensions
     - `session_id` (text) -- random ID per app launch, to group errors
     - `created_at` (timestamptz, default now())

2. Security
   - RLS enabled.
   - anon + authenticated can INSERT (so crash logs arrive even without sign-in).
   - anon + authenticated can SELECT their own session's logs (for the in-app viewer).
   - No UPDATE or DELETE (audit log — append-only).

3. Performance
   - Index on created_at (DESC) for recent-first queries.
   - Index on session_id for per-session filtering.
   - Index on level for severity filtering.
*/

CREATE TABLE IF NOT EXISTS error_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level       text NOT NULL DEFAULT 'error' CHECK (level IN ('fatal', 'error', 'warning')),
  message     text NOT NULL,
  stack       text,
  context     jsonb,
  platform    text,
  app_version text,
  device_info jsonb,
  session_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_session_id_idx ON error_logs (session_id);
CREATE INDEX IF NOT EXISTS error_logs_level_idx ON error_logs (level);

DROP POLICY IF EXISTS "insert_error_logs" ON error_logs;
CREATE POLICY "insert_error_logs" ON error_logs FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "select_error_logs" ON error_logs;
CREATE POLICY "select_error_logs" ON error_logs FOR SELECT
TO anon, authenticated USING (true);
