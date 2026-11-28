-- PREVIEW, NOT APPLIED. Profile photos: a small public bucket, own-folder writes only.
-- Each user writes only to avatars/<their user id>/... The client sends a small WebP (about 512 px).
-- Rollback (run in this order):
--   DROP POLICY IF EXISTS "Avatars are readable" ON storage.objects;
--   DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
--   DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
--   DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
--   DELETE FROM storage.objects WHERE bucket_id = 'avatars';  -- only if any photo exists
--   DELETE FROM storage.buckets WHERE id = 'avatars';
--   (and restore the previous public_profiles definition, see section 2 below)

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

-- 2. Student photos must not be public. The view public_profiles is readable by anon and authenticated
-- and exposes avatar_url for every user. Show avatar_url there only for teachers.
-- Previous definition: SELECT id, user_id, full_name, avatar_url, level, created_at, updated_at FROM public.profiles
-- (existing screens read only user_id and full_name from this view; admin screens read profiles directly).
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT p.id,
       p.user_id,
       p.full_name,
       CASE WHEN public.has_role(p.user_id, 'teacher'::public.app_role) THEN p.avatar_url ELSE NULL END AS avatar_url,
       p.level,
       p.created_at,
       p.updated_at
FROM public.profiles p;
