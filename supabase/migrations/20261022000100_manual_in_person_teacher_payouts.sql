-- In-person lesson earnings remain visible in monthly reports, but only the
-- platform's explicit online/manual teacher balance can be withdrawn.
-- Existing withdrawal allocations are intentionally preserved.

CREATE OR REPLACE FUNCTION public.validate_withdrawal_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_min numeric;
  v_available numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;
  SELECT min_withdrawal_amount INTO v_min
  FROM public.financial_settings LIMIT 1;
  IF NEW.amount < COALESCE(v_min, 100) THEN
    RAISE EXCEPTION 'Withdrawal amount % is below minimum %', NEW.amount, COALESCE(v_min, 100);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('withdrawal:' || NEW.teacher_id::text, 0));

  SELECT GREATEST(COALESCE(online.amount, 0) - COALESCE(reserved.amount, 0), 0)
  INTO v_available
  FROM
    (SELECT sum(e.amount) AS amount
     FROM public.teacher_earnings e
     WHERE e.teacher_id = NEW.teacher_id AND e.status = 'confirmed' AND e.amount > 0) online,
    (SELECT sum(a.amount) AS amount
     FROM public.teacher_withdrawal_earning_allocations a
     JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
     WHERE wr.teacher_id = NEW.teacher_id
       AND wr.status IN ('pending', 'approved', 'processing', 'paid')) reserved;

  IF NEW.amount > COALESCE(v_available, 0) + 0.01 THEN
    RAISE EXCEPTION 'Withdrawal amount exceeds available balance (available: %)', COALESCE(v_available, 0);
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
  v_row record;
  v_remaining numeric := NEW.amount;
  v_allocated numeric;
  v_available numeric;
  v_take numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('withdrawal:' || NEW.teacher_id::text, 0));

  FOR v_row IN
    SELECT e.id, e.amount
    FROM public.teacher_earnings e
    WHERE e.teacher_id = NEW.teacher_id
      AND e.status = 'confirmed'
      AND e.amount > 0
      AND e.created_at <= NEW.created_at
    ORDER BY e.created_at, e.id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    SELECT COALESCE(sum(a.amount), 0) INTO v_allocated
    FROM public.teacher_withdrawal_earning_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE a.teacher_earning_id = v_row.id
      AND wr.status IN ('pending', 'approved', 'processing', 'paid');

    v_available := GREATEST(v_row.amount - v_allocated, 0);
    v_take := LEAST(v_available, v_remaining);
    IF v_take > 0 THEN
      INSERT INTO public.teacher_withdrawal_earning_allocations
        (withdrawal_request_id, teacher_earning_id, amount)
      VALUES (NEW.id, v_row.id, v_take);
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;

  IF v_remaining > 0.01 THEN
    RAISE EXCEPTION 'Unable to reserve the full withdrawal amount';
  END IF;
  RETURN NEW;
END;
$$;

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
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::public.app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::public.app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_payments'::public.app_permission) THEN
    RAISE EXCEPTION 'Not authorized to view teacher earnings' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH online AS (
    SELECT
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'confirmed'), 0) AS confirmed,
      COALESCE(sum(e.amount) FILTER (WHERE e.status IN ('pending', 'unconfirmed', 'in_progress')), 0) AS pending,
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'paid' AND e.amount > 0
        AND e.earning_type <> 'deduction'), 0) AS paid
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id
  ),
  online_allocations AS (
    SELECT COALESCE(sum(a.amount), 0) AS allocated
    FROM public.teacher_withdrawal_earning_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE wr.teacher_id = _teacher_id
      AND wr.status IN ('pending', 'approved', 'processing', 'paid')
  ),
  in_person AS (
    SELECT
      COALESCE(sum(src.amount) FILTER (WHERE src.status IN ('available', 'paid')), 0) AS confirmed,
      COALESCE(sum(src.amount) FILTER (WHERE src.status = 'pending'), 0) AS pending,
      COALESCE(sum(src.amount) FILTER (WHERE src.status = 'paid'), 0) AS paid
    FROM (
      SELECT e.amount, e.status FROM public.in_person_teacher_earnings e WHERE e.teacher_id = _teacher_id
      UNION ALL
      SELECT c.amount, c.status FROM public.in_person_teacher_compensations c WHERE c.teacher_id = _teacher_id
    ) src
  ),
  payments AS (
    SELECT COALESCE(sum(p.amount), 0) AS paid
    FROM public.teacher_payments p
    WHERE p.teacher_id = _teacher_id
  ),
  sessions AS (
    SELECT count(*)::integer AS total_sessions,
      COALESCE(sum(CASE WHEN COALESCE(s.deducted_minutes, 0) > 0
        THEN s.deducted_minutes ELSE COALESCE(s.duration_minutes, 0) END), 0)::integer AS total_minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id
      AND s.ended_at IS NOT NULL
      AND s.short_session = false
  )
  SELECT
    online.confirmed + in_person.confirmed,
    online.pending + in_person.pending,
    online.paid + in_person.paid + payments.paid,
    GREATEST(online.confirmed - online_allocations.allocated, 0),
    sessions.total_sessions,
    sessions.total_minutes
  FROM online CROSS JOIN online_allocations CROSS JOIN in_person CROSS JOIN payments CROSS JOIN sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_earnings_breakdown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_earnings_breakdown(uuid) TO authenticated;
