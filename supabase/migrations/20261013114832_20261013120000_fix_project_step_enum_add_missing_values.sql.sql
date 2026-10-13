-- CRITICAL FIX: The project_step enum was missing values that the
-- generate-video edge function writes to video_jobs.step. Specifically,
-- 'planning' and 'submitting' are written immediately on job creation
-- and Runway submit, but were NOT in the enum. This caused every
-- INSERT to video_jobs to fail silently (PostgreSQL rejects invalid
-- enum values), so no job row was ever created — the client polled
-- forever and video generation NEVER succeeded.
--
-- This migration adds all step values the server writes throughout
-- the video generation lifecycle.

ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'planning';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'submitting';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'analyzing';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'hooking';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'encoding';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'muxing';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'throttled';
ALTER TYPE public.project_step ADD VALUE IF NOT EXISTS 'queued';
