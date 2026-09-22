/*
# Fix Schema Mismatches Causing 400 Bad Request Errors

## Problem
The app queries several tables with columns or filter values that don't match
the actual database schema, causing Supabase to return 400 Bad Request errors.
On mobile, these errors trigger infinite retry loops and forced app termination.

## Changes

### 1. leaderboard_entries — add total_clicks column
The app's LeaderboardEntry interface and sample data reference `total_clicks`
but the column doesn't exist in the database. `select('*')` succeeds but the
type is wrong, and any insert/upsert with `total_clicks` would 400.

- Add `total_clicks integer NOT NULL DEFAULT 0`

### 2. inventory_items — add missing columns
The app's InventoryItem interface and updateInventoryItem() function spread
Partial<InventoryItem> into .update(), which can include `price`,
`original_price`, `is_today_menu`, `is_closing_sale`, `auto_shortform`.
None of these columns exist, causing 400 errors on update.

- Add `price numeric` (nullable, for optional product pricing)
- Add `original_price numeric` (nullable, for discount display)
- Add `is_today_menu boolean NOT NULL DEFAULT false`
- Add `is_closing_sale boolean NOT NULL DEFAULT false`
- Add `auto_shortform boolean NOT NULL DEFAULT false`

### 3. gpu_autoscale_config — insert default row
The app queries `.eq('id', 1)` but the id column is uuid. Rather than
changing the column type (which would lose data), the app code will be
fixed to use `.limit(1)`. This migration ensures a default config row exists.

- Insert a default row if no rows exist (min_workers=1, max_workers=4, etc.)

## Security
No RLS or policy changes. Existing policies remain intact.
*/

-- 1. Add total_clicks to leaderboard_entries
ALTER TABLE leaderboard_entries
  ADD COLUMN IF NOT EXISTS total_clicks integer NOT NULL DEFAULT 0;

-- 2. Add missing columns to inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS original_price numeric,
  ADD COLUMN IF NOT EXISTS is_today_menu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_closing_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_shortform boolean NOT NULL DEFAULT false;

-- 3. Ensure gpu_autoscale_config has a default row
INSERT INTO gpu_autoscale_config (min_workers, max_workers, scale_up_threshold, scale_down_threshold, check_interval_sec, is_enabled, enabled, worker_concurrency)
SELECT 1, 4, 10, 2, 30, true, true, 2
WHERE NOT EXISTS (SELECT 1 FROM gpu_autoscale_config);
