
-- 0) Drop old function before changing return signature
DROP FUNCTION IF EXISTS public.get_platform_revenue_summary(text);

-- 1) Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  student_id uuid NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  payment_record_id uuid REFERENCES public.payment_records(id) ON DELETE SET NULL,
  stripe_session_id text,
  hours_purchased numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0.15,
  vat_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  zatca_status text NOT NULL DEFAULT 'pending',
  zatca_uuid text,
  zatca_hash text,
  qr_code text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_student ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON public.invoices(issued_at);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_session ON public.invoices(stripe_session_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own invoices" ON public.invoices;
CREATE POLICY "Students view own invoices" ON public.invoices
  FOR SELECT USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices" ON public.invoices
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ym text;
  _seq integer;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;
  _ym := to_char(COALESCE(NEW.issued_at, now()), 'YYYY-MM');
  SELECT COUNT(*) + 1 INTO _seq FROM public.invoices WHERE to_char(issued_at, 'YYYY-MM') = _ym;
  NEW.invoice_number := 'INV-' || _ym || '-' || LPAD(_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_number ON public.invoices;
CREATE TRIGGER trg_invoices_number
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

-- 2) Sessions: NO per-session VAT, only internal allocation
CREATE OR REPLACE FUNCTION public.auto_complete_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _booking RECORD;
  _duration_minutes integer;
  _hourly_rate numeric := 0;
  _platform_fee_rate numeric := 0.60;
  _gross numeric := 0;
  _platform_fee numeric := 0;
  _teacher_base numeric := 0;
  _net numeric := 0;
  _sub_id uuid;
BEGIN
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    NEW.duration_minutes := (SELECT duration_minutes FROM public.bookings WHERE id = NEW.booking_id);
  END IF;

  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    IF NEW.duration_minutes IS NOT NULL
       AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       AND NEW.duration_minutes > 0 THEN
      _duration_minutes := NEW.duration_minutes;
    ELSE
      _duration_minutes := CEIL(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0)::integer;
      NEW.duration_minutes := _duration_minutes;
    END IF;

    SELECT * INTO _booking FROM public.bookings WHERE id = NEW.booking_id;

    SELECT COALESCE(platform_fee_rate, 0.60) INTO _platform_fee_rate
      FROM public.financial_settings LIMIT 1;
    IF _platform_fee_rate > 1 THEN _platform_fee_rate := _platform_fee_rate / 100.0; END IF;

    SELECT COALESCE(hourly_rate, 0) INTO _hourly_rate
      FROM public.teacher_profiles WHERE user_id = _booking.teacher_id;

    IF _duration_minutes < 5 THEN
      NEW.short_session := true;
      NEW.deducted_minutes := 0;
      NEW.teacher_earning := 0;
      NEW.gross_amount := 0;
      NEW.platform_fee := 0;
      NEW.teacher_base_amount := 0;
      NEW.vat_amount := 0;
      NEW.net_amount := 0;
    ELSE
      NEW.short_session := false;
      NEW.deducted_minutes := _duration_minutes;

      _gross := ROUND((_duration_minutes::numeric / 60.0) * _hourly_rate, 2);
      _platform_fee := ROUND(_gross * _platform_fee_rate, 2);
      _teacher_base := ROUND(_gross - _platform_fee, 2);
      _net := _teacher_base;

      NEW.gross_amount := _gross;
      NEW.vat_amount := 0;
      NEW.platform_fee := _platform_fee;
      NEW.teacher_base_amount := _teacher_base;
      NEW.net_amount := _net;
      NEW.platform_fee_rate_snapshot := _platform_fee_rate;
      NEW.vat_rate_snapshot := 0;
      NEW.teacher_earning := _net;

      _sub_id := _booking.subscription_id;
      IF _sub_id IS NULL THEN
        SELECT id INTO _sub_id
        FROM public.user_subscriptions
        WHERE user_id = _booking.student_id
          AND is_active = true
          AND remaining_minutes >= _duration_minutes
        ORDER BY created_at DESC
        LIMIT 1;
      END IF;

      IF _sub_id IS NOT NULL THEN
        UPDATE public.user_subscriptions
        SET remaining_minutes = GREATEST(0, remaining_minutes - _duration_minutes)
        WHERE id = _sub_id;
      END IF;
    END IF;

    NEW.status := 'completed';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Platform revenue summary from invoices (revenue + VAT) and sessions (allocation)
CREATE OR REPLACE FUNCTION public.get_platform_revenue_summary(_month text DEFAULT NULL)
RETURNS TABLE(
  total_revenue numeric,
  total_vat numeric,
  total_platform_earnings numeric,
  total_teacher_payouts numeric,
  net_profit numeric,
  sessions_count integer,
  minutes_total integer,
  invoices_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH inv AS (
    SELECT
      COALESCE(SUM(total_amount), 0)  AS gross,
      COALESCE(SUM(vat_amount), 0)    AS vat,
      COALESCE(SUM(net_amount), 0)    AS net,
      COUNT(*)::int                   AS cnt
    FROM public.invoices
    WHERE (_month IS NULL OR to_char(issued_at, 'YYYY-MM') = _month)
  ),
  sess AS (
    SELECT
      COALESCE(SUM(s.platform_fee), 0)         AS platform_fee_sum,
      COALESCE(SUM(s.teacher_base_amount), 0)  AS teacher_payouts_sum,
      COUNT(*)::int                            AS cnt,
      COALESCE(SUM(s.duration_minutes), 0)::int AS mins
    FROM public.sessions s
    WHERE s.ended_at IS NOT NULL
      AND s.short_session = false
      AND (_month IS NULL OR to_char(s.ended_at, 'YYYY-MM') = _month)
  )
  SELECT
    inv.gross,
    inv.vat,
    sess.platform_fee_sum,
    sess.teacher_payouts_sum,
    (inv.net - sess.teacher_payouts_sum),
    sess.cnt,
    sess.mins,
    inv.cnt
  FROM inv, sess
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;
