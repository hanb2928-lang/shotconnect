/*
# Create AI Diagnostics & Learning Table

1. New Tables
- `ai_diagnostics`: Records each AI video generation attempt with diagnostic
  metadata, failure classification, auto-fix actions applied, and outcome
  signals. Used by the self-diagnostic and self-learning system to track
  patterns across generations and adapt pipeline parameters automatically.

  Columns:
  - `id` (uuid, PK)
  - `session_id` (text) — client session identifier for grouping events
  - `scan_id` (text, nullable) — associated scan if any
  - `job_id` (text, nullable) — associated video job task ID
  - `pipeline_stage` (text) — which stage: submit, render, poll, hd_upgrade, mux
  - `failure_category` (text, nullable) — classified failure type (payload_too_large, network_timeout, etc.)
  - `failure_detail` (text, nullable) — human-readable error message
  - `auto_fix_applied` (text, nullable) — what auto-fix was attempted
  - `auto_fix_succeeded` (boolean, nullable) — whether the fix resolved the issue
  - `render_duration_ms` (integer, nullable) — wall-clock render time
  - `model_used` (text, nullable) — gen4.5, seedance2_5, etc.
  - `resolution` (text, nullable) — 480p, 720p, 1080p
  - `fps` (integer, nullable) — frames per second
  - `duration_sec` (integer, nullable) — video duration in seconds
  - `is_draft` (boolean, default false)
  - `selected_mode` (text, nullable) — auto_3d, universal_synthesis, manual
  - `enable_virtual_fitting` (boolean, default false)
  - `had_model_image` (boolean, default false) — whether model image was provided
  - `outcome` (text) — success, failed, timeout, abandoned
  - `learned_adjustments` (jsonb, nullable) — parameter adjustments learned from this event
  - `device_info` (jsonb, nullable) — platform, app version, etc.
  - `created_at` (timestamptz, default now())

2. Indexes
  - `ai_diagnostics_created_at_idx` on `created_at` (time-based queries)
  - `ai_diagnostics_session_idx` on `session_id` (per-session analysis)
  - `ai_diagnostics_outcome_idx` on `outcome` (success/failure rate queries)
  - `ai_diagnostics_failure_category_idx` on `failure_category` (pattern analysis)

3. Security
  - RLS enabled
  - anon + authenticated full CRUD (single-tenant app, no sign-in required)
*/

CREATE TABLE IF NOT EXISTS ai_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  scan_id text,
  job_id text,
  pipeline_stage text NOT NULL DEFAULT 'submit',
  failure_category text,
  failure_detail text,
  auto_fix_applied text,
  auto_fix_succeeded boolean,
  render_duration_ms integer,
  model_used text,
  resolution text,
  fps integer,
  duration_sec integer,
  is_draft boolean NOT NULL DEFAULT false,
  selected_mode text,
  enable_virtual_fitting boolean NOT NULL DEFAULT false,
  had_model_image boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT 'unknown',
  learned_adjustments jsonb,
  device_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_diagnostics" ON ai_diagnostics;
CREATE POLICY "anon_select_diagnostics" ON ai_diagnostics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_diagnostics" ON ai_diagnostics;
CREATE POLICY "anon_insert_diagnostics" ON ai_diagnostics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_diagnostics" ON ai_diagnostics;
CREATE POLICY "anon_update_diagnostics" ON ai_diagnostics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_diagnostics" ON ai_diagnostics;
CREATE POLICY "anon_delete_diagnostics" ON ai_diagnostics FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS ai_diagnostics_created_at_idx ON ai_diagnostics (created_at);
CREATE INDEX IF NOT EXISTS ai_diagnostics_session_idx ON ai_diagnostics (session_id);
CREATE INDEX IF NOT EXISTS ai_diagnostics_outcome_idx ON ai_diagnostics (outcome);
CREATE INDEX IF NOT EXISTS ai_diagnostics_failure_category_idx ON ai_diagnostics (failure_category);
