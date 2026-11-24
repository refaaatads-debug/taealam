-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Students can update own requests" ON public.booking_requests;

-- Recreate with proper WITH CHECK that allows cancellation
CREATE POLICY "Students can update own requests"
ON public.booking_requests
FOR UPDATE
TO public
USING (auth.uid() = student_id AND status = 'open')
WITH CHECK (auth.uid() = student_id AND status IN ('open', 'cancelled'));