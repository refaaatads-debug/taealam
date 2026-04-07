-- Active sessions tracking table
CREATE TABLE public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  device_id text NOT NULL,
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  is_connected boolean NOT NULL DEFAULT true,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, booking_id)
);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own active sessions" ON public.active_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all active sessions" ON public.active_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Session events log table
CREATE TABLE public.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid,
  event_type text NOT NULL DEFAULT 'login',
  device_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events" ON public.session_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own events" ON public.session_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all events" ON public.session_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for fast heartbeat checks
CREATE INDEX idx_active_sessions_heartbeat ON public.active_sessions (user_id, booking_id, is_connected);
CREATE INDEX idx_session_events_user ON public.session_events (user_id, created_at DESC);