-- Migration: add rate_limit_log table + check_rate_limit function
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  feature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup
  ON rate_limit_log (identifier, feature, created_at);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

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

-- Migration: add runway_task_id to video_jobs
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS runway_task_id text;
CREATE INDEX IF NOT EXISTS idx_video_jobs_runway_task_id ON public.video_jobs (runway_task_id);

-- Migration: composite indexes + RLS fix + SECURITY DEFINER hardening
CREATE INDEX IF NOT EXISTS idx_video_jobs_status_created
  ON public.video_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_source_created
  ON public.scans (scan_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_render_jobs_scan_status
  ON public.render_jobs (scan_id, status);

DROP POLICY IF EXISTS "anon_insert_rate_limit_log" ON public.rate_limit_log;
CREATE POLICY "anon_insert_rate_limit_log"
  ON public.rate_limit_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.add_credits(integer, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clean_stale_workers(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_active_workers(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dequeue_render_job(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_analysis_cache_hit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_click_count(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_queue_processor() FROM anon;

-- Migration: complete RLS CUD policies
DROP POLICY IF EXISTS "anon_update_archetypes" ON public.content_archetypes;
CREATE POLICY "anon_update_archetypes"
  ON public.content_archetypes FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_alert_settings" ON public.inventory_alert_settings;
CREATE POLICY "anon_delete_alert_settings"
  ON public.inventory_alert_settings FOR DELETE
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon_delete_weather_settings" ON public.weather_alert_settings;
CREATE POLICY "anon_delete_weather_settings"
  ON public.weather_alert_settings FOR DELETE
  TO anon, authenticated
  USING (true);

-- Migration: add consecutive_failures column
ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

-- Migration: batch dequeue function (upgraded with CTE pattern)
CREATE INDEX IF NOT EXISTS idx_render_jobs_dequeue
  ON public.render_jobs (priority ASC, created_at ASC)
  WHERE status = 'queued';

ALTER TABLE public.gpu_autoscale_config
  ADD COLUMN IF NOT EXISTS worker_concurrency integer NOT NULL DEFAULT 8;

CREATE OR REPLACE FUNCTION public.dequeue_render_jobs(
  p_max_count integer DEFAULT 3,
  p_max_attempts integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_arr jsonb := '[]'::jsonb;
  claimed jsonb;
BEGIN
  WITH claimable AS (
    SELECT id, job_type, payload, attempts, priority, scan_id, consecutive_failures
    FROM render_jobs
    WHERE status = 'queued' AND attempts < p_max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT p_max_count
    FOR UPDATE SKIP LOCKED
  ),
  claimed_rows AS (
    UPDATE render_jobs
    SET status = 'processing', started_at = now()
    FROM claimable
    WHERE render_jobs.id = claimable.id AND render_jobs.status = 'queued'
    RETURNING
      render_jobs.id,
      claimable.job_type,
      claimable.payload,
      claimable.attempts,
      claimable.priority,
      claimable.scan_id,
      claimable.consecutive_failures
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'job_type', job_type,
      'payload', payload,
      'attempts', attempts,
      'priority', priority,
      'scan_id', scan_id,
      'consecutive_failures', consecutive_failures
    )
  )
  INTO claimed
  FROM claimed_rows;

  IF claimed IS NOT NULL THEN
    result_arr := claimed;
  END IF;

  RETURN result_arr;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dequeue_render_jobs(integer, integer) FROM anon;

-- Migration: type-aware dequeue function
CREATE OR REPLACE FUNCTION public.dequeue_render_jobs_by_type(
  p_job_types text[],
  p_max_count integer DEFAULT 3,
  p_max_attempts integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_arr jsonb := '[]'::jsonb;
  claimed jsonb;
BEGIN
  IF p_job_types IS NULL OR array_length(p_job_types, 1) IS NULL THEN
    RETURN result_arr;
  END IF;

  WITH claimable AS (
    SELECT id, job_type, payload, attempts, priority, scan_id, consecutive_failures
    FROM render_jobs
    WHERE status = 'queued'
      AND attempts < p_max_attempts
      AND job_type = ANY(p_job_types)
    ORDER BY priority ASC, created_at ASC
    LIMIT p_max_count
    FOR UPDATE SKIP LOCKED
  ),
  claimed_rows AS (
    UPDATE render_jobs
    SET status = 'processing', started_at = now()
    FROM claimable
    WHERE render_jobs.id = claimable.id AND render_jobs.status = 'queued'
    RETURNING
      render_jobs.id,
      claimable.job_type,
      claimable.payload,
      claimable.attempts,
      claimable.priority,
      claimable.scan_id,
      claimable.consecutive_failures
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'job_type', job_type,
      'payload', payload,
      'attempts', attempts,
      'priority', priority,
      'scan_id', scan_id,
      'consecutive_failures', consecutive_failures
    )
  )
  INTO claimed
  FROM claimed_rows;

  IF claimed IS NOT NULL THEN
    result_arr := claimed;
  END IF;

  RETURN result_arr;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dequeue_render_jobs_by_type(text[], integer, integer) FROM anon;

-- Migration: upgrade singular dequeue to atomic CTE pattern
CREATE OR REPLACE FUNCTION public.dequeue_render_job(max_attempts integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed jsonb;
BEGIN
  WITH claimable AS (
    SELECT id, job_type, payload, attempts, priority, scan_id, consecutive_failures
    FROM render_jobs
    WHERE status = 'queued' AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ),
  claimed_rows AS (
    UPDATE render_jobs
    SET status = 'processing', started_at = now()
    FROM claimable
    WHERE render_jobs.id = claimable.id AND render_jobs.status = 'queued'
    RETURNING
      render_jobs.id,
      claimable.job_type,
      claimable.payload,
      claimable.attempts,
      claimable.priority,
      claimable.scan_id,
      claimable.consecutive_failures
  )
  SELECT jsonb_build_object(
    'id', id,
    'job_type', job_type,
    'payload', payload,
    'attempts', attempts,
    'priority', priority,
    'scan_id', scan_id,
    'consecutive_failures', consecutive_failures
  )
  INTO claimed
  FROM claimed_rows;

  RETURN claimed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dequeue_render_job(integer) FROM anon;

-- Migration: count_queued_jobs_by_type function
CREATE OR REPLACE FUNCTION public.count_queued_jobs_by_type()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(job_type, cnt),
    '{}'::jsonb
  )
  FROM (
    SELECT job_type, count(*)::integer AS cnt
    FROM render_jobs
    WHERE status = 'queued'
    GROUP BY job_type
  ) t
$$;

REVOKE EXECUTE ON FUNCTION public.count_queued_jobs_by_type() FROM anon;

-- Migration: ai_analysis_cache table
CREATE TABLE IF NOT EXISTS public.ai_analysis_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_hash TEXT NOT NULL UNIQUE,
    tone_manner TEXT NOT NULL,
    product_context JSONB NOT NULL,
    hook_options JSONB NOT NULL,
    rendered_video_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_hash_tone
    ON public.ai_analysis_cache(image_hash, tone_manner);

ALTER TABLE public.ai_analysis_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_select_ai_analysis_cache"
ON public.ai_analysis_cache FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_insert_ai_analysis_cache"
ON public.ai_analysis_cache FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_update_ai_analysis_cache"
ON public.ai_analysis_cache FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_delete_ai_analysis_cache"
ON public.ai_analysis_cache FOR DELETE
TO anon, authenticated USING (true);

-- Migration: error_logs table
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

-- Grant on new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_log, public.ai_analysis_cache, public.error_logs TO anon, authenticated;
