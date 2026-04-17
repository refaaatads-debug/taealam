-- Relax INSERT/UPDATE policies on session-recordings: allow any participant regardless of booking status
DROP POLICY IF EXISTS "Session participants can upload recordings" ON storage.objects;
DROP POLICY IF EXISTS "Session participants can update recordings" ON storage.objects;

CREATE POLICY "Session participants can upload recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'session-recordings'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = auth.uid() OR b.teacher_id = auth.uid()
  )
);

CREATE POLICY "Session participants can update recordings"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = auth.uid() OR b.teacher_id = auth.uid()
  )
);