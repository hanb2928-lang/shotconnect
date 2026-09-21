/*
# Concurrent Worker Dequeue Expansion

## Overview

Expands the parallel dequeue infrastructure for the render queue to maximize
throughput when multiple workers pull jobs concurrently. Three concrete
improvements:

1. Both batch dequeue functions now return `consecutive_failures` so the
   process-queue edge function can skip a per-job HTTP round-trip to fetch
   the failure count. This eliminates one REST call per failed job.

2. The singular `dequeue_render_job` is upgraded from a two-statement
   SELECT-then-UPDATE loop to a single CTE-based atomic UPDATE ... RETURNING,
   matching the batch function's pattern. This shortens the lock window and
   reduces contention between concurrent workers calling the singular path.

3. Adds a `count_queued_jobs_by_type` SECURITY DEFINER function so the
   autoscale manager and process-queue can get per-type queue depth in one
   RPC call instead of multiple filtered REST queries.

## Changes

### dequeue_render_jobs (batch) — updated
- Now returns `consecutive_failures` in each job JSON object
- Otherwise identical CTE + FOR UPDATE SKIP LOCKED pattern

### dequeue_render_jobs_by_type — updated
- Now returns `consecutive_failures` in each job JSON object

### dequeue_render_job (singular) — upgraded
- Replaced two-statement SELECT + UPDATE with single CTE-based UPDATE ... RETURNING
- Now also returns `consecutive_failures` and `priority` and `scan_id`
- Shorter lock window, less contention

### New function: count_queued_jobs_by_type
- Returns a JSON object mapping each job_type to its queued count
- SECURITY DEFINER, EXECUTE revoked from anon

## Security
- All functions remain SECURITY DEFINER with EXECUTE revoked from anon
- No new tables, no RLS changes

## Important Notes
1. All functions use CREATE OR REPLACE — idempotent
2. No data loss — only function definitions change
3. The partial index idx_render_jobs_dequeue still serves all three functions
*/

-- ============================================================
-- 1. Upgrade batch dequeue to return consecutive_failures
-- ============================================================

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

-- ============================================================
-- 2. Upgrade type-aware batch dequeue to return consecutive_failures
-- ============================================================

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

-- ============================================================
-- 3. Upgrade singular dequeue to atomic CTE pattern
-- ============================================================

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

-- ============================================================
-- 4. New: count_queued_jobs_by_type for per-type queue depth
-- ============================================================

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
