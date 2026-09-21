/*
# Add ai_analysis_cache table for multi-angle + tone-aware caching

## Overview

Creates a new cache table that stores the complete AI analysis result
for a multi-angle image set combined with a content tone (studio/raw).
This enables instant reuse when the same product is re-captured from
the same angles with the same tone, skipping the entire AI pipeline.

## New Table: ai_analysis_cache

- `id` (uuid, primary key)
- `image_hash` (text, unique) — hash from hashMultiAngle(): combines
  per-image hashes (sorted, order-independent) with the content tone
- `tone_manner` (text, not null) — 'studio' or 'raw'
- `product_context` (jsonb, not null) — AI analysis texture, gloss,
  category data
- `hook_options` (jsonb, not null) — generated hook phrases and
  subtitle preset packs
- `rendered_video_url` (text, not null) — final rendered short-form
  video storage URL
- `created_at` (timestamptz, default now())
- `expires_at` (timestamptz, default now() + 30 days) — archive
  retention period

## Index

- `idx_ai_cache_hash_tone` on (image_hash, tone_manner) for fast
  composite lookups during cache checks

## Security

- RLS enabled
- The app has no sign-in screen, so policies use `TO anon, authenticated`
  to allow the anon-key frontend to read and write cache entries.
  Cache data is intentionally shared across all users (same product
  + tone = same result), so `USING (true)` is correct here.
*/

CREATE TABLE IF NOT EXISTS public.ai_analysis_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_hash TEXT NOT NULL UNIQUE,
    tone_manner TEXT NOT NULL,
    product_context JSONB NOT NULL,
    hook_options JSONB NOT NULL,
    rendered_video_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_hash_tone
    ON public.ai_analysis_cache(image_hash, tone_manner);

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
