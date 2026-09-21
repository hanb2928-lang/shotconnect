/*
# RLS CUD Policy Completion

## Overview

This migration completes the missing CUD (Create, Read, Update, Delete) policies
on three tables that were identified during the full RLS audit as having incomplete
policy sets. All other tables in the database already have complete 4-policy CUD
coverage and are not modified here.

## Tables Fixed

### 1. content_archetypes
- Was missing: UPDATE policy
- Added: `anon_update_archetypes` with USING(true) WITH CHECK(true)
- Rationale: This is a single-tenant no-auth app; all data is intentionally shared.
  The existing SELECT/INSERT/DELETE policies already use USING(true), so the UPDATE
  policy follows the same pattern for consistency.

### 2. inventory_alert_settings
- Was missing: DELETE policy
- Added: `anon_delete_alert_settings` with USING(true)
- Rationale: Users need to be able to delete their alert settings. The existing
  SELECT/INSERT/UPDATE policies use USING(true), so DELETE follows the same pattern.

### 3. weather_alert_settings
- Was missing: DELETE policy
- Added: `anon_delete_weather_settings` with USING(true)
- Rationale: Users need to be able to delete their weather alert settings. The
  existing SELECT/INSERT/UPDATE policies use USING(true), so DELETE follows the
  same pattern.

## Audit Summary (no changes needed for these)

The following tables were audited and found to have complete, correct policies:

- 26 tables with full 4-policy CUD using `TO anon, authenticated` + `USING(true)`/`WITH CHECK(true)`
  (correct for single-tenant no-auth app with shared/public data)

- `push_subscriptions` with full 4-policy CUD using `auth.uid() = user_id` guards
  (correct for the only auth-scoped table in the schema)

- 6 read-only/write-only tables with intentionally limited policies:
  - `credit_balance`, `credit_transactions`: SELECT only (mutations via SECURITY DEFINER)
  - `gpu_autoscale_config`, `gpu_worker_heartbeats`: SELECT only (admin/ops tables)
  - `template_registry`: SELECT only (read-only reference data)
  - `rate_limit_log`: INSERT only (internal logging)

All 35 tables have RLS enabled. No tables have RLS disabled.

## Important Notes

1. All policies use DROP IF EXISTS before CREATE for idempotency.
2. No data is modified or deleted.
3. The `USING(true)` / `WITH CHECK(true)` pattern is intentional for this
   single-tenant no-auth application where all data is shared/public.
*/

-- ============================================================
-- 1. content_archetypes: Add missing UPDATE policy
-- ============================================================

DROP POLICY IF EXISTS "anon_update_archetypes" ON public.content_archetypes;
CREATE POLICY "anon_update_archetypes"
  ON public.content_archetypes FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ============================================================
-- 2. inventory_alert_settings: Add missing DELETE policy
-- ============================================================

DROP POLICY IF EXISTS "anon_delete_alert_settings" ON public.inventory_alert_settings;
CREATE POLICY "anon_delete_alert_settings"
  ON public.inventory_alert_settings FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 3. weather_alert_settings: Add missing DELETE policy
-- ============================================================

DROP POLICY IF EXISTS "anon_delete_weather_settings" ON public.weather_alert_settings;
CREATE POLICY "anon_delete_weather_settings"
  ON public.weather_alert_settings FOR DELETE
  TO anon, authenticated
  USING (true);
