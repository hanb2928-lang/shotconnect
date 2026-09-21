-- Consolidated baseline schema (2026-09-16)
-- Replaces 76 fragmented incremental migrations with a single clean baseline.
-- Captures the full current state: tables, indexes, RLS policies, functions,
-- triggers, enums, storage buckets/policies, and grants.

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.project_step AS ENUM ('idle', 'uploading', 'rendering', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABLES
-- ============================================================

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
  product_vision jsonb
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

-- ============================================================
-- INDEXES (non-constraint)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON public.ai_content_cache USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_key ON public.ai_content_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_cache_task_type ON public.ai_content_cache USING btree (task_type);

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

CREATE OR REPLACE FUNCTION public.clean_stale_workers(p_timeout_sec integer DEFAULT 60)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM gpu_worker_heartbeats
  WHERE status = 'ACTIVE'
  AND last_heartbeat_at < now() - (p_timeout_sec || ' seconds')::interval
$$;

CREATE OR REPLACE FUNCTION public.count_active_workers(p_timeout_sec integer DEFAULT 60)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM gpu_worker_heartbeats
  WHERE status = 'ACTIVE'
  AND last_heartbeat_at > now() - (p_timeout_sec || ' seconds')::interval
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

CREATE OR REPLACE FUNCTION public.trigger_queue_processor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  project_url text;
  anon_key text;
BEGIN
  project_url := current_setting('app.project_url', true);
  anon_key := current_setting('app.anon_key', true);

  PERFORM net.http_post(
    url := project_url || '/functions/v1/process-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key
    ),
    body := jsonb_build_object('trigger', true, 'job_id', NEW.id, 'job_type', NEW.job_type)
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS on_render_job_insert ON public.render_jobs;
CREATE TRIGGER on_render_job_insert
  AFTER INSERT ON public.render_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_processor();

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

-- All policies use the no-auth pattern (anon + authenticated, USING (true))
-- because this app uses the anon key client without a sign-in screen.

DROP POLICY IF EXISTS anon_select_affiliate_platforms ON public.affiliate_platforms;
CREATE POLICY anon_select_affiliate_platforms ON public.affiliate_platforms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_affiliate_platforms ON public.affiliate_platforms;
CREATE POLICY anon_insert_affiliate_platforms ON public.affiliate_platforms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_affiliate_platforms ON public.affiliate_platforms;
CREATE POLICY anon_update_affiliate_platforms ON public.affiliate_platforms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_affiliate_platforms ON public.affiliate_platforms;
CREATE POLICY anon_delete_affiliate_platforms ON public.affiliate_platforms FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS ai_cache_select_all ON public.ai_content_cache;
CREATE POLICY ai_cache_select_all ON public.ai_content_cache FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ai_cache_insert_all ON public.ai_content_cache;
CREATE POLICY ai_cache_insert_all ON public.ai_content_cache FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS ai_cache_update_all ON public.ai_content_cache;
CREATE POLICY ai_cache_update_all ON public.ai_content_cache FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ai_cache_delete_all ON public.ai_content_cache;
CREATE POLICY ai_cache_delete_all ON public.ai_content_cache FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_analysis_cache ON public.analysis_cache;
CREATE POLICY anon_select_analysis_cache ON public.analysis_cache FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_analysis_cache ON public.analysis_cache;
CREATE POLICY anon_insert_analysis_cache ON public.analysis_cache FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_analysis_cache ON public.analysis_cache;
CREATE POLICY anon_update_analysis_cache ON public.analysis_cache FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_analysis_cache ON public.analysis_cache;
CREATE POLICY anon_delete_analysis_cache ON public.analysis_cache FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_content_archetypes ON public.content_archetypes;
CREATE POLICY anon_select_content_archetypes ON public.content_archetypes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_content_archetypes ON public.content_archetypes;
CREATE POLICY anon_insert_content_archetypes ON public.content_archetypes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_content_archetypes ON public.content_archetypes;
CREATE POLICY anon_update_content_archetypes ON public.content_archetypes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_content_archetypes ON public.content_archetypes;
CREATE POLICY anon_delete_content_archetypes ON public.content_archetypes FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_creator_persona ON public.creator_persona;
CREATE POLICY anon_select_creator_persona ON public.creator_persona FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_creator_persona ON public.creator_persona;
CREATE POLICY anon_insert_creator_persona ON public.creator_persona FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_creator_persona ON public.creator_persona;
CREATE POLICY anon_update_creator_persona ON public.creator_persona FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_creator_persona ON public.creator_persona;
CREATE POLICY anon_delete_creator_persona ON public.creator_persona FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_creator_tier ON public.creator_tier;
CREATE POLICY anon_select_creator_tier ON public.creator_tier FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_creator_tier ON public.creator_tier;
CREATE POLICY anon_insert_creator_tier ON public.creator_tier FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_creator_tier ON public.creator_tier;
CREATE POLICY anon_update_creator_tier ON public.creator_tier FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_creator_tier ON public.creator_tier;
CREATE POLICY anon_delete_creator_tier ON public.creator_tier FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_credit_balance ON public.credit_balance;
CREATE POLICY anon_select_credit_balance ON public.credit_balance FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_credit_balance ON public.credit_balance;
CREATE POLICY anon_insert_credit_balance ON public.credit_balance FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_credit_balance ON public.credit_balance;
CREATE POLICY anon_update_credit_balance ON public.credit_balance FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_credit_balance ON public.credit_balance;
CREATE POLICY anon_delete_credit_balance ON public.credit_balance FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_credit_transactions ON public.credit_transactions;
CREATE POLICY anon_select_credit_transactions ON public.credit_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_credit_transactions ON public.credit_transactions;
CREATE POLICY anon_insert_credit_transactions ON public.credit_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_credit_transactions ON public.credit_transactions;
CREATE POLICY anon_update_credit_transactions ON public.credit_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_credit_transactions ON public.credit_transactions;
CREATE POLICY anon_delete_credit_transactions ON public.credit_transactions FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_custom_platforms ON public.custom_platforms;
CREATE POLICY anon_select_custom_platforms ON public.custom_platforms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_custom_platforms ON public.custom_platforms;
CREATE POLICY anon_insert_custom_platforms ON public.custom_platforms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_custom_platforms ON public.custom_platforms;
CREATE POLICY anon_update_custom_platforms ON public.custom_platforms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_custom_platforms ON public.custom_platforms;
CREATE POLICY anon_delete_custom_platforms ON public.custom_platforms FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_customer_reviews ON public.customer_reviews;
CREATE POLICY anon_select_customer_reviews ON public.customer_reviews FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_customer_reviews ON public.customer_reviews;
CREATE POLICY anon_insert_customer_reviews ON public.customer_reviews FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_customer_reviews ON public.customer_reviews;
CREATE POLICY anon_update_customer_reviews ON public.customer_reviews FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_customer_reviews ON public.customer_reviews;
CREATE POLICY anon_delete_customer_reviews ON public.customer_reviews FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_daily_quests ON public.daily_quests;
CREATE POLICY anon_select_daily_quests ON public.daily_quests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_daily_quests ON public.daily_quests;
CREATE POLICY anon_insert_daily_quests ON public.daily_quests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_daily_quests ON public.daily_quests;
CREATE POLICY anon_update_daily_quests ON public.daily_quests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_daily_quests ON public.daily_quests;
CREATE POLICY anon_delete_daily_quests ON public.daily_quests FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_gpu_autoscale_config ON public.gpu_autoscale_config;
CREATE POLICY anon_select_gpu_autoscale_config ON public.gpu_autoscale_config FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_gpu_autoscale_config ON public.gpu_autoscale_config;
CREATE POLICY anon_insert_gpu_autoscale_config ON public.gpu_autoscale_config FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_gpu_autoscale_config ON public.gpu_autoscale_config;
CREATE POLICY anon_update_gpu_autoscale_config ON public.gpu_autoscale_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_gpu_autoscale_config ON public.gpu_autoscale_config;
CREATE POLICY anon_delete_gpu_autoscale_config ON public.gpu_autoscale_config FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_gpu_worker_heartbeats ON public.gpu_worker_heartbeats;
CREATE POLICY anon_select_gpu_worker_heartbeats ON public.gpu_worker_heartbeats FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_gpu_worker_heartbeats ON public.gpu_worker_heartbeats;
CREATE POLICY anon_insert_gpu_worker_heartbeats ON public.gpu_worker_heartbeats FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_gpu_worker_heartbeats ON public.gpu_worker_heartbeats;
CREATE POLICY anon_update_gpu_worker_heartbeats ON public.gpu_worker_heartbeats FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_gpu_worker_heartbeats ON public.gpu_worker_heartbeats;
CREATE POLICY anon_delete_gpu_worker_heartbeats ON public.gpu_worker_heartbeats FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_inventory_alert_settings ON public.inventory_alert_settings;
CREATE POLICY anon_select_inventory_alert_settings ON public.inventory_alert_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_inventory_alert_settings ON public.inventory_alert_settings;
CREATE POLICY anon_insert_inventory_alert_settings ON public.inventory_alert_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_inventory_alert_settings ON public.inventory_alert_settings;
CREATE POLICY anon_update_inventory_alert_settings ON public.inventory_alert_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_inventory_alert_settings ON public.inventory_alert_settings;
CREATE POLICY anon_delete_inventory_alert_settings ON public.inventory_alert_settings FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_inventory_items ON public.inventory_items;
CREATE POLICY anon_select_inventory_items ON public.inventory_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_inventory_items ON public.inventory_items;
CREATE POLICY anon_insert_inventory_items ON public.inventory_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_inventory_items ON public.inventory_items;
CREATE POLICY anon_update_inventory_items ON public.inventory_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_inventory_items ON public.inventory_items;
CREATE POLICY anon_delete_inventory_items ON public.inventory_items FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_leaderboard_entries ON public.leaderboard_entries;
CREATE POLICY anon_select_leaderboard_entries ON public.leaderboard_entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_leaderboard_entries ON public.leaderboard_entries;
CREATE POLICY anon_insert_leaderboard_entries ON public.leaderboard_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_leaderboard_entries ON public.leaderboard_entries;
CREATE POLICY anon_update_leaderboard_entries ON public.leaderboard_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_leaderboard_entries ON public.leaderboard_entries;
CREATE POLICY anon_delete_leaderboard_entries ON public.leaderboard_entries FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_link_bookmarks ON public.link_bookmarks;
CREATE POLICY anon_select_link_bookmarks ON public.link_bookmarks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_link_bookmarks ON public.link_bookmarks;
CREATE POLICY anon_insert_link_bookmarks ON public.link_bookmarks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_link_bookmarks ON public.link_bookmarks;
CREATE POLICY anon_update_link_bookmarks ON public.link_bookmarks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_link_bookmarks ON public.link_bookmarks;
CREATE POLICY anon_delete_link_bookmarks ON public.link_bookmarks FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_link_in_bio ON public.link_in_bio;
CREATE POLICY anon_select_link_in_bio ON public.link_in_bio FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_link_in_bio ON public.link_in_bio;
CREATE POLICY anon_insert_link_in_bio ON public.link_in_bio FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_link_in_bio ON public.link_in_bio;
CREATE POLICY anon_update_link_in_bio ON public.link_in_bio FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_link_in_bio ON public.link_in_bio;
CREATE POLICY anon_delete_link_in_bio ON public.link_in_bio FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_marketing_snippets ON public.marketing_snippets;
CREATE POLICY anon_select_marketing_snippets ON public.marketing_snippets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_marketing_snippets ON public.marketing_snippets;
CREATE POLICY anon_insert_marketing_snippets ON public.marketing_snippets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_marketing_snippets ON public.marketing_snippets;
CREATE POLICY anon_update_marketing_snippets ON public.marketing_snippets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_marketing_snippets ON public.marketing_snippets;
CREATE POLICY anon_delete_marketing_snippets ON public.marketing_snippets FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_push_alerts ON public.push_alerts;
CREATE POLICY anon_select_push_alerts ON public.push_alerts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_push_alerts ON public.push_alerts;
CREATE POLICY anon_insert_push_alerts ON public.push_alerts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_push_alerts ON public.push_alerts;
CREATE POLICY anon_update_push_alerts ON public.push_alerts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_push_alerts ON public.push_alerts;
CREATE POLICY anon_delete_push_alerts ON public.push_alerts FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_push_subscriptions ON public.push_subscriptions;
CREATE POLICY anon_select_push_subscriptions ON public.push_subscriptions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_push_subscriptions ON public.push_subscriptions;
CREATE POLICY anon_insert_push_subscriptions ON public.push_subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_push_subscriptions ON public.push_subscriptions;
CREATE POLICY anon_update_push_subscriptions ON public.push_subscriptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_push_subscriptions ON public.push_subscriptions;
CREATE POLICY anon_delete_push_subscriptions ON public.push_subscriptions FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_render_jobs ON public.render_jobs;
CREATE POLICY anon_select_render_jobs ON public.render_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_render_jobs ON public.render_jobs;
CREATE POLICY anon_insert_render_jobs ON public.render_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_render_jobs ON public.render_jobs;
CREATE POLICY anon_update_render_jobs ON public.render_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_render_jobs ON public.render_jobs;
CREATE POLICY anon_delete_render_jobs ON public.render_jobs FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_revenue_records ON public.revenue_records;
CREATE POLICY anon_select_revenue_records ON public.revenue_records FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_revenue_records ON public.revenue_records;
CREATE POLICY anon_insert_revenue_records ON public.revenue_records FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_revenue_records ON public.revenue_records;
CREATE POLICY anon_update_revenue_records ON public.revenue_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_revenue_records ON public.revenue_records;
CREATE POLICY anon_delete_revenue_records ON public.revenue_records FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_saved_assets ON public.saved_assets;
CREATE POLICY anon_select_saved_assets ON public.saved_assets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_saved_assets ON public.saved_assets;
CREATE POLICY anon_insert_saved_assets ON public.saved_assets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_saved_assets ON public.saved_assets;
CREATE POLICY anon_update_saved_assets ON public.saved_assets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_saved_assets ON public.saved_assets;
CREATE POLICY anon_delete_saved_assets ON public.saved_assets FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_scans ON public.scans;
CREATE POLICY anon_select_scans ON public.scans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_scans ON public.scans;
CREATE POLICY anon_insert_scans ON public.scans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_scans ON public.scans;
CREATE POLICY anon_update_scans ON public.scans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_scans ON public.scans;
CREATE POLICY anon_delete_scans ON public.scans FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_short_links ON public.short_links;
CREATE POLICY anon_select_short_links ON public.short_links FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_short_links ON public.short_links;
CREATE POLICY anon_insert_short_links ON public.short_links FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_short_links ON public.short_links;
CREATE POLICY anon_update_short_links ON public.short_links FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_short_links ON public.short_links;
CREATE POLICY anon_delete_short_links ON public.short_links FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_template_registry ON public.template_registry;
CREATE POLICY anon_select_template_registry ON public.template_registry FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_template_registry ON public.template_registry;
CREATE POLICY anon_insert_template_registry ON public.template_registry FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_template_registry ON public.template_registry;
CREATE POLICY anon_update_template_registry ON public.template_registry FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_template_registry ON public.template_registry;
CREATE POLICY anon_delete_template_registry ON public.template_registry FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_upload_schedules ON public.upload_schedules;
CREATE POLICY anon_select_upload_schedules ON public.upload_schedules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_upload_schedules ON public.upload_schedules;
CREATE POLICY anon_insert_upload_schedules ON public.upload_schedules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_upload_schedules ON public.upload_schedules;
CREATE POLICY anon_update_upload_schedules ON public.upload_schedules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_upload_schedules ON public.upload_schedules;
CREATE POLICY anon_delete_upload_schedules ON public.upload_schedules FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_user_settings ON public.user_settings;
CREATE POLICY anon_select_user_settings ON public.user_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_user_settings ON public.user_settings;
CREATE POLICY anon_insert_user_settings ON public.user_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_user_settings ON public.user_settings;
CREATE POLICY anon_update_user_settings ON public.user_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_user_settings ON public.user_settings;
CREATE POLICY anon_delete_user_settings ON public.user_settings FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_video_jobs ON public.video_jobs;
CREATE POLICY anon_select_video_jobs ON public.video_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_video_jobs ON public.video_jobs;
CREATE POLICY anon_insert_video_jobs ON public.video_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_video_jobs ON public.video_jobs;
CREATE POLICY anon_update_video_jobs ON public.video_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_video_jobs ON public.video_jobs;
CREATE POLICY anon_delete_video_jobs ON public.video_jobs FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_warmup_schedules ON public.warmup_schedules;
CREATE POLICY anon_select_warmup_schedules ON public.warmup_schedules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_warmup_schedules ON public.warmup_schedules;
CREATE POLICY anon_insert_warmup_schedules ON public.warmup_schedules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_warmup_schedules ON public.warmup_schedules;
CREATE POLICY anon_update_warmup_schedules ON public.warmup_schedules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_warmup_schedules ON public.warmup_schedules;
CREATE POLICY anon_delete_warmup_schedules ON public.warmup_schedules FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_warmup_tasks ON public.warmup_tasks;
CREATE POLICY anon_select_warmup_tasks ON public.warmup_tasks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_warmup_tasks ON public.warmup_tasks;
CREATE POLICY anon_insert_warmup_tasks ON public.warmup_tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_warmup_tasks ON public.warmup_tasks;
CREATE POLICY anon_update_warmup_tasks ON public.warmup_tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_warmup_tasks ON public.warmup_tasks;
CREATE POLICY anon_delete_warmup_tasks ON public.warmup_tasks FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_weather_alert_settings ON public.weather_alert_settings;
CREATE POLICY anon_select_weather_alert_settings ON public.weather_alert_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_weather_alert_settings ON public.weather_alert_settings;
CREATE POLICY anon_insert_weather_alert_settings ON public.weather_alert_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_weather_alert_settings ON public.weather_alert_settings;
CREATE POLICY anon_update_weather_alert_settings ON public.weather_alert_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_weather_alert_settings ON public.weather_alert_settings;
CREATE POLICY anon_delete_weather_alert_settings ON public.weather_alert_settings FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_select_weather_alerts ON public.weather_alerts;
CREATE POLICY anon_select_weather_alerts ON public.weather_alerts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_weather_alerts ON public.weather_alerts;
CREATE POLICY anon_insert_weather_alerts ON public.weather_alerts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_weather_alerts ON public.weather_alerts;
CREATE POLICY anon_update_weather_alerts ON public.weather_alerts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_weather_alerts ON public.weather_alerts;
CREATE POLICY anon_delete_weather_alerts ON public.weather_alerts FOR DELETE TO anon, authenticated USING (true);

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
