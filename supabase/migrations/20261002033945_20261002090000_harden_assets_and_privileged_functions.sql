/*
# Restore asset uploads and restrict privileged functions

1. Storage
- Create the public `assets` bucket used by saved image and video uploads.
- Add explicit public shared CRUD policies for that bucket, matching the app's current no-sign-in design.

2. Security
- Revoke anonymous and authenticated direct execution of `add_credits`, `deduct_credits`, and `dequeue_render_job`.
- These functions mutate credit balances or claim render work and must not be callable directly from an untrusted client.

3. Data safety
- This migration is additive and does not delete or rename existing data.
- All statements are idempotent so a retry is safe.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "assets_public_read" ON storage.objects;
CREATE POLICY "assets_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "assets_public_insert" ON storage.objects;
CREATE POLICY "assets_public_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'assets');

DROP POLICY IF EXISTS "assets_public_update" ON storage.objects;
CREATE POLICY "assets_public_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'assets')
WITH CHECK (bucket_id = 'assets');

DROP POLICY IF EXISTS "assets_public_delete" ON storage.objects;
CREATE POLICY "assets_public_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'assets');

REVOKE EXECUTE ON FUNCTION public.add_credits(integer, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(integer, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dequeue_render_job(integer) FROM anon, authenticated;