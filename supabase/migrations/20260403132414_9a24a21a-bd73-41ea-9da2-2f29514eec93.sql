CREATE POLICY "Teachers can create their bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND student_id IS NOT NULL
  AND scheduled_at IS NOT NULL
  AND duration_minutes > 0
  AND status = 'confirmed'
);