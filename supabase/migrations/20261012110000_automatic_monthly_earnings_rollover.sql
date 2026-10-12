-- Automatically move completed session earnings left behind at month end
-- into the withdrawable ledger. The source month remains visible/auditable.
ALTER TABLE public.teacher_earnings
  ADD COLUMN IF NOT EXISTS rollover_source_month text;

ALTER TABLE public.teacher_earnings
  ALTER COLUMN added_by_admin DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_earnings_rollover_source
  ON public.teacher_earnings (teacher_id, rollover_source_month)
  WHERE rollover_source_month IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rollover_expired_teacher_earnings(_teacher_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current_month text := to_char(now(), 'YYYY-MM');
  _source_month text;
  _session_total numeric;
  _minutes bigint;
  _transferred numeric;
  _remaining numeric;
  _inserted integer := 0;
BEGIN
  IF auth.uid() IS DISTINCT FROM _teacher_id
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_payments'::app_permission)
  THEN
    RAISE EXCEPTION 'Not authorized to roll over teacher earnings'
      USING ERRCODE = '42501';
  END IF;

  FOR _source_month IN
    SELECT DISTINCT to_char(s.ended_at, 'YYYY-MM')
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id
      AND s.ended_at IS NOT NULL
      AND s.short_session = false
      AND to_char(s.ended_at, 'YYYY-MM') < _current_month
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('monthly-transfer:' || _teacher_id::text || ':' || _source_month, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.teacher_earnings e
      WHERE e.teacher_id = _teacher_id
        AND e.rollover_source_month = _source_month
    ) THEN
      CONTINUE;
    END IF;

    -- Let the administrator resolve an earlier manual transfer before rolling
    -- the remaining amount, so later approval cannot duplicate the credit.
    IF EXISTS (
      SELECT 1
      FROM public.teacher_earnings e
      WHERE e.teacher_id = _teacher_id
        AND e.month = _source_month
        AND e.earning_type = 'monthly_transfer'
        AND e.status IN ('pending', 'unconfirmed', 'in_progress')
    ) THEN
      CONTINUE;
    END IF;

    SELECT
      COALESCE(SUM(s.net_amount), 0)::numeric,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(s.deducted_minutes, 0) > 0 THEN s.deducted_minutes
          WHEN COALESCE(s.duration_minutes, 0) > 0 THEN s.duration_minutes
          ELSE 0
        END
      ), 0)::bigint
    INTO _session_total, _minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id
      AND s.ended_at IS NOT NULL
      AND s.short_session = false
      AND to_char(s.ended_at, 'YYYY-MM') = _source_month;

    SELECT COALESCE(SUM(e.amount), 0)::numeric
    INTO _transferred
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id
      AND e.month = _source_month
      AND e.earning_type = 'monthly_transfer'
      AND e.status IN ('confirmed', 'paid')
      AND e.amount > 0
      AND e.rollover_source_month IS NULL;

    _remaining := GREATEST(_session_total - _transferred, 0);
    IF _remaining <= 0.01 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.teacher_earnings (
      teacher_id, amount, month, notes, added_by_admin, status,
      earning_type, hours, minutes_snapshot, rollover_source_month
    )
    VALUES (
      _teacher_id, _remaining, _source_month,
      'ترحيل تلقائي للرصيد المتبقي من أرباح الشهر',
      NULL, 'confirmed', 'monthly_transfer',
      ROUND(_minutes::numeric / 60, 2), _minutes, _source_month
    )
    ON CONFLICT (teacher_id, rollover_source_month)
      WHERE rollover_source_month IS NOT NULL
    DO NOTHING;

    IF FOUND THEN
      _inserted := _inserted + 1;
    END IF;
  END LOOP;

  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.rollover_expired_teacher_earnings(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollover_expired_teacher_earnings(uuid)
  TO authenticated;

-- Allow system-generated rollover entries in a closed source month.
CREATE OR REPLACE FUNCTION public.block_closed_month_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
BEGIN
  IF NEW.rollover_source_month IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO _status
  FROM public.financial_months
  WHERE month = NEW.month;

  IF _status = 'closed' THEN
    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES (
      'warn', 'financial_security', 'محاولة تعديل أرباح في شهر مقفل',
      jsonb_build_object('month', NEW.month, 'teacher_id', NEW.teacher_id, 'amount', NEW.amount)
    );
    RAISE EXCEPTION 'Month % is closed', NEW.month;
  END IF;

  RETURN NEW;
END;
$$;

-- Automatic rollover entries are already the final monthly remainder. Do not
-- validate them as a fresh administrator transfer.
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
  IF NEW.rollover_source_month IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.earning_type <> 'monthly_transfer'
    OR NEW.status NOT IN ('confirmed', 'paid')
    OR NEW.amount <= 0
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('monthly-transfer:' || NEW.teacher_id::text || ':' || NEW.month, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.teacher_earnings e
    WHERE e.teacher_id = NEW.teacher_id
      AND e.rollover_source_month = NEW.month
  ) THEN
    RAISE EXCEPTION 'Monthly earnings have already been rolled over';
  END IF;

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
    AND e.rollover_source_month IS NULL
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

-- Keep generated rollover credits immutable, even before they are reserved by
-- a withdrawal, so the monthly audit trail cannot be silently changed.
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

  IF OLD.rollover_source_month IS NOT NULL THEN
    RAISE EXCEPTION 'Automatic rollover entries cannot be edited or deleted';
  END IF;

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

-- Materialize any expired earnings before calculating either the visible
-- available balance or the server-side withdrawal limit.
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
VOLATILE
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

  PERFORM public.rollover_expired_teacher_earnings(_teacher_id);

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

  PERFORM public.rollover_expired_teacher_earnings(NEW.teacher_id);

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
