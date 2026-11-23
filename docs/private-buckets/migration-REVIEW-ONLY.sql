-- REVIEW ONLY. Do not run before the web code change (step 2 of the rollout note) is live.
-- Makes chat-files and support-files private. session-recordings is already
-- private in migration history (20260419085438); this re-asserts it.
-- Certificates live inside support-files under certificates/<user_id>/...
BEGIN;

UPDATE storage.buckets SET public = false
WHERE id IN ('chat-files', 'support-files', 'session-recordings');

-- Teachers can read their own certificate and withdrawal-attachment files
-- (needed to create signed URLs for them; admins already have a read policy).
DROP POLICY IF EXISTS "Owners can read own support folder" ON storage.objects;
CREATE POLICY "Owners can read own support folder" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'support-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text                              -- <uid>/file (withdrawals)
    OR ((storage.foldername(name))[1] = 'certificates'
        AND (storage.foldername(name))[2] = auth.uid()::text)                     -- certificates/<uid>/file
    OR ((storage.foldername(name))[1] = 'ai-support'
        AND (storage.foldername(name))[2] = auth.uid()::text)                     -- ai-support/<uid>/file
  )
);

-- Chat files: replace the brittle "file_url LIKE %name%" read check with the
-- booking folder rule used by the upload policy (<booking_id>/<file>).
DROP POLICY IF EXISTS "Booking participants can read chat files" ON storage.objects;
CREATE POLICY "Booking participants can read chat files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-files'
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id::text = (storage.foldername(name))[1]
      AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
);
COMMIT;

-- Rollback (instant): UPDATE storage.buckets SET public = true WHERE id IN ('chat-files','support-files');
-- Verify: SELECT id, public FROM storage.buckets WHERE id IN ('chat-files','support-files','session-recordings');
-- Test with a logged-in teacher and student and an unauthenticated curl on an old public URL (should 400/404 after the change).
