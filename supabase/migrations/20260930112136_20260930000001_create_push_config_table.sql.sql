/*
# Create push_config table for VAPID key storage

## Purpose
Stores VAPID public and private keys for Web Push encryption.
The edge function reads these using the service role key (bypasses RLS).
The anon client can only read the public key (needed for browser subscription).

## New Tables
- `push_config`
  - `key` (text, PK) — config key name
  - `value` (text, NOT NULL) — config value
  - `created_at` (timestamptz)

## Security
- RLS enabled.
- anon + authenticated SELECT only for 'vapid_public_key' and 'vapid_subject'.
- Service role bypasses RLS entirely (used by edge functions).
- No INSERT/UPDATE/DELETE for anon or authenticated — keys are managed via migrations only.

## Data
- Inserts VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT rows.
*/

CREATE TABLE IF NOT EXISTS public.push_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_public_vapid_key" ON public.push_config;
CREATE POLICY "anon_select_public_vapid_key" ON public.push_config
  FOR SELECT TO anon, authenticated
  USING (key IN ('vapid_public_key', 'vapid_subject'));

INSERT INTO public.push_config (key, value) VALUES
  ('vapid_public_key', 'BFW3j0NsLMRs_dChlzaXmQol-6j4KQJxguAlXZAbyk_XUgnqK3K6OEevYKiB62d98xsz13RJ-l1beW-Hzy_j5Lk'),
  ('vapid_private_key', 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg888RPaARuBpIoFXCs8jDz2-csDLLk5zXTdp6Xzhp--GhRANCAARVt49DbCzEbP3QoZc2l5kKJfuo-CkCcYLgJV2QG8pP11IJ6ityujhHr2CogetnffMbM9d0SfpdW3lvh88v4-S5'),
  ('vapid_subject', 'mailto:admin@shotconnect.app')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
