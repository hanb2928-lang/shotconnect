/*
# Storage Lifecycle Policy — track cloud object access and expiration

## Purpose
Generated AI shortform videos and intermediate images accumulate indefinitely
in Supabase Storage, driving up costs. This migration adds the DB infrastructure
to track per-object access timestamps and classify objects into lifecycle tiers
(hot, warm, cold, expired) so that a scheduled edge function can move or delete
stale objects according to a configurable TTL policy.

## 1. New Table: `storage_object_lifecycle`
- `id` (uuid, PK)
- `scan_id` (uuid, FK → scans.id ON DELETE CASCADE) — the scan this object belongs to
- `bucket` (text) — Supabase storage bucket name (e.g. 'videos', 'images')
- `object_path` (text) — full storage path within the bucket
- `object_type` (text) — 'video' | 'image' | 'tts_audio' | 'intermediate'
- `size_bytes` (bigint, default 0) — object size for cost reporting
- `created_at` (timestptz, default now())
- `last_accessed_at` (timestamptz, default now()) — updated on download/share/replay
- `access_count` (integer, default 0) — total access events
- `tier` (text, default 'hot') — current lifecycle tier: hot|warm|cold|expired
- `expired_at` (timestamptz, nullable) — set when object is marked for deletion
- `deleted_at` (timestamptz, nullable) — set when storage object has been removed

## 2. New Table: `storage_lifecycle_policy`
- `id` (uuid, PK)
- `object_type` (text, unique) — which type this rule applies to
- `hot_ttl_hours` (integer, default 48) — time in hot tier before → warm
- `warm_ttl_days` (integer, default 7) — time in warm tier before → cold
- `cold_ttl_days` (integer, default 30) — time in cold tier before → expired
- `delete_on_expire` (boolean, default true) — whether to delete storage object on expiry
- `updated_at` (timestamptz, default now())

## 3. Security
- Both tables: single-tenant no-auth app → RLS enabled with `TO anon, authenticated` CRUD policies
- `storage_object_lifecycle` is internal bookkeeping — all app users can read/write

## 4. Indexes
- `storage_object_lifecycle` on `(scan_id)` for join queries
- `storage_object_lifecycle` on `(tier, last_accessed_at)` for sweep queries
- `storage_object_lifecycle` on `(object_type, tier)` for batch tier classification
- `storage_lifecycle_policy` on `(object_type)` unique for fast lookup
*/

-- ─── storage_object_lifecycle ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_object_lifecycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES scans(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  object_path text NOT NULL,
  object_type text NOT NULL DEFAULT 'video',
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  access_count integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'hot',
  expired_at timestamptz,
  deleted_at timestamptz
);

ALTER TABLE storage_object_lifecycle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_storage_lifecycle" ON storage_object_lifecycle;
CREATE POLICY "anon_select_storage_lifecycle"
ON storage_object_lifecycle FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_storage_lifecycle" ON storage_object_lifecycle;
CREATE POLICY "anon_insert_storage_lifecycle"
ON storage_object_lifecycle FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_storage_lifecycle" ON storage_object_lifecycle;
CREATE POLICY "anon_update_storage_lifecycle"
ON storage_object_lifecycle FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_storage_lifecycle" ON storage_object_lifecycle;
CREATE POLICY "anon_delete_storage_lifecycle"
ON storage_object_lifecycle FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sol_scan_id ON storage_object_lifecycle(scan_id);
CREATE INDEX IF NOT EXISTS idx_sol_tier_accessed ON storage_object_lifecycle(tier, last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_sol_type_tier ON storage_object_lifecycle(object_type, tier);

-- ─── storage_lifecycle_policy ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_lifecycle_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text UNIQUE NOT NULL,
  hot_ttl_hours integer NOT NULL DEFAULT 48,
  warm_ttl_days integer NOT NULL DEFAULT 7,
  cold_ttl_days integer NOT NULL DEFAULT 30,
  delete_on_expire boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE storage_lifecycle_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_lifecycle_policy" ON storage_lifecycle_policy;
CREATE POLICY "anon_select_lifecycle_policy"
ON storage_lifecycle_policy FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_lifecycle_policy" ON storage_lifecycle_policy;
CREATE POLICY "anon_insert_lifecycle_policy"
ON storage_lifecycle_policy FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_lifecycle_policy" ON storage_lifecycle_policy;
CREATE POLICY "anon_update_lifecycle_policy"
ON storage_lifecycle_policy FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_lifecycle_policy" ON storage_lifecycle_policy;
CREATE POLICY "anon_delete_lifecycle_policy"
ON storage_lifecycle_policy FOR DELETE
TO anon, authenticated USING (true);

-- Seed default policies for each object type
INSERT INTO storage_lifecycle_policy (object_type, hot_ttl_hours, warm_ttl_days, cold_ttl_days, delete_on_expire)
VALUES
  ('video', 48, 7, 30, true),
  ('image', 24, 3, 14, true),
  ('tts_audio', 24, 3, 7, true),
  ('intermediate', 2, 1, 2, true)
ON CONFLICT (object_type) DO NOTHING;

-- ─── Function: touch_storage_object ─────────────────────────────────────────
-- Updates last_accessed_at and increments access_count for a given scan_id + bucket + path.
-- Called by the frontend whenever a user views, downloads, or shares a video.
-- If no matching row exists, it upserts a new entry.

CREATE OR REPLACE FUNCTION touch_storage_object(
  p_scan_id uuid,
  p_bucket text,
  p_object_path text,
  p_object_type text DEFAULT 'video',
  p_size_bytes bigint DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO storage_object_lifecycle
    (scan_id, bucket, object_path, object_type, size_bytes, last_accessed_at, access_count, tier)
  VALUES
    (p_scan_id, p_bucket, p_object_path, p_object_type, p_size_bytes, now(), 1, 'hot')
  ON CONFLICT (scan_id, bucket, object_path) DO UPDATE
    SET last_accessed_at = now(),
        access_count = storage_object_lifecycle.access_count + 1,
        tier = 'hot',
        expired_at = NULL;
END;
$$;

-- ─── Function: classify_storage_tiers ───────────────────────────────────────
-- Reclassifies all non-deleted objects into hot/warm/cold/expired based on
-- the TTL policies. Returns a summary of counts per tier.
-- This runs server-side (called by the lifecycle edge function on a schedule).

CREATE OR REPLACE FUNCTION classify_storage_tiers()
RETURNS TABLE(tier text, count bigint)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hot → Warm: last_accessed older than hot_ttl_hours
  UPDATE storage_object_lifecycle sol
  SET tier = 'warm'
  FROM storage_lifecycle_policy pol
  WHERE sol.object_type = pol.object_type
    AND sol.tier = 'hot'
    AND sol.deleted_at IS NULL
    AND now() - sol.last_accessed_at > (pol.hot_ttl_hours || ' hours')::interval;

  -- Warm → Cold
  UPDATE storage_object_lifecycle sol
  SET tier = 'cold'
  FROM storage_lifecycle_policy pol
  WHERE sol.object_type = pol.object_type
    AND sol.tier = 'warm'
    AND sol.deleted_at IS NULL
    AND now() - sol.last_accessed_at > ((pol.hot_ttl_hours + pol.warm_ttl_days * 24) || ' hours')::interval;

  -- Cold → Expired
  UPDATE storage_object_lifecycle sol
  SET tier = 'expired',
      expired_at = COALESCE(sol.expired_at, now())
  FROM storage_lifecycle_policy pol
  WHERE sol.object_type = pol.object_type
    AND sol.tier = 'cold'
    AND sol.deleted_at IS NULL
    AND now() - sol.last_accessed_at > ((pol.hot_ttl_hours + (pol.warm_ttl_days + pol.cold_ttl_days) * 24) || ' hours')::interval;

  RETURN QUERY
  SELECT sol.tier, count(*)::bigint
  FROM storage_object_lifecycle sol
  WHERE sol.deleted_at IS NULL
  GROUP BY sol.tier;
END;
$$;

-- ─── Function: get_expired_objects ──────────────────────────────────────────
-- Returns all objects in 'expired' tier that haven't been deleted yet.
-- The edge function calls this to know which storage objects to remove.

CREATE OR REPLACE FUNCTION get_expired_objects(
  p_limit integer DEFAULT 50
) RETURNS TABLE(
  id uuid,
  scan_id uuid,
  bucket text,
  object_path text,
  object_type text,
  size_bytes bigint,
  expired_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT sol.id, sol.scan_id, sol.bucket, sol.object_path,
         sol.object_type, sol.size_bytes, sol.expired_at
  FROM storage_object_lifecycle sol
  WHERE sol.tier = 'expired'
    AND sol.deleted_at IS NULL
  ORDER BY sol.expired_at ASC
  LIMIT p_limit;
END;
$$;

-- ─── Function: mark_object_deleted ──────────────────────────────────────────
-- Marks a storage object as deleted (after the edge function successfully
-- removes it from Supabase Storage).

CREATE OR REPLACE FUNCTION mark_object_deleted(
  p_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE storage_object_lifecycle
  SET deleted_at = now()
  WHERE id = p_id;
END;
$$;
