/*
# Create push_subscriptions table for Web Push notifications

## Purpose
Stores browser push subscription endpoints and encryption keys so the
`send-push` edge function can deliver Web Push notifications (e.g. when
a video finishes rendering).

## New Tables
- `push_subscriptions`
  - `id` (uuid, PK)
  - `user_id` (text, NOT NULL) — anonymous device ID or auth user ID
  - `endpoint` (text, NOT NULL, UNIQUE) — browser push endpoint URL
  - `keys` (jsonb, NOT NULL) — { p256dh, auth } encryption keys
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## Security
- RLS enabled.
- anon + authenticated CRUD (no-auth app: subscriptions are keyed by
  a locally-generated device ID stored in AsyncStorage, not by auth user).

## Indexes
- Unique constraint on (user_id, endpoint) for upsert support.
*/

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "anon_select_push_subscriptions" ON public.push_subscriptions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "anon_insert_push_subscriptions" ON public.push_subscriptions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "anon_update_push_subscriptions" ON public.push_subscriptions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "anon_delete_push_subscriptions" ON public.push_subscriptions
  FOR DELETE TO anon, authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_idx
  ON public.push_subscriptions (user_id, endpoint);
