/*
# Add progress column to render_jobs

1. Modified Tables
- `render_jobs`: add `progress` double precision column (nullable, default null).
  Stores a 0.0–1.0 progress fraction so the client's Realtime listener can
  update the progress bar instantly on each DB row update, instead of
  waiting for the next 3-second poll cycle.
2. Security
- No RLS policy changes. Existing policies cover the new column automatically.
3. Notes
- Column is nullable so existing rows are unaffected.
- Edge functions write progress (0.0–1.0) at each processing stage.
- The useQueuedJob hook's Realtime callback reads payload.new.progress
  and the TextureUploader component renders it as a smooth progress bar.
*/

ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS progress double precision DEFAULT null;