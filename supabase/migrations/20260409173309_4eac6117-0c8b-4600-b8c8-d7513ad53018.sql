-- Allow teachers to view subscriptions of their students (for instant session checks)
CREATE POLICY "Teachers can view student subscriptions for bookings"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.teacher_id = auth.uid()
    AND bookings.student_id = user_subscriptions.user_id
  )
);