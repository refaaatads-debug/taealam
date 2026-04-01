
-- Teacher approval field
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;

-- Payment records table for Stripe
CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_session_id text,
  stripe_payment_intent text,
  amount numeric NOT NULL,
  currency text DEFAULT 'SAR',
  status text DEFAULT 'pending',
  payment_type text DEFAULT 'subscription',
  plan_id uuid REFERENCES public.subscription_plans(id),
  booking_id uuid REFERENCES public.bookings(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments" ON public.payment_records
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage payments" ON public.payment_records
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_payment_records_user_id ON public.payment_records(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_stripe_session ON public.payment_records(stripe_session_id);

DROP TRIGGER IF EXISTS trg_payment_records_updated ON public.payment_records;
CREATE TRIGGER trg_payment_records_updated
  BEFORE UPDATE ON public.payment_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
