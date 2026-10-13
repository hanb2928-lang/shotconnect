/*
# Add prompt and render params to video_jobs for server-side HD upgrade

## Purpose
The Fire & Forget UX navigates the user away from the result page immediately
after submitting a draft video. Previously the HD upgrade was triggered
client-side after the draft completed — but the client is gone, so HD never
fires. Moving the HD trigger server-side requires storing the Runway prompt
and render parameters (aspect ratio, duration, fps) on the video_jobs row so
the server can re-submit the HD job without the client being present.

## Changes
1. New columns on `video_jobs`:
   - `runway_prompt` (text) — the full Runway prompt string used for the draft
   - `aspect_ratio` (text, default '9:16') — aspect ratio for the render
   - `duration_sec` (integer, default 5) — duration in seconds
   - `fps` (integer) — frames per second for the render
2. No RLS changes — these columns are populated by the service role (edge
   function) and read by the edge function. Existing policies already cover
   the table.

## Notes
- All columns are nullable / have defaults so existing rows are not affected.
- The edge function's `saveVideoJob` will be updated to write these columns.
- `handleServerPoll` and the webhook handler will read them to auto-submit
  HD jobs when `is_hd = true` and `hd_task_id IS NULL`.
*/

ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS runway_prompt text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT '9:16',
  ADD COLUMN IF NOT EXISTS duration_sec integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS fps integer;