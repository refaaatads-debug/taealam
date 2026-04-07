
-- Create signaling table for WebRTC
CREATE TABLE public.webrtc_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  signal_type text NOT NULL, -- 'offer', 'answer', 'ice-candidate', 'join', 'leave'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Participants can read signals for their bookings
CREATE POLICY "Participants can view signals"
ON public.webrtc_signals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = webrtc_signals.booking_id
    AND (bookings.student_id = auth.uid() OR bookings.teacher_id = auth.uid())
  )
);

-- Participants can insert signals for their bookings
CREATE POLICY "Participants can send signals"
ON public.webrtc_signals FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = webrtc_signals.booking_id
    AND (bookings.student_id = auth.uid() OR bookings.teacher_id = auth.uid())
  )
);

-- Auto-cleanup old signals (older than 1 hour)
CREATE POLICY "Participants can delete own signals"
ON public.webrtc_signals FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = webrtc_signals.booking_id
    AND (bookings.student_id = auth.uid() OR bookings.teacher_id = auth.uid())
  )
);

-- Index for fast lookups
CREATE INDEX idx_webrtc_signals_booking ON public.webrtc_signals(booking_id, created_at);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_signals;
