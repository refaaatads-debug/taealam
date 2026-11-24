
CREATE TABLE public.violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  violation_type text NOT NULL DEFAULT 'contact_sharing',
  detected_text text NOT NULL,
  original_message text,
  confidence_score numeric DEFAULT 0,
  source text NOT NULL DEFAULT 'chat',
  timestamp_in_session integer,
  is_reviewed boolean DEFAULT false,
  reviewed_by uuid,
  review_notes text,
  is_false_positive boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage violations" ON public.violations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own violations" ON public.violations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_violations_user_id ON public.violations(user_id);
CREATE INDEX idx_violations_booking_id ON public.violations(booking_id);
CREATE INDEX idx_violations_created_at ON public.violations(created_at DESC);
