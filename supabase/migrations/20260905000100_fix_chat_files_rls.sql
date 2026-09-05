-- Fix: voice notes and file attachments fail with:
-- "new row violates row-level security policy"
--
-- Chat.tsx uploads objects using:
--   <booking_id>/<generated_file_name>
--
-- This policy validates the first path segment against the actual booking
-- and permits only that booking's student or teacher to upload.
--
-- This migration intentionally does not change the bucket visibility or
-- existing file_url format. It is a minimal compatibility fix.

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can upload chat files"
  ON storage.objects;

DROP POLICY IF EXISTS "Booking participants can upload chat files"
  ON storage.objects;

CREATE POLICY "Booking participants can upload chat files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-files'
  AND EXISTS (
    SELECT 1
    FROM public.bookings AS b
    WHERE b.id::text = (storage.foldername(name))[1]
      AND (
        b.student_id = auth.uid()
        OR b.teacher_id = auth.uid()
      )
  )
);

COMMIT;

-- Verification query (run as an administrator after applying):
--
-- SELECT policyname, cmd, roles, with_check
-- FROM pg_policies
-- WHERE schemaname = 'storage'
--   AND tablename = 'objects'
--   AND policyname = 'Booking participants can upload chat files';