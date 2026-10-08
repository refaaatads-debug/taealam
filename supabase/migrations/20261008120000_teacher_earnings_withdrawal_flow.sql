-- Separate monthly earnings transfers from extra bonuses, and keep each
-- withdrawal linked to the earnings it reserves or pays.

ALTER TABLE public.teacher_earnings
  ADD COLUMN IF NOT EXISTS earning_type text NOT NULL DEFAULT 'monthly_transfer';

-- Preserve existing adjustment records as bonuses/deductions. Other historical
-- rows were monthly earnings entered by an administrator.
UPDATE public.teacher_earnings
SET earning_type = CASE
  WHEN notes LIKE 'مكافأة:%' THEN 'bonus'
  WHEN notes LIKE 'خصم:%' THEN 'deduction'
  ELSE earning_type
END
WHERE earning_type = 'monthly_transfer'
  AND (notes LIKE 'مكافأة:%' OR notes LIKE 'خصم:%');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teacher_earnings_earning_type_check'
      AND conrelid = 'public.teacher_earnings'::regclass
  ) THEN
    ALTER TABLE public.teacher_earnings
      ADD CONSTRAINT teacher_earnings_earning_type_check
      CHECK (earning_type IN ('monthly_transfer', 'bonus', 'deduction'));
  END IF;
END;
$$;

-- Monthly transfers can be entered in more than one installment, and bonuses
-- are independent entries. Invoice IDs remain unique.
DROP INDEX IF EXISTS public.idx_teacher_earnings_unique_period;
CREATE INDEX IF NOT EXISTS idx_teacher_earnings_teacher_month_type_status
  ON public.teacher_earnings (teacher_id, month, earning_type, status);

CREATE TABLE IF NOT EXISTS public.teacher_withdrawal_earning_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id uuid NOT NULL
    REFERENCES public.withdrawal_requests(id) ON DELETE RESTRICT,
  teacher_earning_id uuid NOT NULL
    REFERENCES public.teacher_earnings(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (withdrawal_request_id, teacher_earning_id)
);

ALTER TABLE public.teacher_withdrawal_earning_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage teacher withdrawal allocations"
  ON public.teacher_withdrawal_earning_allocations;
CREATE POLICY "Admins manage teacher withdrawal allocations"
  ON public.teacher_withdrawal_earning_allocations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'manage_withdrawals'::app_permission)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'manage_withdrawals'::app_permission)
  );

CREATE INDEX IF NOT EXISTS idx_teacher_withdrawal_allocations_earning
  ON public.teacher_withdrawal_earning_allocations (teacher_earning_id);
CREATE INDEX IF NOT EXISTS idx_teacher_withdrawal_allocations_request
  ON public.teacher_withdrawal_earning_allocations (withdrawal_request_id);

-- Allocate historical open and paid requests against the confirmed earnings
-- that existed when each request was submitted.
DO $$
DECLARE
  _request record;
  _earning record;
  _remaining numeric;
  _already_allocated numeric;
  _available numeric;
  _take numeric;
BEGIN
  FOR _request IN
    SELECT id, teacher_id, amount, created_at
    FROM public.withdrawal_requests
    WHERE status IN ('pending', 'approved', 'processing', 'paid')
    ORDER BY teacher_id, created_at, id
  LOOP
    _remaining := GREATEST(COALESCE(_request.amount, 0), 0);

    FOR _earning IN
      SELECT id, amount
      FROM public.teacher_earnings
      WHERE teacher_id = _request.teacher_id
        AND status = 'confirmed'
        AND amount > 0
        AND created_at <= _request.created_at
      ORDER BY created_at, id
    LOOP
      EXIT WHEN _remaining <= 0;

      SELECT COALESCE(SUM(a.amount), 0)
      INTO _already_allocated
      FROM public.teacher_withdrawal_earning_allocations a
      JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
      WHERE a.teacher_earning_id = _earning.id
        AND wr.status IN ('pending', 'approved', 'processing', 'paid');

      _available := GREATEST(_earning.amount - _already_allocated, 0);
      _take := LEAST(_available, _remaining);

      IF _take > 0 THEN
        INSERT INTO public.teacher_withdrawal_earning_allocations
          (withdrawal_request_id, teacher_earning_id, amount)
        VALUES (_request.id, _earning.id, _take);
        _remaining := _remaining - _take;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Generate invoice numbers safely now that multiple monthly rows are allowed.
CREATE OR REPLACE FUNCTION public.generate_earning_invoice_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _seq integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('earning-invoice:' || NEW.month, 0)
  );

  SELECT COALESCE(
    MAX(regexp_replace(invoice_id, '^.*-', '')::integer),
    0
  ) + 1
  INTO _seq
  FROM public.teacher_earnings
  WHERE month = NEW.month
    AND invoice_id ~ '-[0-9]+$';

  NEW.invoice_id := 'EARN-' || NEW.month || '-' || LPAD(_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

-- The monthly summary is session earnings not yet transferred into the
-- withdrawable ledger. Bonuses never reduce session earnings.
CREATE OR REPLACE FUNCTION public.get_teacher_monthly_transfer_capacity(
  _teacher_id uuid,
  _month text,
  _exclude_earning_id uuid DEFAULT NULL
)
RETURNS TABLE(
  session_earnings numeric,
  completed_minutes bigint,
  transferred numeric,
  remaining numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _teacher_id
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::app_permission)
  THEN
    RAISE EXCEPTION 'Not authorized to view teacher earnings'
      USING ERRCODE = '42501';
  END IF;

  IF _month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Invalid earnings month';
  END IF;

  RETURN QUERY
  WITH sessions AS (
    SELECT
      COALESCE(SUM(s.net_amount), 0)::numeric AS amount,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(s.deducted_minutes, 0) > 0 THEN s.deducted_minutes
          WHEN COALESCE(s.duration_minutes, 0) > 0 THEN s.duration_minutes
          ELSE 0
        END
      ), 0)::bigint AS minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id
      AND s.ended_at IS NOT NULL
      AND s.short_session = false
      AND to_char(s.ended_at, 'YYYY-MM') = _month
  ),
  transfers AS (
    SELECT COALESCE(SUM(e.amount), 0)::numeric AS amount
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id
      AND e.month = _month
      AND e.earning_type = 'monthly_transfer'
      AND e.status IN ('confirmed', 'paid')
      AND e.amount > 0
      AND (_exclude_earning_id IS NULL OR e.id <> _exclude_earning_id)
  )
  SELECT
    s.amount,
    s.minutes,
    t.amount,
    GREATEST(s.amount - t.amount, 0)
  FROM sessions s CROSS JOIN transfers t;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_monthly_transfer_capacity(uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_monthly_transfer_capacity(uuid, text, uuid)
  TO authenticated;

-- Do not allow administrators to transfer more than the untransferred monthly
-- session earnings. The advisory lock prevents concurrent over-allocation.
CREATE OR REPLACE FUNCTION public.validate_monthly_teacher_earning_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _session_total numeric;
  _other_transfers numeric;
  _old_contribution numeric := 0;
BEGIN
  IF NEW.earning_type <> 'monthly_transfer'
    OR NEW.status NOT IN ('confirmed', 'paid')
    OR NEW.amount <= 0
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('monthly-transfer:' || NEW.teacher_id::text || ':' || NEW.month, 0)
  );

  SELECT COALESCE(SUM(s.net_amount), 0)
  INTO _session_total
  FROM public.sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.teacher_id = NEW.teacher_id
    AND s.ended_at IS NOT NULL
    AND s.short_session = false
    AND to_char(s.ended_at, 'YYYY-MM') = NEW.month;

  SELECT COALESCE(SUM(e.amount), 0)
  INTO _other_transfers
  FROM public.teacher_earnings e
  WHERE e.teacher_id = NEW.teacher_id
    AND e.month = NEW.month
    AND e.earning_type = 'monthly_transfer'
    AND e.status IN ('confirmed', 'paid')
    AND e.amount > 0
    AND (TG_OP = 'INSERT' OR e.id <> NEW.id);

  IF TG_OP = 'UPDATE'
    AND OLD.teacher_id = NEW.teacher_id
    AND OLD.month = NEW.month
    AND OLD.earning_type = 'monthly_transfer'
    AND OLD.status IN ('confirmed', 'paid')
    AND OLD.amount > 0
  THEN
    _old_contribution := OLD.amount;
  END IF;

  IF _other_transfers + NEW.amount > _session_total + 0.01
    AND _other_transfers + NEW.amount > _other_transfers + _old_contribution + 0.01
  THEN
    RAISE EXCEPTION 'Monthly transfer exceeds the remaining session earnings (remaining: %)',
      GREATEST(_session_total - _other_transfers, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_monthly_teacher_earning_transfer
  ON public.teacher_earnings;
CREATE TRIGGER trg_validate_monthly_teacher_earning_transfer
  BEFORE INSERT OR UPDATE ON public.teacher_earnings
  FOR EACH ROW EXECUTE FUNCTION public.validate_monthly_teacher_earning_transfer();

-- Session earnings already credit teacher_profiles.balance. Only bonuses and
-- deductions change that legacy mirror; a monthly transfer moves existing
-- session earnings into the withdrawable ledger and must not credit them twice.
CREATE OR REPLACE FUNCTION public.sync_teacher_profile_balance_from_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _old_delta numeric := 0;
  _new_delta numeric := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' AND NEW.earning_type IN ('bonus', 'deduction') THEN
      UPDATE public.teacher_profiles
      SET balance = GREATEST(COALESCE(balance, 0) + NEW.amount, 0),
          updated_at = now()
      WHERE user_id = NEW.teacher_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' AND OLD.earning_type IN ('bonus', 'deduction') THEN
      UPDATE public.teacher_profiles
      SET balance = GREATEST(COALESCE(balance, 0) - OLD.amount, 0),
          updated_at = now()
      WHERE user_id = OLD.teacher_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'confirmed' AND OLD.earning_type IN ('bonus', 'deduction') THEN
    _old_delta := -OLD.amount;
  END IF;
  IF NEW.status = 'confirmed' AND NEW.earning_type IN ('bonus', 'deduction') THEN
    _new_delta := NEW.amount;
  END IF;

  IF OLD.teacher_id IS DISTINCT FROM NEW.teacher_id THEN
    IF _old_delta <> 0 THEN
      UPDATE public.teacher_profiles
      SET balance = GREATEST(COALESCE(balance, 0) + _old_delta, 0),
          updated_at = now()
      WHERE user_id = OLD.teacher_id;
    END IF;
    IF _new_delta <> 0 THEN
      UPDATE public.teacher_profiles
      SET balance = GREATEST(COALESCE(balance, 0) + _new_delta, 0),
          updated_at = now()
      WHERE user_id = NEW.teacher_id;
    END IF;
  ELSIF _old_delta + _new_delta <> 0 THEN
      UPDATE public.teacher_profiles
      SET balance = GREATEST(COALESCE(balance, 0) + _old_delta + _new_delta, 0),
          updated_at = now()
      WHERE user_id = NEW.teacher_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_teacher_profile_balance_from_earnings
  ON public.teacher_earnings;
CREATE TRIGGER trg_sync_teacher_profile_balance_from_earnings
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_earnings
  FOR EACH ROW EXECUTE FUNCTION public.sync_teacher_profile_balance_from_earnings();

-- Replace the previous mirror triggers; leaving them enabled would credit the
-- profile balance for monthly transfers and double-apply bonuses.
DROP TRIGGER IF EXISTS trg_update_teacher_balance
  ON public.teacher_earnings;
DROP TRIGGER IF EXISTS trg_update_teacher_balance_insert
  ON public.teacher_earnings;

-- Keep any source row immutable once it has been linked to a withdrawal,
-- including rejected requests, so the financial audit trail stays intact.
CREATE OR REPLACE FUNCTION public.prevent_mutating_allocated_teacher_earning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _earning_id uuid;
BEGIN
  _earning_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  IF EXISTS (
    SELECT 1
    FROM public.teacher_withdrawal_earning_allocations a
    WHERE a.teacher_earning_id = _earning_id
  ) THEN
    RAISE EXCEPTION 'This earning is linked to a withdrawal and cannot be edited or deleted';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mutating_allocated_teacher_earning
  ON public.teacher_earnings;
CREATE TRIGGER trg_prevent_mutating_allocated_teacher_earning
  BEFORE UPDATE OR DELETE ON public.teacher_earnings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutating_allocated_teacher_earning();

-- Validate the amount and reserve its source earnings atomically on request.
CREATE OR REPLACE FUNCTION public.validate_withdrawal_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _min numeric;
  _confirmed numeric;
  _reserved numeric;
  _available numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  SELECT min_withdrawal_amount INTO _min
  FROM public.financial_settings
  LIMIT 1;

  IF NEW.amount < COALESCE(_min, 100) THEN
    RAISE EXCEPTION 'Withdrawal amount % is below minimum %', NEW.amount, COALESCE(_min, 100);
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('withdrawal:' || NEW.teacher_id::text, 0)
  );

  SELECT COALESCE(SUM(e.amount), 0)
  INTO _confirmed
  FROM public.teacher_earnings e
  WHERE e.teacher_id = NEW.teacher_id
    AND e.status = 'confirmed';

  SELECT COALESCE(SUM(a.amount), 0)
  INTO _reserved
  FROM public.teacher_withdrawal_earning_allocations a
  JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
  WHERE wr.teacher_id = NEW.teacher_id
    AND wr.status IN ('pending', 'approved', 'processing', 'paid');

  _available := GREATEST(_confirmed - _reserved, 0);
  IF NEW.amount > _available + 0.01 THEN
    RAISE EXCEPTION 'Withdrawal amount exceeds available balance (available: %)', _available;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_teacher_earnings_for_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _earning record;
  _remaining numeric := NEW.amount;
  _already_allocated numeric;
  _available numeric;
  _take numeric;
BEGIN
  FOR _earning IN
    SELECT id, amount
    FROM public.teacher_earnings
    WHERE teacher_id = NEW.teacher_id
      AND status = 'confirmed'
      AND amount > 0
      AND created_at <= NEW.created_at
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;

    SELECT COALESCE(SUM(a.amount), 0)
    INTO _already_allocated
    FROM public.teacher_withdrawal_earning_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE a.teacher_earning_id = _earning.id
      AND wr.status IN ('pending', 'approved', 'processing', 'paid');

    _available := GREATEST(_earning.amount - _already_allocated, 0);
    _take := LEAST(_available, _remaining);

    IF _take > 0 THEN
      INSERT INTO public.teacher_withdrawal_earning_allocations
        (withdrawal_request_id, teacher_earning_id, amount)
      VALUES (NEW.id, _earning.id, _take);
      _remaining := _remaining - _take;
    END IF;
  END LOOP;

  IF _remaining > 0.01 THEN
    RAISE EXCEPTION 'Unable to reserve the full withdrawal amount';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allocate_teacher_earnings_for_withdrawal
  ON public.withdrawal_requests;
CREATE TRIGGER trg_allocate_teacher_earnings_for_withdrawal
  AFTER INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.allocate_teacher_earnings_for_withdrawal();

-- Paid earnings are displayed as the cumulative amount actually paid. The
-- available figure is confirmed credits minus amounts reserved/paid by requests.
CREATE OR REPLACE FUNCTION public.get_teacher_earnings_breakdown(_teacher_id uuid)
RETURNS TABLE(
  confirmed_total numeric,
  pending_total numeric,
  paid_total numeric,
  available_balance numeric,
  sessions_count integer,
  total_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _teacher_id
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_payments'::app_permission)
  THEN
    RAISE EXCEPTION 'Not authorized to view teacher earnings'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH earnings AS (
    SELECT
      COALESCE(SUM(e.amount) FILTER (WHERE e.status = 'confirmed'), 0) AS confirmed,
      COALESCE(SUM(e.amount) FILTER (WHERE e.status IN ('pending', 'unconfirmed', 'in_progress')), 0) AS pending,
      COALESCE(SUM(e.amount) FILTER (
        WHERE e.status = 'paid' AND e.amount > 0 AND e.earning_type <> 'deduction'
      ), 0) AS legacy_paid
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id
  ),
  reservations AS (
    SELECT COALESCE(SUM(a.amount), 0) AS allocated
    FROM public.teacher_withdrawal_earning_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE wr.teacher_id = _teacher_id
      AND wr.status IN ('pending', 'approved', 'processing', 'paid')
  ),
  payments AS (
    SELECT COALESCE(SUM(p.amount), 0) AS paid
    FROM public.teacher_payments p
    WHERE p.teacher_id = _teacher_id
  ),
  sessions AS (
    SELECT COUNT(*)::integer AS total_sessions,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(s.deducted_minutes, 0) > 0 THEN s.deducted_minutes
          ELSE COALESCE(s.duration_minutes, 0)
        END
      ), 0)::integer AS total_minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id
      AND s.ended_at IS NOT NULL
      AND s.short_session = false
  )
  SELECT
    e.confirmed,
    e.pending,
    e.legacy_paid + p.paid,
    GREATEST(e.confirmed - r.allocated, 0),
    s.total_sessions,
    s.total_minutes
  FROM earnings e
  CROSS JOIN reservations r
  CROSS JOIN payments p
  CROSS JOIN sessions s;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_earnings_breakdown(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_earnings_breakdown(uuid)
  TO authenticated;

-- Subtract monthly transfers from the session-only month card so the same
-- earnings are not shown both as untransferred session earnings and withdrawable.
CREATE OR REPLACE FUNCTION public.get_teacher_net_summary(_teacher_id uuid, _month text DEFAULT NULL)
RETURNS TABLE(
  net_total numeric,
  sessions_count integer,
  minutes_total integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _teacher_id
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::app_permission)
  THEN
    RAISE EXCEPTION 'Not authorized to view teacher earnings'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH session_totals AS (
    SELECT
      COALESCE(SUM(s.net_amount), 0) AS net_amount,
      COUNT(*)::integer AS sessions_count,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(s.deducted_minutes, 0) > 0 THEN s.deducted_minutes
          ELSE COALESCE(s.duration_minutes, 0)
        END
      ), 0)::integer AS minutes_total
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id
      AND s.ended_at IS NOT NULL
      AND s.short_session = false
      AND (_month IS NULL OR to_char(s.ended_at, 'YYYY-MM') = _month)
  ),
  transfers AS (
    SELECT COALESCE(SUM(e.amount), 0) AS amount
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id
      AND e.earning_type = 'monthly_transfer'
      AND e.status IN ('confirmed', 'paid')
      AND e.amount > 0
      AND (_month IS NULL OR e.month = _month)
  )
  SELECT
    GREATEST(s.net_amount - t.amount, 0),
    s.sessions_count,
    s.minutes_total
  FROM session_totals s CROSS JOIN transfers t;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_net_summary(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_net_summary(uuid, text)
  TO authenticated;

-- Record an admin's approval and payment as one idempotent transaction.
CREATE OR REPLACE FUNCTION public.approve_teacher_withdrawal_and_record_payment(
  _withdrawal_id uuid,
  _admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _request public.withdrawal_requests%ROWTYPE;
  _payment_id uuid;
  _existing_teacher_id uuid;
  _existing_amount numeric;
  _allocated numeric;
  _already_paid boolean := false;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::app_permission)
  THEN
    RAISE EXCEPTION 'Not authorized to approve withdrawals'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO _request
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;

  IF _request.status = 'rejected' THEN
    RAISE EXCEPTION 'A rejected withdrawal cannot be paid';
  END IF;

  SELECT id, amount, teacher_id
  INTO _payment_id, _existing_amount, _existing_teacher_id
  FROM public.teacher_payments
  WHERE withdrawal_request_id = _withdrawal_id
  LIMIT 1;

  IF _payment_id IS NOT NULL THEN
    IF _existing_amount IS DISTINCT FROM _request.amount
      OR _existing_teacher_id IS DISTINCT FROM _request.teacher_id
    THEN
      RAISE EXCEPTION 'Recorded payment does not match the withdrawal request';
    END IF;
    _already_paid := true;
  END IF;

  IF NOT _already_paid AND _request.status <> 'paid' THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO _allocated
    FROM public.teacher_withdrawal_earning_allocations
    WHERE withdrawal_request_id = _withdrawal_id;

    IF _allocated + 0.01 < _request.amount THEN
      RAISE EXCEPTION 'Withdrawal request is not fully reserved against teacher earnings';
    END IF;
  END IF;

  IF _request.status <> 'paid' THEN
    UPDATE public.withdrawal_requests
    SET status = 'paid',
        admin_notes = COALESCE(_admin_notes, admin_notes)
    WHERE id = _withdrawal_id;
  END IF;

  IF _payment_id IS NULL THEN
    INSERT INTO public.teacher_payments (
      teacher_id,
      amount,
      withdrawal_request_id,
      notes
    )
    VALUES (
      _request.teacher_id,
      _request.amount,
      _withdrawal_id,
      COALESCE(_admin_notes, 'دفع عبر تحويل بنكي')
    )
    ON CONFLICT (withdrawal_request_id) WHERE withdrawal_request_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO _payment_id;

    IF _payment_id IS NULL THEN
      SELECT id INTO _payment_id
      FROM public.teacher_payments
      WHERE withdrawal_request_id = _withdrawal_id;
      _already_paid := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', _payment_id,
    'teacher_id', _request.teacher_id,
    'amount', _request.amount,
    'already_paid', _already_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_teacher_withdrawal_and_record_payment(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_teacher_withdrawal_and_record_payment(uuid, text)
  TO authenticated;

-- A direct pending -> paid approval records both approval and payment timestamps.
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
      NEW.approved_at := COALESCE(NEW.approved_at, now());
      NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
      NEW.paid_at := now();
      NEW.paid_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
