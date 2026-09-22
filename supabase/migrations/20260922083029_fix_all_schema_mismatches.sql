/*
# Fix schema mismatches between app code and database

1. Modified Tables

## customer_reviews
- `review_text` (text) — app writes review_text, schema has `content`
- `reviewer_name` (text) — app writes reviewer_name, schema has `author`
- `table_number` (text) — app writes table_number
- `store_photo_url` (text) — app writes store_photo_url
- `reel_status` (text) — app updates reel_status
- `reel_asset_url` (text) — app updates reel_asset_url
- `is_published` (boolean) — app updates is_published

## inventory_items
- `name` (text) — app writes name, schema has `product_name`
- `quantity` (integer) — app writes quantity, schema has `stock_quantity`
- `unit` (text) — app writes unit
- `category` (text) — app writes category
- `is_active` (boolean) — app writes is_active
- `last_updated` (timestamptz) — app writes last_updated, schema has `updated_at`

## inventory_alert_settings
- `enabled` (boolean) — app reads/writes enabled
- `breaktime_start` (text) — app reads/writes breaktime_start
- `breaktime_end` (text) — app reads/writes breaktime_end
- `closing_hour` (integer) — app reads/writes closing_hour
- `closing_alert_minutes` (integer) — app reads/writes closing_alert_minutes

## daily_quests
- `quest_type` (text) — app writes quest_type, schema has `quest_key`
- `reward_credits` (integer) — app writes reward_credits, schema has `points`
- `current_count` (integer) — app reads/writes current_count
- `status` (text) — app reads/writes status, schema has `is_active`
- `period_start` (timestamptz) — app writes period_start
- `period_end` (timestamptz) — app reads/writes period_end
- `updated_at` (timestamptz) — app writes updated_at

## leaderboard_entries
- `period` (text) — app filters by period
- `rank` (integer) — app orders by rank, schema has `rank_position`
- `tier` (text) — app reads tier
- `display_name` (text) — app reads display_name, schema has `creator_name`
- `total_revenue` (integer) — app reads total_revenue
- `viral_count` (integer) — used in sample data

## custom_platforms
- `sort_order` (integer) — app orders/writes sort_order
- `ratio` (text) — app writes ratio
- `width` (integer) — app writes width
- `height` (integer) — app writes height
- `safe_zone_top` (integer) — app writes safe_zone_top
- `safe_zone_bottom` (integer) — app writes safe_zone_bottom
- `safe_zone_sides` (integer) — app writes safe_zone_sides
- `is_builtin` (boolean) — app writes/filters is_builtin

## link_in_bio
- `is_active` (boolean) — app filters by is_active
- `bio` (text) — app writes bio, schema has `description`
- `scan_ids` (jsonb) — app writes scan_ids

## scans
- `short_url` (text) — app selects short_url

## link_bookmarks
- `platform` (text) — app writes platform
- `short_url` (text) — app writes short_url

## marketing_snippets
- `title` (text) — app writes title

## revenue_records
- `platform` (text) — app selects platform, schema has `source`

## gpu_autoscale_config
- `enabled` (boolean) — app selects/updates enabled, schema has `is_enabled`

## New Tables
## click_events
- `id` (uuid, primary key)
- `scan_id` (uuid)
- `affiliate_url` (text)
- `platform` (text)
- `clicked_at` (timestamptz)
- Matches the app's dashboard.ts click tracking query

2. Security
- New `click_events` table gets RLS enabled with anon+authenticated full access (no-auth app)
- No changes to existing table policies
*/

-- customer_reviews: add columns app expects
ALTER TABLE customer_reviews
  ADD COLUMN IF NOT EXISTS review_text text,
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS table_number text,
  ADD COLUMN IF NOT EXISTS store_photo_url text,
  ADD COLUMN IF NOT EXISTS reel_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reel_asset_url text,
  ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false;

-- inventory_items: add columns app expects
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text DEFAULT '개',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_updated timestamptz DEFAULT now();

-- inventory_alert_settings: add columns app expects
ALTER TABLE inventory_alert_settings
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS breaktime_start text DEFAULT '14:00',
  ADD COLUMN IF NOT EXISTS breaktime_end text DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS closing_hour integer DEFAULT 22,
  ADD COLUMN IF NOT EXISTS closing_alert_minutes integer DEFAULT 60;

-- daily_quests: add columns app expects
ALTER TABLE daily_quests
  ADD COLUMN IF NOT EXISTS quest_type text,
  ADD COLUMN IF NOT EXISTS reward_credits integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS period_start timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS period_end timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- leaderboard_entries: add columns app expects
ALTER TABLE leaderboard_entries
  ADD COLUMN IF NOT EXISTS period text,
  ADD COLUMN IF NOT EXISTS rank integer,
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS total_revenue integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS viral_count integer DEFAULT 0;

-- custom_platforms: add columns app expects
ALTER TABLE custom_platforms
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ratio text,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS safe_zone_top integer,
  ADD COLUMN IF NOT EXISTS safe_zone_bottom integer,
  ADD COLUMN IF NOT EXISTS safe_zone_sides integer,
  ADD COLUMN IF NOT EXISTS is_builtin boolean DEFAULT false;

-- link_in_bio: add columns app expects
ALTER TABLE link_in_bio
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS scan_ids jsonb DEFAULT '[]'::jsonb;

-- scans: add short_url column
ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS short_url text;

-- link_bookmarks: add columns app expects
ALTER TABLE link_bookmarks
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS short_url text;

-- marketing_snippets: add title column
ALTER TABLE marketing_snippets
  ADD COLUMN IF NOT EXISTS title text;

-- revenue_records: add platform column
ALTER TABLE revenue_records
  ADD COLUMN IF NOT EXISTS platform text;

-- gpu_autoscale_config: add enabled column (alias of is_enabled)
ALTER TABLE gpu_autoscale_config
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;

-- Create click_events table
CREATE TABLE IF NOT EXISTS click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid,
  affiliate_url text,
  platform text,
  clicked_at timestamptz DEFAULT now()
);

ALTER TABLE click_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_click_events" ON click_events;
CREATE POLICY "anon_select_click_events" ON click_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_click_events" ON click_events;
CREATE POLICY "anon_insert_click_events" ON click_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_click_events" ON click_events;
CREATE POLICY "anon_update_click_events" ON click_events FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_click_events" ON click_events;
CREATE POLICY "anon_delete_click_events" ON click_events FOR DELETE
  TO anon, authenticated USING (true);
