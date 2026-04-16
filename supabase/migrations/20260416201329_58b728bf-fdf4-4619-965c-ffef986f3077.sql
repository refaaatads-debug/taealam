ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
ALTER TABLE public.call_logs REPLICA IDENTITY FULL;