-- 1) Make session-recordings bucket private
UPDATE storage.buckets SET public = false WHERE id = 'session-recordings';

-- Drop any existing permissive policies on session-recordings
DROP POLICY IF EXISTS "Authenticated users can read session recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public can read session recordings" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read session recordings" ON storage.objects;
DROP POLICY IF EXISTS "Session recordings public read" ON storage.objects;
DROP POLICY IF EXISTS "Participants can read session recordings" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage session recordings" ON storage.objects;
DROP POLICY IF EXISTS "Service role can write session recordings" ON storage.objects;

-- Participants (teacher/student of the booking encoded in the path) can read
-- Path convention used by the app: <booking_id>/<filename> OR contains booking_id as a folder
CREATE POLICY "Participants can read session recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE (b.id::text = (storage.foldername(name))[1])
      AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
);

CREATE POLICY "Admins can manage session recordings"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'session-recordings' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'session-recordings' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow participants to upload to their booking folder (used by client-side upload of recording)
CREATE POLICY "Participants can upload session recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'session-recordings'
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE (b.id::text = (storage.foldername(name))[1])
      AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
);

-- 2) Lock down student_points — remove client-side INSERT/UPDATE; only definer functions/triggers may change points
DROP POLICY IF EXISTS "Authenticated users can insert own points" ON public.student_points;
DROP POLICY IF EXISTS "Authenticated users can update own points" ON public.student_points;
-- Keep SELECT policy so users can still view their own points
