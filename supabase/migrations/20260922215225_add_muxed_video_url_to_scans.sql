/*
# Add muxed_video_url column to scans table

## Purpose
The AI video generation pipeline produces a silent video (video_url) and
a separate TTS narration audio file (tts_url). A new client-side muxing
step combines them into a single video file with synchronized narration.
This column stores the URL of that muxed video in Supabase Storage.

## Changes
1. New column on `scans`:
   - `muxed_video_url` (text, nullable) — public URL of the final video
     with TTS narration audio merged in. Null until muxing completes.

## Security
- No new tables created.
- No RLS policy changes — the existing scans policies already govern
  all columns on the table, including new ones.
- The column is nullable with no default, so existing rows are unaffected.
*/

ALTER TABLE scans ADD COLUMN IF NOT EXISTS muxed_video_url text;
