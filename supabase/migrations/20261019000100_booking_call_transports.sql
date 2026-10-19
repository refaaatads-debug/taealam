-- Pins a call provider to a booking once, so changing feature flags never
-- changes the transport of a session that has already started.
CREATE TABLE IF NOT EXISTS public.booking_call_transports (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('webrtc', 'agora')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_call_transports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_call_transports FROM anon, authenticated;
GRANT ALL ON public.booking_call_transports TO service_role;
