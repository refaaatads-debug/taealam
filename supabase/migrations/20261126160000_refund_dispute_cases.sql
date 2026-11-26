-- Refund / dispute case log. Admin-only record keeping. Does NOT move money.
-- Rollback: supabase/rollbacks_20261126160000_refund_dispute_cases.sql
CREATE TABLE IF NOT EXISTS public.refund_dispute_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type text NOT NULL CHECK (case_type IN ('refund', 'dispute')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'approved', 'rejected', 'closed')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_record_id uuid REFERENCES public.payment_records(id) ON DELETE SET NULL,
  booking_id uuid,
  amount numeric(12,2) CHECK (amount IS NULL OR amount >= 0),
  currency text NOT NULL DEFAULT 'SAR',
  reason text,
  admin_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refund_dispute_cases_status ON public.refund_dispute_cases (status, created_at DESC);
ALTER TABLE public.refund_dispute_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage refund cases" ON public.refund_dispute_cases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE ALL ON public.refund_dispute_cases FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_dispute_cases TO authenticated;
