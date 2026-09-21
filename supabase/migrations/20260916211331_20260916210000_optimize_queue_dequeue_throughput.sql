/*
# Optimize Queue Dequeue Throughput for Concurrent Workers

## Overview

This migration optimizes the `render_jobs` dequeue path to maximize throughput
when multiple workers call `dequeue_render_jobs` concurrently. The existing
`FOR UPDATE SKIP LOCKED` pattern is already in place, but the query currently
requires a full table scan of queued jobs because the only index on
`(scan_id, status)` is not aligned with the dequeue query's filter+sort order.

## Changes

### 1. Partial index for fast dequeue: idx_render_jobs_dequeue
- A partial index on `(priority ASC, created_at ASC)` WHERE `status = 'queued'`
- Directly matches the dequeue query's ORDER BY and WHERE filter
- Dramatically reduces the number of rows PostgreSQL must scan to find
  dequeueable jobs, especially when the queue is large but only a small
  fraction of jobs are in 'queued' status
- Partial index (only `status = 'queued'` rows) keeps the index small and fast

### 2. Upgrade dequeue_render_jobs: batch-aware atomic UPDATE
- The current LOOP-based approach does one UPDATE per job inside the loop.
  This is correct but can be improved: instead of a FOR LOOP with per-row
  UPDATE, we now use a single CTE-based UPDATE ... RETURNING that atomically
  transitions all N jobs from 'queued' to 'processing' in one statement.
- This reduces round-trips within the function and makes the lock window
  shorter, which means less contention between concurrent workers.
- Returns the same JSON array shape (id, job_type, payload, attempts,
  priority, scan_id) for backward compatibility.

### 3. Add worker_concurrency column to gpu_autoscale_config
- New column `worker_concurrency integer NOT NULL DEFAULT 8`
- Tells the autoscale manager how many jobs each worker can handle
  in parallel (used by the edge function to compute batch sizes)

## Security
- No new RLS policies needed — no new tables
- SECURITY DEFINER function updated, EXECUTE still revoked from anon

## Important Notes
1. Uses CREATE INDEX IF NOT EXISTS — idempotent
2. Uses CREATE OR REPLACE FUNCTION — idempotent
3. The partial index only covers `status = 'queued'` rows, keeping it compact
4. The new column is additive with a safe default
*/

-- ============================================================
-- 1. Partial index for fast concurrent dequeue
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_render_jobs_dequeue
  ON public.render_jobs (priority ASC, created_at ASC)
  WHERE status = 'queued';

-- ============================================================
-- 2. Upgrade dequeue_render_jobs to single-statement atomic batch
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
  -- Atomically claim up to p_max_count queued jobs in a single UPDATE.
  -- FOR UPDATE SKIP LOCKED ensures concurrent workers never grab the same job.
  -- Using a CTE with UPDATE ... RETURNING avoids the per-row UPDATE loop,
  -- reducing lock contention and round-trips within the function.
  WITH claimable AS (
    SELECT id, job_type, payload, attempts, priority, scan_id
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

REVOKE EXECUTE ON FUNCTION public.dequeue_render_jobs(integer, integer) FROM anon;

-- ============================================================
-- 3. Add worker_concurrency to gpu_autoscale_config
-- ============================================================

ALTER TABLE public.gpu_autoscale_config
  ADD COLUMN IF NOT EXISTS worker_concurrency integer NOT NULL DEFAULT 8;
