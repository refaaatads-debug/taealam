-- Add teaching_stage column
ALTER TABLE public.booking_requests ADD COLUMN teaching_stage text DEFAULT NULL;

-- Drop old teacher view/update policies
DROP POLICY IF EXISTS "Teachers can view eligible requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Teachers can accept eligible requests" ON public.booking_requests;

-- Recreate teacher SELECT policy with stage filter
CREATE POLICY "Teachers can view eligible requests"
ON public.booking_requests
FOR SELECT
TO authenticated
USING (
  (
    (status = 'open') AND
    EXISTS (
      SELECT 1
      FROM teacher_profiles tp
      JOIN teacher_subjects ts ON ts.teacher_id = tp.id
      WHERE tp.user_id = auth.uid()
        AND tp.is_approved = true
        AND ts.subject_id = booking_requests.subject_id
        AND (
          booking_requests.teaching_stage IS NULL
          OR booking_requests.teaching_stage = ''
          OR booking_requests.teaching_stage = ANY(tp.teaching_stages)
        )
    )
  )
  OR (status = 'accepted' AND accepted_by = auth.uid())
);

-- Recreate teacher UPDATE policy with stage filter
CREATE POLICY "Teachers can accept eligible requests"
ON public.booking_requests
FOR UPDATE
TO authenticated
USING (
  status = 'open' AND
  EXISTS (
    SELECT 1
    FROM teacher_profiles tp
    JOIN teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = auth.uid()
      AND tp.is_approved = true
      AND ts.subject_id = booking_requests.subject_id
      AND (
        booking_requests.teaching_stage IS NULL
        OR booking_requests.teaching_stage = ''
        OR booking_requests.teaching_stage = ANY(tp.teaching_stages)
      )
  )
)
WITH CHECK (
  status = 'accepted' AND accepted_by = auth.uid() AND accepted_at IS NOT NULL
);