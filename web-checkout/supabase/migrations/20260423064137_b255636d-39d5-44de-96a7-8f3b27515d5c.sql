
-- Add cancellation tracking to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- Add group_id to booking_requests so multi-slot requests stay grouped
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS group_id uuid;

CREATE INDEX IF NOT EXISTS idx_booking_requests_group_id ON public.booking_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_by_month ON public.bookings(cancelled_by, cancelled_at);

-- Ensure user_warnings table exists (used by warnings section)
CREATE TABLE IF NOT EXISTS public.user_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  warning_type text NOT NULL,
  description text,
  warning_count integer DEFAULT 1,
  is_banned boolean DEFAULT false,
  banned_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own warnings" ON public.user_warnings
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage all warnings" ON public.user_warnings
    FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "System inserts warnings" ON public.user_warnings
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper function: count current month cancellations for a teacher
CREATE OR REPLACE FUNCTION public.teacher_monthly_cancellations(_teacher_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.bookings
  WHERE teacher_id = _teacher_id
    AND status = 'cancelled'
    AND cancelled_by = _teacher_id
    AND cancelled_at >= date_trunc('month', now())
    AND cancelled_at < date_trunc('month', now()) + interval '1 month';
$$;
