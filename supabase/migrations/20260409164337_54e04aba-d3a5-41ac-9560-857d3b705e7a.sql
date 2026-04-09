CREATE POLICY "Admins can view all sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));