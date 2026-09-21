-- Add runway_task_id column to store the external Runway API task ID separately
-- from the internal job_id (task_id). This enables the async submit flow where
-- the edge function returns immediately with an internal job_id (HTTP 202)
-- before calling the Runway API. The runway_task_id is populated asynchronously
-- after the Runway API call completes.
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS runway_task_id text;

-- Index for webhook lookups by runway_task_id
CREATE INDEX IF NOT EXISTS idx_video_jobs_runway_task_id ON public.video_jobs (runway_task_id);