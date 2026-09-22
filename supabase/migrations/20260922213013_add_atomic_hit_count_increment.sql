/*
# Add atomic hit_count increment function for ai_content_cache

## Purpose
The client-side code was reading `hit_count`, incrementing it in JavaScript,
and writing it back. This creates a race condition: concurrent cache lookups
read the same value and overwrite each other's increment, causing hit count
statistics to be lost.

## Changes
- Adds `increment_cache_hit_count(cache_key text)` SECURITY DEFINER function
  that atomically increments `hit_count` by 1 and updates `updated_at` using
  a single SQL UPDATE statement (no read-then-write gap).
- Adds `increment_cache_hit_count_by_id(row_id uuid)` for the same purpose
  but keyed by row id (used by `findSimilarCachedResult`).

## Security
- Functions are SECURITY DEFINER to allow the anon role to call them via RPC.
- Functions only increment existing rows; no new data is created.
*/

CREATE OR REPLACE FUNCTION increment_cache_hit_count(cache_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_content_cache
  SET hit_count = hit_count + 1,
      updated_at = now()
  WHERE ai_content_cache.cache_key = cache_key;
END;
$$;

CREATE OR REPLACE FUNCTION increment_cache_hit_count_by_id(row_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_content_cache
  SET hit_count = hit_count + 1,
      updated_at = now()
  WHERE ai_content_cache.id = row_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_cache_hit_count(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_cache_hit_count_by_id(uuid) TO anon, authenticated;
