
DROP POLICY "Teachers can accept open requests" ON public.booking_requests;

CREATE POLICY "Teachers can accept open requests"
ON public.booking_requests
FOR UPDATE
TO public
USING (
  (status = 'open') AND 
  (EXISTS (
    SELECT 1 FROM teacher_profiles tp
    JOIN teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = auth.uid() AND tp.is_approved = true AND ts.subject_id = booking_requests.subject_id
  ))
)
WITH CHECK (
  status IN ('open', 'accepted')
);
