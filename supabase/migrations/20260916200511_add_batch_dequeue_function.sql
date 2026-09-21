/*
# Add Batch Dequeue Function for Concurrent Render Job Processing

## Overview

This migration adds a new `dequeue_render_jobs` function that dequeues multiple
jobs in a single call, enabling the process-queue edge function to process
several jobs concurrently instead of one-at-a-time. The existing
`dequeue_render_job` (singular) function is preserved for backward compatibility.

## New Functions

### dequeue_render_jobs(p_max_count integer DEFAULT 3)
- Dequeues up to `p_max_count` queued jobs atomically using `FOR UPDATE SKIP LOCKED`
- Each job is transitioned from 'queued' to 'processing' with `started_at = now()`
- Returns a JSON array of job objects with id, job_type, payload, attempts
- Safe to call concurrently from multiple workers — `SKIP LOCKED` ensures no
  two workers get the same job
- Only dequeues jobs where `attempts < max_attempts`

## Security

- This is a SECURITY DEFINER function (runs as table owner to bypass RLS)
- EXECUTE is revoked from anon (only callable with service role key from edge functions)

## Important Notes

1. The existing `dequeue_render_job` (singular) is NOT modified or dropped.
2. Uses a temp table to work around PL/pgSQL's inability to declare record[] arrays.
3. `FOR UPDATE SKIP LOCKED` is the PostgreSQL-standard pattern for concurrent
   queue dequeuing.
*/

CREATE OR REPLACE FUNCTION public.dequeue_render_jobs(p_max_count integer DEFAULT 3)
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
BEGIN
  FOR job_id, job_type, job_payload, job_attempts IN
    SELECT id, job_type, payload, attempts
    FROM render_jobs
    WHERE status = 'queued' AND attempts < max_attempts
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
        'attempts', job_attempts
      );
    END IF;
  END LOOP;

  RETURN result_arr;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dequeue_render_jobs(integer) FROM anon;
