DROP POLICY IF EXISTS "Teachers can accept open requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Teachers can view open requests" ON public.booking_requests;

CREATE POLICY "Teachers can view eligible requests"
ON public.booking_requests
FOR SELECT
TO authenticated
USING (
  (
    status = 'open'
    AND EXISTS (
      SELECT 1
      FROM public.teacher_profiles tp
      JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
      WHERE tp.user_id = auth.uid()
        AND tp.is_approved = true
        AND ts.subject_id = booking_requests.subject_id
    )
  )
  OR (
    status = 'accepted'
    AND accepted_by = auth.uid()
  )
);

CREATE POLICY "Teachers can accept eligible requests"
ON public.booking_requests
FOR UPDATE
TO authenticated
USING (
  status = 'open'
  AND EXISTS (
    SELECT 1
    FROM public.teacher_profiles tp
    JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = auth.uid()
      AND tp.is_approved = true
      AND ts.subject_id = booking_requests.subject_id
  )
)
WITH CHECK (
  status = 'accepted'
  AND accepted_by = auth.uid()
  AND accepted_at IS NOT NULL
);