/*
# Add idempotency_key column to video_jobs

## Purpose
Prevents duplicate video generation submissions when the client retries a
request due to network loss (e.g. entering a tunnel or elevator right after
tapping "generate"). Without this, every retry creates a new Runway API
call — wasting GPU resources and incurring billing charges for identical
renders.

## Changes
1. New column: `video_jobs.idempotency_key` (text, nullable)
   - Stores a client-generated UUID sent with each submit request.
   - NULL for legacy rows and for internal modes (runway-submit, server-poll,
     webhook, poll) that don't send a key.
2. New partial unique index: `idx_video_jobs_idempotency_key_unique`
   - `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL`
   - Ensures only one row per idempotency key. A retry that tries to INSERT
     a second row with the same key will fail with a unique violation,
     which the server catches and turns into a "return existing job" response.
3. No RLS changes — existing policies on video_jobs are unaffected.

## How it works
1. Client generates a UUID before calling the edge function.
2. Server's handleSubmit checks for an existing non-terminal row with the
   same key BEFORE creating a new one.
3. If found → returns the existing taskId (no new Runway API call).
4. If not found → inserts a new row with the key and proceeds normally.
5. The unique index is the last-line-of-defense: if two requests race past
   the SELECT check, the second INSERT fails and the server returns the
   first row's data.
*/

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_jobs_idempotency_key_unique
  ON public.video_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;