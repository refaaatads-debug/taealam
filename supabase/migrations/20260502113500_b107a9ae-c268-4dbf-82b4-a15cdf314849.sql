-- Allow admins to manage all user subscriptions (grant/revoke packages)
CREATE POLICY "Admins can manage all subscriptions"
ON public.user_subscriptions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));