-- PREVIEW, NOT APPLIED. Profile photos: a small public bucket, own-folder writes only.
-- Each user writes only to avatars/<their user id>/... The client sends a small WebP (about 512 px).
-- Rollback (run in this order):
--   DROP POLICY IF EXISTS "Avatars are readable" ON storage.objects;
--   DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
--   DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
--   DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
--   DELETE FROM storage.objects WHERE bucket_id = 'avatars';  -- only if any photo exists
--   DELETE FROM storage.buckets WHERE id = 'avatars';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 307200, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars are readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- No change to public_profiles (decision: profile photos are visible to other platform users, as avatar_url is today).
-- Note: the bucket is public-read, so anyone who has the exact image link can open it.
