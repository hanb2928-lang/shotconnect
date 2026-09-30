/*
# ShotConnect Baseline Schema

Creates all tables, indexes, RLS policies, storage buckets, and grants
needed for the ShotConnect app to boot and function.

1. New Tables (35 total)
2. Security: RLS enabled on all, no-auth pattern (anon + authenticated)
3. Storage buckets: scans (public), videos (public)
4. Seed data: user_settings, credit_balance, creator_tier, affiliate_platforms
*/

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.project_step AS ENUM ('idle', 'uploading', 'rendering', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABLES (scans first — referenced by FKs)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url text NOT NULL,
  title text,
  summary text,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  product_name text,
  product_category text,
  price_estimate text,
  one_liner text,
  shopping_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  affiliate_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_products jsonb DEFAULT '[]'::jsonb,
  edited_image_url text,
  custom_affiliate_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_review jsonb NOT NULL DEFAULT '{}'::jsonb,
  local_store_info jsonb,
  additional_image_urls text[] DEFAULT '{}'::text[],
  scan_source text NOT NULL DEFAULT 'single',
  tts_url text,
  analysis_job_id uuid,
  image_hash text,
  hybrid_mapping jsonb,
  video_url text,
  muxed_video_url text,
  product_vision jsonb
);

CREATE TABLE IF NOT EXISTS public.affiliate_platforms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  partners_id text NOT NULL DEFAULT '',
  tracking_param text NOT NULL DEFAULT '',
  tracking_url_template text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#FF3E3E',
  is_enabled boolean NOT NULL DEFAULT true,
  is_builtin boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_content_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  task_type text NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  model_used text DEFAULT 'gpt-4o-mini',
  hit_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + '30 days'::interval),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analysis_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  image_hash text NOT NULL UNIQUE,
  analysis_result jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.content_archetypes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name text NOT NULL,
  archetype_key text NOT NULL,
  tone_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_persona (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  signature_opening text,
  signature_ending text,
  tone_preset text NOT NULL DEFAULT 'casual',
  voice_clone_ref text,
  signature_font text,
  signature_color text,
  caricature_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_tier (
  id integer NOT NULL DEFAULT 1 PRIMARY KEY,
  tier_level text NOT NULL DEFAULT 'bronze',
  total_scans integer NOT NULL DEFAULT 0,
  total_clicks integer NOT NULL DEFAULT 0,
  total_revenue integer NOT NULL DEFAULT 0,
  tier_points integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_balance (
  id integer NOT NULL DEFAULT 1 PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  total_consumed integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  amount numeric NOT NULL DEFAULT 0,
  balance_after integer NOT NULL DEFAULT 0,
  type text NOT NULL,
  description text,
  package_id text,
  feature text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_platforms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#2f9dff',
  icon text NOT NULL DEFAULT 'Share2',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id uuid,
  review_id text,
  author text,
  rating integer,
  content text,
  sentiment text,
  is_replied boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_quests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quest_key text NOT NULL,
  title text NOT NULL,
  description text,
  points integer NOT NULL DEFAULT 10,
  target_count integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gpu_autoscale_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  min_workers integer NOT NULL DEFAULT 0,
  max_workers integer NOT NULL DEFAULT 3,
  scale_up_threshold integer NOT NULL DEFAULT 5,
  scale_down_threshold integer NOT NULL DEFAULT 0,
  check_interval_sec integer NOT NULL DEFAULT 30,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gpu_worker_heartbeats (
  worker_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'ACTIVE',
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  current_job_id uuid,
  started_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_alert_settings (
  id integer NOT NULL DEFAULT 1 PRIMARY KEY,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  negative_review_threshold integer NOT NULL DEFAULT 3,
  daily_check_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name text NOT NULL,
  sku text,
  stock_quantity integer NOT NULL DEFAULT 0,
  low_stock_threshold integer DEFAULT 5,
  last_restocked_at timestamptz,
  pos_product_id text,
  pos_last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_name text NOT NULL,
  total_points integer NOT NULL DEFAULT 0,
  total_scans integer NOT NULL DEFAULT 0,
  rank_position integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.link_bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid REFERENCES public.scans(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.link_in_bio (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text,
  description text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_snippets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid,
  snippet_type text NOT NULL,
  content text NOT NULL,
  platform text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  title text NOT NULL,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.render_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.revenue_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  period_month text,
  note text,
  scan_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_assets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  asset_type text NOT NULL DEFAULT 'image',
  title text NOT NULL DEFAULT '',
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_size integer,
  mime_type text,
  thumbnail_url text,
  platform text,
  affiliate_platform text,
  upload_status text NOT NULL DEFAULT 'not_uploaded',
  share_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.short_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  destination_url text NOT NULL,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  click_count integer NOT NULL DEFAULT 0,
  last_clicked_at timestamptz,
  share_platform text
);

CREATE TABLE IF NOT EXISTS public.template_registry (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  platform text NOT NULL,
  hook_duration_sec integer NOT NULL DEFAULT 3,
  pacing_seconds double precision NOT NULL DEFAULT 1.2,
  card_style text NOT NULL DEFAULT 'bold',
  accent_color text NOT NULL DEFAULT '#2f9dff',
  bgm_mood text NOT NULL DEFAULT 'energetic',
  sfx_triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption_preset text NOT NULL DEFAULT 'bold_neon_yellow',
  hook_template text,
  hashtag_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  transition_type text NOT NULL DEFAULT 'whoosh',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.upload_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id text,
  scheduled_time timestamptz NOT NULL,
  platform text,
  caption text,
  hashtags text[],
  affiliate_url text,
  status text NOT NULL DEFAULT 'pending',
  notification_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  fired_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id integer NOT NULL DEFAULT 1 PRIMARY KEY,
  coupang_partners_id text,
  naver_shopping_id text,
  toss_share_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  openai_api_key text,
  logo_url text,
  default_video_duration text DEFAULT '15s',
  default_tts_voice text DEFAULT 'alloy',
  auto_disclosure boolean DEFAULT true,
  brand_persona text,
  tts_speed real DEFAULT 1.0,
  tts_pitch integer DEFAULT 0,
  progress_style text DEFAULT 'circular',
  mascot_enabled boolean DEFAULT true,
  mascot_style text DEFAULT 'cute-crawler',
  capture_guide_mode text DEFAULT 'beginner',
  ui_performance text DEFAULT 'high',
  theme_mode text DEFAULT 'dark',
  display_density text DEFAULT 'standard',
  app_language text,
  theme_preset text DEFAULT 'cinematic-dark',
  default_caption_tone text,
  fixed_hook_phrase text,
  affiliate_priority_mapping boolean NOT NULL DEFAULT false,
  auto_publish_reels boolean NOT NULL DEFAULT false,
  auto_publish_tiktok boolean NOT NULL DEFAULT false,
  auto_publish_shorts boolean NOT NULL DEFAULT false,
  auto_publish_sandbox_mode boolean NOT NULL DEFAULT true,
  clean_footage_enabled boolean DEFAULT false,
  pexels_api_key text,
  tts_api_key text,
  runway_api_key text
);

CREATE TABLE IF NOT EXISTS public.video_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  task_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  is_draft boolean NOT NULL DEFAULT false,
  video_url text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  hd_task_id text,
  hd_video_url text,
  hd_status text NOT NULL DEFAULT 'PENDING',
  hd_completed_at timestamptz,
  is_hd boolean NOT NULL DEFAULT false,
  step public.project_step NOT NULL DEFAULT 'idle',
  quality_tier text NOT NULL DEFAULT 'standard',
  resolution text NOT NULL DEFAULT '720p'
);

CREATE TABLE IF NOT EXISTS public.warmup_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  account_name text NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  duration_days integer NOT NULL DEFAULT 14,
  daily_post_target integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.warmup_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES public.warmup_schedules(id) ON DELETE CASCADE,
  day_number integer NOT NULL,
  scheduled_date date NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weather_alert_settings (
  id integer NOT NULL DEFAULT 1 PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  store_latitude double precision,
  store_longitude double precision,
  store_name text,
  rain_alert_enabled boolean NOT NULL DEFAULT true,
  cold_snap_threshold double precision NOT NULL DEFAULT 0.0,
  heat_wave_threshold double precision NOT NULL DEFAULT 35.0,
  last_weather_check timestamptz,
  last_alert_type text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weather_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  hook_phrase text,
  prompt_text text,
  temperature double precision,
  precipitation double precision,
  weather_code integer,
  is_read boolean NOT NULL DEFAULT false,
  is_acted_on boolean NOT NULL DEFAULT false,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  visitor_count integer NOT NULL DEFAULT 0,
  revenue_impact integer NOT NULL DEFAULT 0,
  shortform_created boolean NOT NULL DEFAULT false,
  result_note text
);

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL,
  message text NOT NULL,
  stack text,
  context jsonb,
  platform text,
  app_version text,
  device_info jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON public.ai_content_cache USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_key ON public.ai_content_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_cache_task_type ON public.ai_content_cache USING btree (task_type);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON public.scans USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_scan_id ON public.video_jobs USING btree (scan_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON public.render_jobs USING btree (status);

-- ============================================================
-- FUNCTIONS (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_credits(p_amount integer, p_type text, p_description text, p_package_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be a positive integer';
  END IF;
  SELECT balance INTO v_balance FROM credit_balance WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO credit_balance (id, balance) VALUES (1, 0);
    v_balance := 0;
  END IF;
  v_new_balance := v_balance + p_amount;
  UPDATE credit_balance SET balance = v_new_balance, total_purchased = total_purchased + p_amount, updated_at = now() WHERE id = 1;
  INSERT INTO credit_transactions (amount, balance_after, type, description, package_id)
  VALUES (p_amount, v_new_balance, p_type, p_description, p_package_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits(p_amount integer, p_feature text, p_description text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be a positive integer';
  END IF;
  SELECT balance INTO v_balance FROM credit_balance WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO credit_balance (id, balance) VALUES (1, 0);
    v_balance := 0;
  END IF;
  IF v_balance < p_amount THEN
    RETURN false;
  END IF;
  v_new_balance := v_balance - p_amount;
  UPDATE credit_balance SET balance = v_new_balance, total_consumed = total_consumed + p_amount, updated_at = now() WHERE id = 1;
  INSERT INTO credit_transactions (amount, balance_after, type, description, feature)
  VALUES (p_amount, v_new_balance, 'consumption', p_description, p_feature);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.dequeue_render_job(max_attempts integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  job_row record;
  result jsonb;
BEGIN
  SELECT id, job_type, payload, attempts INTO job_row
  FROM render_jobs
  WHERE status = 'queued' AND attempts < max_attempts
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE render_jobs
  SET status = 'processing', started_at = now()
  WHERE id = job_row.id AND status = 'queued';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  result := jsonb_build_object(
    'id', job_row.id,
    'job_type', job_row.job_type,
    'payload', job_row.payload,
    'attempts', job_row.attempts
  );
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_analysis_cache_hit(p_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE analysis_cache SET hit_count = hit_count + 1
  WHERE image_hash = p_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_click_count(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE short_links SET click_count = click_count + 1 WHERE slug = p_slug;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.affiliate_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_content_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_archetypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_tier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_autoscale_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_in_bio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warmup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warmup_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- All policies use the no-auth pattern (anon + authenticated, USING (true))
-- because this app uses the anon key client without a sign-in screen.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'affiliate_platforms','ai_content_cache','analysis_cache','content_archetypes',
    'creator_persona','creator_tier','credit_balance','credit_transactions',
    'custom_platforms','customer_reviews','daily_quests','gpu_autoscale_config',
    'gpu_worker_heartbeats','inventory_alert_settings','inventory_items',
    'leaderboard_entries','link_bookmarks','link_in_bio','marketing_snippets',
    'push_alerts','push_subscriptions','render_jobs','revenue_records',
    'saved_assets','scans','short_links','template_registry','upload_schedules',
    'user_settings','video_jobs','warmup_schedules','warmup_tasks',
    'weather_alert_settings','weather_alerts','error_logs','rate_limit_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS anon_select_%I ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_select_%I ON public.%I FOR SELECT TO anon, authenticated USING (true);', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS anon_insert_%I ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_insert_%I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true);', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS anon_update_%I ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_update_%I ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS anon_delete_%I ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_delete_%I ON public.%I FOR DELETE TO anon, authenticated USING (true);', tbl, tbl);
  END LOOP;
END;
$$;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('scans', 'scans', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT DO NOTHING;

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

DROP POLICY IF EXISTS scans_read_public ON storage.objects;
CREATE POLICY scans_read_public ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'scans');
DROP POLICY IF EXISTS scans_upload_all ON storage.objects;
CREATE POLICY scans_upload_all ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'scans');
DROP POLICY IF EXISTS scans_update_all ON storage.objects;
CREATE POLICY scans_update_all ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'scans') WITH CHECK (bucket_id = 'scans');
DROP POLICY IF EXISTS scans_delete_all ON storage.objects;
CREATE POLICY scans_delete_all ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'scans');

DROP POLICY IF EXISTS videos_read_public ON storage.objects;
CREATE POLICY videos_read_public ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'videos');
DROP POLICY IF EXISTS videos_upload_all ON storage.objects;
CREATE POLICY videos_upload_all ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'videos');
DROP POLICY IF EXISTS videos_update_all ON storage.objects;
CREATE POLICY videos_update_all ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');
DROP POLICY IF EXISTS videos_delete_all ON storage.objects;
CREATE POLICY videos_delete_all ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'videos');

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO public.user_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO public.credit_balance (id, balance) VALUES (1, 10) ON CONFLICT DO NOTHING;
INSERT INTO public.creator_tier (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO public.affiliate_platforms (key, label, color, is_builtin, sort_order) VALUES
  ('coupang', '쿠팡파트너스', '#FF3E3E', true, 1),
  ('naver', '네이버쇼핑', '#03C75A', true, 2),
  ('toss', '토스샵', '#0064FF', true, 3),
  ('amazon', '아마존어소시에이트', '#FF9900', true, 4),
  ('eleven', '11번가가', '#FF5120', true, 5)
ON CONFLICT DO NOTHING;