
-- 1) financial_settings (singleton)
CREATE TABLE IF NOT EXISTS public.financial_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vat_rate numeric NOT NULL DEFAULT 15,
  min_withdrawal_amount numeric NOT NULL DEFAULT 100,
  auto_close_months_after_days integer NOT NULL DEFAULT 7,
  large_withdrawal_threshold numeric NOT NULL DEFAULT 5000,
  enable_auto_reconciliation boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view financial settings"
  ON public.financial_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage financial settings"
  ON public.financial_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.financial_settings (vat_rate, min_withdrawal_amount)
SELECT 15, 100
WHERE NOT EXISTS (SELECT 1 FROM public.financial_settings);

-- 2) financial_audit_log
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  amount numeric,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text
);
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fal_actor ON public.financial_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_fal_entity ON public.financial_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fal_created ON public.financial_audit_log(created_at DESC);

CREATE POLICY "Admins view financial audit"
  ON public.financial_audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'manage_teacher_earnings'::app_permission));

CREATE POLICY "Authenticated insert financial audit"
  ON public.financial_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id OR has_role(auth.uid(), 'admin'::app_role));

-- 3) withdrawal_status_history
CREATE TABLE IF NOT EXISTS public.withdrawal_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_status_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_wsh_withdrawal ON public.withdrawal_status_history(withdrawal_id);

CREATE POLICY "Admins manage withdrawal history"
  ON public.withdrawal_status_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'manage_withdrawals'::app_permission))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'manage_withdrawals'::app_permission));

CREATE POLICY "Teachers view own withdrawal history"
  ON public.withdrawal_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.withdrawal_requests w WHERE w.id = withdrawal_id AND w.teacher_id = auth.uid()));

-- 4) financial_reconciliation
CREATE TABLE IF NOT EXISTS public.financial_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_total numeric NOT NULL DEFAULT 0,
  actual_total numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  sessions_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view reconciliation"
  ON public.financial_reconciliation FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'manage_teacher_earnings'::app_permission));

CREATE POLICY "Admins insert reconciliation"
  ON public.financial_reconciliation FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5) New columns
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS processing_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric;

ALTER TABLE public.teacher_earnings
  ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric;

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_id text;

-- 6) Trigger: log financial audit on teacher_earnings changes
CREATE OR REPLACE FUNCTION public.log_teacher_earnings_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_audit_log (actor_id, actor_role, action, entity_type, entity_id, amount, after_data)
    VALUES (auth.uid(), 'admin', 'earning_created', 'teacher_earnings', NEW.id::text, NEW.amount, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.financial_audit_log (actor_id, action, entity_type, entity_id, amount, before_data, after_data)
    VALUES (auth.uid(), 'earning_updated', 'teacher_earnings', NEW.id::text, NEW.amount, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.financial_audit_log (actor_id, action, entity_type, entity_id, amount, before_data)
    VALUES (auth.uid(), 'earning_deleted', 'teacher_earnings', OLD.id::text, OLD.amount, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_earnings_audit ON public.teacher_earnings;
CREATE TRIGGER trg_teacher_earnings_audit
AFTER INSERT OR UPDATE OR DELETE ON public.teacher_earnings
FOR EACH ROW EXECUTE FUNCTION public.log_teacher_earnings_audit();

-- 7) Trigger: log withdrawal status history & audit
CREATE OR REPLACE FUNCTION public.log_withdrawal_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.withdrawal_status_history (withdrawal_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
    INSERT INTO public.financial_audit_log (actor_id, action, entity_type, entity_id, amount, after_data)
    VALUES (auth.uid(), 'withdrawal_created', 'withdrawal_request', NEW.id::text, NEW.amount, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.withdrawal_status_history (withdrawal_id, from_status, to_status, changed_by, notes)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.admin_notes);
    INSERT INTO public.financial_audit_log (actor_id, action, entity_type, entity_id, amount, before_data, after_data)
    VALUES (auth.uid(), 'withdrawal_status_changed', 'withdrawal_request', NEW.id::text, NEW.amount, to_jsonb(OLD), to_jsonb(NEW));

    IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := auth.uid();
    ELSIF NEW.status = 'processing' AND OLD.status <> 'processing' THEN
      NEW.processing_at := now();
    ELSIF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
      NEW.paid_at := now();
      NEW.paid_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_withdrawal_changes ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_changes
BEFORE INSERT OR UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.log_withdrawal_changes();

-- 8) Function: validate min withdrawal amount
CREATE OR REPLACE FUNCTION public.validate_withdrawal_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _min numeric;
BEGIN
  SELECT min_withdrawal_amount INTO _min FROM public.financial_settings LIMIT 1;
  IF NEW.amount < COALESCE(_min, 100) THEN
    RAISE EXCEPTION 'Withdrawal amount % is below minimum %', NEW.amount, _min;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_withdrawal_min ON public.withdrawal_requests;
CREATE TRIGGER trg_validate_withdrawal_min
BEFORE INSERT ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_withdrawal_minimum();

-- 9) Earnings breakdown function
CREATE OR REPLACE FUNCTION public.get_teacher_earnings_breakdown(_teacher_id uuid)
RETURNS TABLE(
  confirmed_total numeric,
  pending_total numeric,
  paid_total numeric,
  available_for_withdrawal numeric,
  total_sessions integer,
  total_minutes integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH earnings AS (
    SELECT
      COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0) AS confirmed,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid
    FROM public.teacher_earnings WHERE teacher_id = _teacher_id
  ),
  pending_withdrawals AS (
    SELECT COALESCE(SUM(amount), 0) AS amt
    FROM public.withdrawal_requests
    WHERE teacher_id = _teacher_id AND status IN ('pending','approved','processing')
  ),
  sess AS (
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(s.duration_minutes),0)::int AS mins
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id AND s.ended_at IS NOT NULL AND s.short_session = false
  )
  SELECT
    e.confirmed,
    e.pending,
    e.paid,
    GREATEST(e.confirmed - e.paid - pw.amt, 0),
    s.cnt,
    s.mins
  FROM earnings e, pending_withdrawals pw, sess s;
$$;

-- 10) Auto-close old months function
CREATE OR REPLACE FUNCTION public.auto_close_old_financial_months()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days integer;
  _closed integer := 0;
BEGIN
  SELECT auto_close_months_after_days INTO _days FROM public.financial_settings LIMIT 1;
  _days := COALESCE(_days, 7);

  WITH to_close AS (
    SELECT month FROM public.financial_months
    WHERE status = 'open'
      AND to_date(month || '-01', 'YYYY-MM-DD') + interval '1 month' + (_days || ' days')::interval < now()
  )
  UPDATE public.financial_months fm
  SET status = 'closed', closed_at = now()
  FROM to_close tc
  WHERE fm.month = tc.month;

  GET DIAGNOSTICS _closed = ROW_COUNT;

  IF _closed > 0 THEN
    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES ('info', 'auto_close_months', 'Auto-closed ' || _closed || ' financial months',
      jsonb_build_object('count', _closed, 'days_threshold', _days));
  END IF;

  RETURN _closed;
END;
$$;

-- 11) Reconciliation function
CREATE OR REPLACE FUNCTION public.run_financial_reconciliation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expected numeric := 0;
  _actual numeric := 0;
  _diff numeric;
  _count integer := 0;
  _id uuid;
  _status text;
BEGIN
  SELECT COALESCE(SUM(teacher_earning), 0), COUNT(*)
    INTO _expected, _count
  FROM public.sessions
  WHERE ended_at IS NOT NULL
    AND short_session = false
    AND ended_at >= CURRENT_DATE - interval '1 day';

  SELECT COALESCE(SUM(amount), 0) INTO _actual
  FROM public.teacher_earnings
  WHERE created_at >= CURRENT_DATE - interval '1 day';

  _diff := _actual - _expected;
  _status := CASE WHEN ABS(_diff) < 0.01 THEN 'ok' WHEN ABS(_diff) < 100 THEN 'minor_drift' ELSE 'mismatch' END;

  INSERT INTO public.financial_reconciliation (expected_total, actual_total, difference, sessions_count, status)
  VALUES (_expected, _actual, _diff, _count, _status)
  RETURNING id INTO _id;

  IF _status <> 'ok' THEN
    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES ('warn', 'financial_reconciliation', 'Reconciliation mismatch detected',
      jsonb_build_object('expected', _expected, 'actual', _actual, 'difference', _diff, 'reconciliation_id', _id));
  END IF;

  RETURN _id;
END;
$$;
