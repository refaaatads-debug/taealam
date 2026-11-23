CREATE POLICY "Authenticated users can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Also add insert policy for system_logs so edge functions can log
CREATE POLICY "Service can insert logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);