
DROP POLICY IF EXISTS "System inserts warnings" ON public.user_warnings;

CREATE POLICY "Users insert own warnings"
  ON public.user_warnings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
