/*
# Enhance Batch Dequeue: Max Attempts Param + Priority/Scan ID Return

## Overview

Upgrades the `dequeue_render_jobs` function to:
1. Accept a `p_max_attempts` parameter so the caller controls the retry threshold
2. Return `priority` and `scan_id` in each job object for better routing
3. Add a sliding-window failure counter column to `render_jobs` for backoff

## Changes

### dequeue_render_jobs function updated
- New parameter: `p_max_attempts integer DEFAULT 3`
- Query now filters `attempts < p_max_attempts` (was using column default `max_attempts`)
- Returns `priority` and `scan_id` in each job JSON object

### render_jobs table: add consecutive_failures column
- New column: `consecutive_failures integer NOT NULL DEFAULT 0`
- Tracks consecutive failures for sliding-window backoff
- Reset to 0 on success, incremented on failure
- Used by the edge function to delay requeuing when failures cluster

## Security
- SECURITY DEFINER function, EXECUTE revoked from anon (unchanged)

## Important Notes
1. Uses CREATE OR REPLACE for the function — idempotent
2. The new column is additive — no data loss
3. The old `dequeue_render_job` (singular) is unchanged
*/

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

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
  job_id uuid;
  job_type text;
  job_payload jsonb;
  job_attempts integer;
  job_priority integer;
  job_scan_id uuid;
BEGIN
  FOR job_id, job_type, job_payload, job_attempts, job_priority, job_scan_id IN
    SELECT id, job_type, payload, attempts, priority, scan_id
    FROM render_jobs
    WHERE status = 'queued' AND attempts < p_max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT p_max_count
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE render_jobs
    SET status = 'processing', started_at = now()
    WHERE id = job_id AND status = 'queued';

    IF FOUND THEN
      result_arr := result_arr || jsonb_build_object(
        'id', job_id,
        'job_type', job_type,
        'payload', job_payload,
        'attempts', job_attempts,
        'priority', job_priority,
        'scan_id', job_scan_id
      );
    END IF;
  END LOOP;

  RETURN result_arr;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dequeue_render_jobs(integer, integer) FROM anon;
