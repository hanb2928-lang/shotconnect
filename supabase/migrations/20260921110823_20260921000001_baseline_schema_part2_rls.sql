-- Baseline schema Part 2: functions, triggers, RLS, policies, storage, grants

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

DROP TRIGGER IF EXISTS on_render_job_insert ON public.render_jobs;
CREATE TRIGGER on_render_job_insert
  AFTER INSERT ON public.render_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_processor();

-- RLS enable on all tables
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

-- No-auth pattern: anon + authenticated, USING (true) for all tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'affiliate_platforms','ai_content_cache','analysis_cache','content_archetypes',
      'creator_persona','creator_tier','credit_balance','credit_transactions',
      'custom_platforms','customer_reviews','daily_quests','gpu_autoscale_config',
      'gpu_worker_heartbeats','inventory_alert_settings','inventory_items',
      'leaderboard_entries','link_bookmarks','link_in_bio','marketing_snippets',
      'push_alerts','push_subscriptions','render_jobs','revenue_records',
      'saved_assets','scans','short_links','template_registry','upload_schedules',
      'user_settings','video_jobs','warmup_schedules','warmup_tasks',
      'weather_alert_settings','weather_alerts'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS anon_select_%I ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_select_%I ON public.%I FOR SELECT TO anon, authenticated USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS anon_insert_%I ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_insert_%I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS anon_update_%I ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_update_%I ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS anon_delete_%I ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY anon_delete_%I ON public.%I FOR DELETE TO anon, authenticated USING (true)', tbl, tbl);
  END LOOP;
END;
$$;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('scans', 'scans', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT DO NOTHING;

-- Storage policies
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

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
