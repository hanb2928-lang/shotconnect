/*
# Composite Indexes and RLS Security Hardening

## Overview

This migration adds missing composite indexes on the most frequently queried tables
to improve query performance, and fixes RLS/security gaps identified by the
database linter.

## 1. Composite Indexes Added

### video_jobs
- `idx_video_jobs_status_created` on (status, created_at DESC)
  - Accelerates the common query: "get video jobs by status, newest first"
  - This is the primary query pattern for the video job recovery and polling features

### scans
- `idx_scans_source_created` on (scan_source, created_at DESC)
  - Accelerates filtering scans by source (e.g. "camera" vs "gallery") sorted by newest

### render_jobs
- `idx_render_jobs_scan_status` on (scan_id, status)
  - Accelerates looking up all render jobs for a specific scan with a status filter

## 2. RLS Fix: rate_limit_log

The `rate_limit_log` table had RLS enabled but zero policies, making it completely
inaccessible. Since the `check_rate_limit()` SECURITY DEFINER function bypasses RLS,
the table only needs write access from that function (which runs as owner). We add
an INSERT-only policy for anon/authenticated so the function can log rate limit
events when called from the frontend. No SELECT/UPDATE/DELETE is needed — rate
limit logs are internal and should not be readable from the API.

## 3. SECURITY DEFINER Function Hardening

Nine SECURITY DEFINER functions were executable by the `anon` role, meaning
unauthenticated users could call privileged operations like `add_credits`,
`deduct_credits`, `dequeue_render_job`, etc. This migration revokes EXECUTE
from `anon` on all SECURITY DEFINER functions, keeping EXECUTE only for
`authenticated` (where applicable) and the function owner.

Functions hardened:
- add_credits
- deduct_credits
- check_rate_limit
- clean_stale_workers
- count_active_workers
- dequeue_render_job
- increment_analysis_cache_hit
- increment_click_count
- trigger_queue_processor

## Important Notes

1. All indexes use CREATE INDEX IF NOT EXISTS for idempotency.
2. REVOKE is idempotent — running it again has no effect.
3. No data is modified or deleted — this is purely a performance and security improvement.
4. The `check_rate_limit` function is called from edge functions with the service role
   key, so revoking anon EXECUTE does not affect its functionality.
*/

-- ============================================================
-- 1. Composite Indexes
-- ============================================================

-- video_jobs: (status, created_at DESC) — most common query pattern
CREATE INDEX IF NOT EXISTS idx_video_jobs_status_created
  ON public.video_jobs (status, created_at DESC);

-- scans: (scan_source, created_at DESC) — filter by source, sorted by newest
CREATE INDEX IF NOT EXISTS idx_scans_source_created
  ON public.scans (scan_source, created_at DESC);

-- render_jobs: (scan_id, status) — lookup jobs for a scan with status filter
CREATE INDEX IF NOT EXISTS idx_render_jobs_scan_status
  ON public.render_jobs (scan_id, status);

-- ============================================================
-- 2. RLS Fix: rate_limit_log
-- ============================================================

-- rate_limit_log had RLS enabled but zero policies.
-- Add INSERT-only policy so the check_rate_limit() function (SECURITY DEFINER)
-- can log events when invoked. No SELECT/UPDATE/DELETE needed — these are
-- internal operational logs not exposed to the API.

DROP POLICY IF EXISTS "anon_insert_rate_limit_log" ON public.rate_limit_log;
CREATE POLICY "anon_insert_rate_limit_log"
  ON public.rate_limit_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ============================================================
-- 3. SECURITY DEFINER Function Hardening
-- ============================================================
-- Revoke EXECUTE from anon on all SECURITY DEFINER functions.
-- These are privileged operations that must not be callable without authentication.

REVOKE EXECUTE ON FUNCTION public.add_credits(integer, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clean_stale_workers(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_active_workers(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dequeue_render_job(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_analysis_cache_hit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_click_count(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_queue_processor() FROM anon;
