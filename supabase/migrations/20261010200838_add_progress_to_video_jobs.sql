/*
# Add progress column to video_jobs

1. Modified Tables
- `video_jobs`: add `progress` double precision column (nullable, default null).
  Stores the Runway-reported progress fraction (0.0–1.0) so the client's
  Realtime listener can update the progress bar instantly on each DB row
  update, instead of waiting for the next 5-second poll cycle.
2. Security
- No RLS policy changes. Existing policies cover the new column automatically
  since it is on an already-protected table.
3. Notes
- Column is nullable so existing rows are unaffected.
- The server-poll handler writes 0.0–1.0 from Runway's status response.
- The client Realtime callback reads `payload.new.progress` and feeds it
  into `applyProgress()` for immediate UI sync.
*/

ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS progress double precision DEFAULT null;