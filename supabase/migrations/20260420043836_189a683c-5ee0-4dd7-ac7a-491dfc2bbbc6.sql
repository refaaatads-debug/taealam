-- Allow participants to read their own session-recordings whether the path starts with their user id
-- OR with the booking id (both layouts coexist).
DROP POLICY IF EXISTS "Participants can read session recordings" ON storage.objects;

CREATE POLICY "Participants can read session recordings"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE (b.id)::text = (storage.foldername(objects.name))[1]
        AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
    )
    OR EXISTS (
      -- userId-based path: any booking where this user is the uploader and the other party is participant
      SELECT 1 FROM public.bookings b
      WHERE (storage.foldername(objects.name))[1] = (b.teacher_id)::text
        AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE (storage.foldername(objects.name))[1] = (b.student_id)::text
        AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
    )
  )
);