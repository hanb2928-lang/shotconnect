/*
# Create ai_analysis_cache table for video result caching

## Purpose
Enables intelligent caching of AI video generation results. When a user
regenerates a video with the same source images + content tone + motion
template parameters, the system returns the previously rendered video
instead of re-running expensive GPU inference.

## New Table: ai_analysis_cache
- `id` (uuid, PK)
- `image_hash` (text, NOT NULL) — hash from hashMultiAngle(): combines
  per-image hashes (sorted, order-independent) with the content tone.
  Same images + same tone = same hash.
- `motion_template_hash` (text, NOT NULL, default '') — hash of all
  generation parameters beyond images+tone (stylePreset, durationSec,
  aspectRatio, hookCategory, cameraRotation, zoomSpeed, transitionEffect,
  enableOrbit360, orbitSpeed, etc.). Empty string when no template params
  are passed (backward compatible).
- `tone_manner` (text, NOT NULL) — 'studio' or 'raw'
- `product_context` (jsonb, NOT NULL) — AI analysis data (product name,
  category, prompt, scanId)
- `hook_options` (jsonb, NOT NULL) — generated hook phrases, caption text,
  hook category
- `rendered_video_url` (text, NOT NULL) — final rendered video URL
- `hit_count` (integer, default 0) — cache hit counter for analytics
- `created_at` (timestamptz, default now())
- `expires_at` (timestamptz, default now() + 30 days) — cache retention

## Unique Constraint
Composite UNIQUE on (image_hash, motion_template_hash) so the same images
with different motion templates produce separate cache entries.

## RPC Function: increment_cache_hit_count
Increments hit_count for a given cache_key. Called fire-and-forget
on cache hits for analytics.

## Security
- RLS enabled
- TO anon, authenticated with USING (true) — cache data is intentionally
  shared across all users (same product + tone + template = same result)
*/

CREATE TABLE IF NOT EXISTS public.ai_analysis_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_hash TEXT NOT NULL,
    motion_template_hash TEXT NOT NULL DEFAULT '',
    tone_manner TEXT NOT NULL DEFAULT '',
    product_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    hook_options JSONB NOT NULL DEFAULT '{}'::jsonb,
    rendered_video_url TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

ALTER TABLE public.ai_analysis_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_select_ai_analysis_cache"
ON public.ai_analysis_cache FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_insert_ai_analysis_cache"
ON public.ai_analysis_cache FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_update_ai_analysis_cache"
ON public.ai_analysis_cache FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ai_analysis_cache" ON public.ai_analysis_cache;
CREATE POLICY "anon_delete_ai_analysis_cache"
ON public.ai_analysis_cache FOR DELETE
TO anon, authenticated USING (true);

-- Composite unique constraint: same images + different templates = separate entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'ai_analysis_cache_hash_template_key'
  ) THEN
    ALTER TABLE public.ai_analysis_cache
      ADD CONSTRAINT ai_analysis_cache_hash_template_key
      UNIQUE (image_hash, motion_template_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_cache_hash_template
  ON public.ai_analysis_cache (image_hash, motion_template_hash);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires
  ON public.ai_analysis_cache (expires_at);

-- Atomic hit count increment function
CREATE OR REPLACE FUNCTION public.increment_cache_hit_count(cache_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ai_content_cache
  SET hit_count = hit_count + 1,
      updated_at = now()
  WHERE cache_key = cache_key;
END;
$$;

-- Atomic hit count increment for ai_analysis_cache by composite key
CREATE OR REPLACE FUNCTION public.increment_analysis_cache_hit(
  p_image_hash text,
  p_motion_template_hash text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ai_analysis_cache
  SET hit_count = hit_count + 1
  WHERE image_hash = p_image_hash
    AND motion_template_hash = p_motion_template_hash;
END;
$$;
