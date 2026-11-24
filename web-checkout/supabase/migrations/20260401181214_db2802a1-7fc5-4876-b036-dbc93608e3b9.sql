-- Allow admins full management of teacher_profiles
CREATE POLICY "Admins can manage teacher profiles"
ON public.teacher_profiles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
