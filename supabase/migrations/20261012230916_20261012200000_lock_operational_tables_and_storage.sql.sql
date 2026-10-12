/*
# Lock operational tables, secure storage, protect push subscription keys

## Problem
The app uses a no-auth (single-tenant) model where all tables have blanket
anon CRUD policies (`USING (true)`). This is acceptable for user-generated
content (scans, short_links) but NOT for operational/financial tables where
client-writable access enables abuse:
- credit_balance / credit_transactions: anyone can set balance to 999999
- render_jobs: anyone can mark jobs complete with arbitrary results
- rate_limit_log: anyone can DELETE to reset rate limits
- revenue_records / leaderboard_entries / creator_tier: forgeable metrics
- gpu_autoscale_config / gpu_worker_heartbeats: infrastructure sabotage
- error_logs: anyone can DELETE the audit trail
- push_subscriptions.keys: Web Push secrets readable by anyone
- storage objects (scans/videos/assets): anyone can DELETE/overwrite files

## Changes

### 1. Operational tables — remove anon INSERT/UPDATE/DELETE
Tables: credit_balance, credit_transactions, render_jobs, rate_limit_log,
revenue_records, leaderboard_entries, creator_tier, gpu_autoscale_config,
gpu_worker_heartbeats, error_logs

- Revoke INSERT, UPDATE, DELETE from anon on these tables
- Keep SELECT on tables the app displays (credit_balance, creator_tier,
  leaderboard_entries, render_jobs for status, error_logs for display)
- Remove SELECT on rate_limit_log, gpu_autoscale_config, gpu_worker_heartbeats,
  revenue_records (not displayed in-app)
- Drop the corresponding anon CRUD policies
- authenticated role retains SELECT only on display tables

### 2. Storage — restrict anon write/delete
- Keep public READ on scans/videos/assets (shared content)
- Keep public INSERT on scans/videos/assets (app uploads)
- Remove anon UPDATE and DELETE on scans/videos/assets
  (only service role can modify/delete objects)

### 3. Push subscriptions — protect keys column
- Revoke SELECT on push_subscriptions.keys from anon and authenticated
- The keys column contains Web Push auth secrets
- Keep full access on other columns for push registration

### 4. Revoke EXECUTE on increment functions from anon
- increment_analysis_cache_hit, increment_cache_hit_count, increment_click_count
- These SECURITY DEFINER functions should only be called by service role
*/

-- ─── 1. Operational tables: revoke write privileges ───

-- credit_balance: app reads balance, service role writes
REVOKE INSERT, UPDATE, DELETE ON public.credit_balance FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_insert_credit_balance" ON public.credit_balance;
DROP POLICY IF EXISTS "anon_update_credit_balance" ON public.credit_balance;
DROP POLICY IF EXISTS "anon_delete_credit_balance" ON public.credit_balance;

-- credit_transactions: service role only (audit trail)
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.credit_transactions FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "anon_insert_credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "anon_update_credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "anon_delete_credit_transactions" ON public.credit_transactions;

-- render_jobs: app reads status, service role writes
REVOKE INSERT, UPDATE, DELETE ON public.render_jobs FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_insert_render_jobs" ON public.render_jobs;
DROP POLICY IF EXISTS "anon_update_render_jobs" ON public.render_jobs;
DROP POLICY IF EXISTS "anon_delete_render_jobs" ON public.render_jobs;

-- rate_limit_log: service role only (anti-abuse integrity)
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_log FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_rate_limit_log" ON public.rate_limit_log;
DROP POLICY IF EXISTS "anon_insert_rate_limit_log" ON public.rate_limit_log;
DROP POLICY IF EXISTS "anon_update_rate_limit_log" ON public.rate_limit_log;
DROP POLICY IF EXISTS "anon_delete_rate_limit_log" ON public.rate_limit_log;

-- revenue_records: service role only
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.revenue_records FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_revenue_records" ON public.revenue_records;
DROP POLICY IF EXISTS "anon_insert_revenue_records" ON public.revenue_records;
DROP POLICY IF EXISTS "anon_update_revenue_records" ON public.revenue_records;
DROP POLICY IF EXISTS "anon_delete_revenue_records" ON public.revenue_records;

-- leaderboard_entries: app reads, service role writes
REVOKE INSERT, UPDATE, DELETE ON public.leaderboard_entries FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_insert_leaderboard_entries" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "anon_update_leaderboard_entries" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "anon_delete_leaderboard_entries" ON public.leaderboard_entries;

-- creator_tier: app reads, service role writes
REVOKE INSERT, UPDATE, DELETE ON public.creator_tier FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_insert_creator_tier" ON public.creator_tier;
DROP POLICY IF EXISTS "anon_update_creator_tier" ON public.creator_tier;
DROP POLICY IF EXISTS "anon_delete_creator_tier" ON public.creator_tier;

-- gpu_autoscale_config: service role only
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.gpu_autoscale_config FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_gpu_autoscale_config" ON public.gpu_autoscale_config;
DROP POLICY IF EXISTS "anon_insert_gpu_autoscale_config" ON public.gpu_autoscale_config;
DROP POLICY IF EXISTS "anon_update_gpu_autoscale_config" ON public.gpu_autoscale_config;
DROP POLICY IF EXISTS "anon_delete_gpu_autoscale_config" ON public.gpu_autoscale_config;

-- gpu_worker_heartbeats: service role only
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.gpu_worker_heartbeats FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_gpu_worker_heartbeats" ON public.gpu_worker_heartbeats;
DROP POLICY IF EXISTS "anon_insert_gpu_worker_heartbeats" ON public.gpu_worker_heartbeats;
DROP POLICY IF EXISTS "anon_update_gpu_worker_heartbeats" ON public.gpu_worker_heartbeats;
DROP POLICY IF EXISTS "anon_delete_gpu_worker_heartbeats" ON public.gpu_worker_heartbeats;

-- error_logs: app can insert (client-side error reporting), service role reads/deletes
REVOKE UPDATE, DELETE ON public.error_logs FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_update_error_logs" ON public.error_logs;
DROP POLICY IF EXISTS "anon_delete_error_logs" ON public.error_logs;

-- ─── 2. Storage: restrict anon UPDATE and DELETE ───

-- scans bucket: keep public read + upload, remove update + delete
DROP POLICY IF EXISTS "scans_update_all" ON storage.objects;
DROP POLICY IF EXISTS "scans_delete_all" ON storage.objects;

-- videos bucket: keep public read + upload, remove update + delete
DROP POLICY IF EXISTS "videos_update_all" ON storage.objects;
DROP POLICY IF EXISTS "videos_delete_all" ON storage.objects;

-- assets bucket: keep public read + insert, remove update + delete
DROP POLICY IF EXISTS "assets_public_update" ON storage.objects;
DROP POLICY IF EXISTS "assets_public_delete" ON storage.objects;

-- ─── 3. Push subscriptions: protect keys column ───

REVOKE SELECT (keys) ON TABLE public.push_subscriptions FROM anon, authenticated;
REVOKE UPDATE (keys) ON TABLE public.push_subscriptions FROM anon, authenticated;

-- ─── 4. Revoke EXECUTE on increment functions from anon ───

REVOKE EXECUTE ON FUNCTION public.increment_analysis_cache_hit(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_cache_hit_count(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_click_count(text) FROM anon, authenticated;