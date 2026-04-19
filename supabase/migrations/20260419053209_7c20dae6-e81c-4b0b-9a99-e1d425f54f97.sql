CREATE TABLE IF NOT EXISTS public.user_active_session (
  user_id UUID PRIMARY KEY,
  session_token TEXT NOT NULL,
  device_info TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_active_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own active session"
ON public.user_active_session FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own active session"
ON public.user_active_session FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own active session"
ON public.user_active_session FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own active session"
ON public.user_active_session FOR DELETE
USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_active_session;
ALTER TABLE public.user_active_session REPLICA IDENTITY FULL;