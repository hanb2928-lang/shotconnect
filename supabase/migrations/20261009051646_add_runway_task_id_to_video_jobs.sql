/*
# Restore external Runway task tracking for asynchronous video jobs

1. New Columns
- `public.video_jobs.runway_task_id` (text, nullable): stores the external Runway task ID separately from the internal `task_id` returned to the app before Runway submission finishes.

2. Modified Tables
- `public.video_jobs`: adds the missing external-provider task identifier used by server polling, webhook reconciliation, and completion recovery.

3. Indexes
- Adds an index on `runway_task_id` to keep provider callback and server-poll lookups fast.

4. Security
- No RLS, grants, or policies are changed. The existing access controls remain in place.

5. Important Notes
- The change is additive and preserves all existing video jobs.
- IF NOT EXISTS makes this migration safe if a partial deployment already added the column or index.
*/

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS runway_task_id text;

CREATE INDEX IF NOT EXISTS idx_video_jobs_runway_task_id
  ON public.video_jobs (runway_task_id);