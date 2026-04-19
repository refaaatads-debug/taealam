-- Relax INSERT/UPDATE policies on session-recordings so that any authenticated participant
-- of the booking can upload recordings. The path may be either {bookingId}/... or {userId}/...
-- We add a permissive policy that checks booking participation via filename match.

DROP POLICY IF EXISTS "Participants can upload session recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own session recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own session recordings" ON storage.objects;

CREATE POLICY "Participants can upload session recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'session-recordings'
  AND (
    -- Path structure: {userId}/{bookingId}_{timestamp}.webm  OR  {bookingId}/{userId}_{timestamp}.webm
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
    )
  )
);

CREATE POLICY "Participants can update session recordings"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
    )
  )
)
WITH CHECK (
  bucket_id = 'session-recordings'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
    )
  )
);