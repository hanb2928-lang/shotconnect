/*
# Security Audit Fixes

## Changes
1. Fix check_rate_limit TOCTOU race (M3 — concurrent submits could exceed daily limit; replace SELECT-then-INSERT with atomic UPSERT)
2. Fix mutable search_path on SECURITY DEFINER functions (advisor warnings)
3. Revoke EXECUTE on deduct_credits/add_credits from anon to prevent direct client manipulation (S5)

## Security
- check_rate_limit: atomic UPSERT eliminates race window
- deduct_credits/add_credits: revoked from anon, only callable via service role in edge functions
- Functions: set search_path = public to prevent path injection
*/

-- M3: Fix check_rate_limit TOCTOU race with atomic UPSERT
DROP FUNCTION IF EXISTS public.check_rate_limit(text);
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_client_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date date := CURRENT_DATE;
  current_count int;
BEGIN
  INSERT INTO rate_limit_log (client_ip, request_date, request_count)
  VALUES (p_client_ip, today_date, 1)
  ON CONFLICT (client_ip, request_date)
  DO UPDATE SET request_count = rate_limit_log.request_count + 1
  RETURNING request_count INTO current_count;

  RETURN current_count <= 10;
END;
$$;

-- S5: Revoke direct anon access to credit functions
REVOKE EXECUTE ON FUNCTION public.deduct_credits(integer, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_credits(integer, text, text, text) FROM anon, authenticated;

-- Fix mutable search_path on SECURITY DEFINER functions
ALTER FUNCTION public.increment_cache_hit_count(text) SET search_path = public;
ALTER FUNCTION public.increment_analysis_cache_hit(text) SET search_path = public;
ALTER FUNCTION public.increment_analysis_cache_hit(text, text) SET search_path = public;
ALTER FUNCTION public.touch_storage_object(uuid, text, text, text, bigint) SET search_path = public;
ALTER FUNCTION public.add_credits(integer, text, text, text) SET search_path = public;
ALTER FUNCTION public.deduct_credits(integer, text, text) SET search_path = public;