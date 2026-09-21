/*
# Add Job-Type-Aware Dequeue for Smarter Worker Routing

## Overview

Adds a new `dequeue_render_jobs_by_type` function that allows workers to
claim only jobs of specific types. This enables the process-queue edge
function to route different job types to specialized workers, improving
throughput by avoiding situations where a worker claims a heavy video
render job but also picks up lightweight TTS jobs it could have left for
another worker.

## New Function

### dequeue_render_jobs_by_type(
  p_job_types text[],
  p_max_count integer DEFAULT 3,
  p_max_attempts integer DEFAULT 3
)
- Same SKIP LOCKED pattern as dequeue_render_jobs
- Filters to only jobs whose job_type is in the provided array
- Returns the same JSON array shape (id, job_type, payload, attempts,
  priority, scan_id)
- SECURITY DEFINER, EXECUTE revoked from anon

## Important Notes
1. Uses the same partial index (idx_render_jobs_dequeue) for fast scanning
2. The type filter is applied on top of the status='queued' partial index
3. Complements the existing dequeue_render_jobs (no changes to that function)
4. Idempotent via CREATE OR REPLACE
*/

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
    SELECT id, job_type, payload, attempts, priority, scan_id
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
      claimable.scan_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'job_type', job_type,
      'payload', payload,
      'attempts', attempts,
      'priority', priority,
      'scan_id', scan_id
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
