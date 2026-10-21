-- Reserve in-person lesson earnings and cancellation compensations through the
-- existing withdrawal request flow. Rejected/cancelled requests release their
-- allocations; paid allocations remain permanently linked to their source rows.
CREATE TABLE IF NOT EXISTS public.teacher_withdrawal_in_person_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id uuid NOT NULL
    REFERENCES public.withdrawal_requests(id) ON DELETE RESTRICT,
  in_person_earning_id uuid
    REFERENCES public.in_person_teacher_earnings(id) ON DELETE RESTRICT,
  in_person_compensation_id uuid
    REFERENCES public.in_person_teacher_compensations(id) ON DELETE RESTRICT,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_withdrawal_in_person_source_check CHECK (
    (in_person_earning_id IS NOT NULL)::integer
    + (in_person_compensation_id IS NOT NULL)::integer = 1
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_withdrawal_in_person_earning_unique
  ON public.teacher_withdrawal_in_person_allocations(withdrawal_request_id, in_person_earning_id)
  WHERE in_person_earning_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teacher_withdrawal_in_person_comp_unique
  ON public.teacher_withdrawal_in_person_allocations(withdrawal_request_id, in_person_compensation_id)
  WHERE in_person_compensation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS teacher_withdrawal_in_person_earning_lookup
  ON public.teacher_withdrawal_in_person_allocations(in_person_earning_id)
  WHERE in_person_earning_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS teacher_withdrawal_in_person_comp_lookup
  ON public.teacher_withdrawal_in_person_allocations(in_person_compensation_id)
  WHERE in_person_compensation_id IS NOT NULL;
ALTER TABLE public.teacher_withdrawal_in_person_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_withdrawal_in_person_allocations FROM PUBLIC, anon, authenticated;

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

  SELECT
    GREATEST(COALESCE(online.amount, 0) - COALESCE(online_reserved.amount, 0), 0)
    + GREATEST(COALESCE(in_person.amount, 0) - COALESCE(in_person_reserved.amount, 0), 0)
  INTO v_available
  FROM
    (SELECT sum(e.amount) AS amount FROM public.teacher_earnings e
     WHERE e.teacher_id = NEW.teacher_id AND e.status = 'confirmed' AND e.amount > 0) online,
    (SELECT sum(a.amount) AS amount
     FROM public.teacher_withdrawal_earning_allocations a
     JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
     WHERE wr.teacher_id = NEW.teacher_id
       AND wr.status IN ('pending', 'approved', 'processing', 'paid')) online_reserved,
    (SELECT sum(src.amount) AS amount FROM (
       SELECT e.amount FROM public.in_person_teacher_earnings e
       WHERE e.teacher_id = NEW.teacher_id AND e.status = 'available'
         AND e.available_at <= now() AND e.amount > 0
       UNION ALL
       SELECT c.amount FROM public.in_person_teacher_compensations c
       WHERE c.teacher_id = NEW.teacher_id AND c.status = 'available'
         AND c.available_at <= now() AND c.amount > 0
     ) src) in_person,
    (SELECT sum(a.amount) AS amount
     FROM public.teacher_withdrawal_in_person_allocations a
     JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
     WHERE wr.teacher_id = NEW.teacher_id
       AND wr.status IN ('pending', 'approved', 'processing', 'paid')) in_person_reserved;

  IF NEW.amount > COALESCE(v_available, 0) + 0.01 THEN
    RAISE EXCEPTION 'Withdrawal amount exceeds available balance (available: %)', COALESCE(v_available, 0);
  END IF;
  RETURN NEW;
END;
$$;

-- Allocate both sources atomically under the same teacher lock. Amounts remain
-- attached to exact earning IDs; no request can reserve the same value twice.
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
    SELECT e.id, e.amount FROM public.teacher_earnings e
    WHERE e.teacher_id = NEW.teacher_id AND e.status = 'confirmed' AND e.amount > 0
      AND e.created_at <= NEW.created_at
    ORDER BY e.created_at, e.id FOR UPDATE
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

  FOR v_row IN
    SELECT e.id, e.amount FROM public.in_person_teacher_earnings e
    WHERE e.teacher_id = NEW.teacher_id AND e.status = 'available'
      AND e.available_at <= now() AND e.amount > 0
    ORDER BY e.available_at, e.created_at, e.id FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    SELECT COALESCE(sum(a.amount), 0) INTO v_allocated
    FROM public.teacher_withdrawal_in_person_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE a.in_person_earning_id = v_row.id
      AND wr.status IN ('pending', 'approved', 'processing', 'paid');
    v_available := GREATEST(v_row.amount - v_allocated, 0);
    v_take := LEAST(v_available, v_remaining);
    IF v_take > 0 THEN
      INSERT INTO public.teacher_withdrawal_in_person_allocations
        (withdrawal_request_id, in_person_earning_id, amount)
      VALUES (NEW.id, v_row.id, v_take);
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;

  FOR v_row IN
    SELECT c.id, c.amount FROM public.in_person_teacher_compensations c
    WHERE c.teacher_id = NEW.teacher_id AND c.status = 'available'
      AND c.available_at <= now() AND c.amount > 0
    ORDER BY c.available_at, c.created_at, c.id FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    SELECT COALESCE(sum(a.amount), 0) INTO v_allocated
    FROM public.teacher_withdrawal_in_person_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE a.in_person_compensation_id = v_row.id
      AND wr.status IN ('pending', 'approved', 'processing', 'paid');
    v_available := GREATEST(v_row.amount - v_allocated, 0);
    v_take := LEAST(v_available, v_remaining);
    IF v_take > 0 THEN
      INSERT INTO public.teacher_withdrawal_in_person_allocations
        (withdrawal_request_id, in_person_compensation_id, amount)
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
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::app_permission)
    AND NOT public.has_permission(auth.uid(), 'manage_teacher_payments'::app_permission) THEN
    RAISE EXCEPTION 'Not authorized to view teacher earnings' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH online AS (
    SELECT
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'confirmed'), 0) AS confirmed,
      COALESCE(sum(e.amount) FILTER (WHERE e.status IN ('pending', 'unconfirmed', 'in_progress')), 0) AS pending,
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'paid' AND e.amount > 0
        AND e.earning_type <> 'deduction'), 0) AS paid
    FROM public.teacher_earnings e WHERE e.teacher_id = _teacher_id
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
      COALESCE(sum(e.amount) FILTER (WHERE e.status IN ('available', 'paid')), 0)
        + COALESCE(sum(c.amount) FILTER (WHERE c.status IN ('available', 'paid')), 0) AS confirmed,
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'pending'), 0)
        + COALESCE(sum(c.amount) FILTER (WHERE c.status = 'pending'), 0) AS pending,
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'paid'), 0)
        + COALESCE(sum(c.amount) FILTER (WHERE c.status = 'paid'), 0) AS paid,
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'available'), 0)
        + COALESCE(sum(c.amount) FILTER (WHERE c.status = 'available'), 0) AS available
    FROM public.in_person_teacher_earnings e
    FULL JOIN public.in_person_teacher_compensations c
      ON false
    WHERE e.teacher_id = _teacher_id OR c.teacher_id = _teacher_id
  ),
  in_person_allocations AS (
    SELECT COALESCE(sum(a.amount), 0) AS allocated,
      COALESCE(sum(a.amount) FILTER (WHERE wr.status IN ('pending', 'approved', 'processing')), 0) AS reserved,
      COALESCE(sum(a.amount) FILTER (WHERE wr.status = 'paid'), 0) AS paid
    FROM public.teacher_withdrawal_in_person_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE wr.teacher_id = _teacher_id
  ),
  payments AS (
    SELECT COALESCE(sum(p.amount), 0) AS paid
    FROM public.teacher_payments p WHERE p.teacher_id = _teacher_id
  ),
  sessions AS (
    SELECT count(*)::integer AS total_sessions,
      COALESCE(sum(CASE WHEN COALESCE(s.deducted_minutes, 0) > 0
        THEN s.deducted_minutes ELSE COALESCE(s.duration_minutes, 0) END), 0)::integer AS total_minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id AND s.ended_at IS NOT NULL AND s.short_session = false
  )
  SELECT
    online.confirmed + in_person.confirmed,
    online.pending + in_person.pending,
    online.paid + in_person.paid + payments.paid,
    GREATEST(online.confirmed - online_allocations.allocated, 0)
      + GREATEST(in_person.available - in_person_allocations.allocated, 0),
    sessions.total_sessions,
    sessions.total_minutes
  FROM online CROSS JOIN online_allocations CROSS JOIN in_person
    CROSS JOIN in_person_allocations CROSS JOIN payments CROSS JOIN sessions;
END;
$$;
REVOKE ALL ON FUNCTION public.get_teacher_earnings_breakdown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_earnings_breakdown(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_teacher_withdrawal_summary(_teacher_id uuid)
RETURNS TABLE(
  online_available numeric,
  in_person_available numeric,
  in_person_compensation_available numeric,
  reserved_total numeric,
  pending_total numeric,
  paid_total numeric,
  adjustment_total numeric
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
     AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::app_permission) THEN
    RAISE EXCEPTION 'Not authorized to view teacher withdrawal summary' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH online AS (
    SELECT COALESCE(sum(e.amount), 0) AS amount
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id AND e.status = 'confirmed' AND e.amount > 0
  ),
  online_paid AS (
    SELECT COALESCE(sum(e.amount), 0) AS amount
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id AND e.status = 'paid'
      AND e.amount > 0 AND e.earning_type <> 'deduction'
  ),
  online_allocated AS (
    SELECT COALESCE(sum(a.amount), 0) AS amount,
      COALESCE(sum(a.amount) FILTER (WHERE wr.status IN ('pending', 'approved', 'processing')), 0) AS reserved
    FROM public.teacher_withdrawal_earning_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE wr.teacher_id = _teacher_id AND wr.status IN ('pending', 'approved', 'processing', 'paid')
  ),
  individual AS (
    SELECT
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'available'), 0) AS earning_available,
      COALESCE(sum(c.amount) FILTER (WHERE c.status = 'available'), 0) AS compensation_available,
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'pending'), 0)
        + COALESCE(sum(c.amount) FILTER (WHERE c.status = 'pending'), 0) AS pending,
      COALESCE(sum(e.amount) FILTER (WHERE e.status = 'paid'), 0)
        + COALESCE(sum(c.amount) FILTER (WHERE c.status = 'paid'), 0) AS paid
    FROM public.in_person_teacher_earnings e
    FULL JOIN public.in_person_teacher_compensations c ON false
    WHERE e.teacher_id = _teacher_id OR c.teacher_id = _teacher_id
  ),
  in_person_allocated AS (
    SELECT COALESCE(sum(a.amount), 0) AS amount,
      COALESCE(sum(a.amount) FILTER (WHERE wr.status IN ('pending', 'approved', 'processing')), 0) AS reserved,
      COALESCE(sum(a.amount) FILTER (WHERE wr.status = 'paid'), 0) AS paid
    FROM public.teacher_withdrawal_in_person_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE wr.teacher_id = _teacher_id
      AND wr.status IN ('pending', 'approved', 'processing', 'paid')
  ),
  payments AS (
    SELECT COALESCE(sum(p.amount), 0) AS amount
    FROM public.teacher_payments p WHERE p.teacher_id = _teacher_id
  ),
  adjustments AS (
    SELECT COALESCE(sum(e.amount), 0) AS amount
    FROM public.teacher_earnings e
    WHERE e.teacher_id = _teacher_id AND e.earning_type IN ('bonus', 'deduction')
  )
  SELECT GREATEST(online.amount - online_allocated.amount, 0),
    GREATEST(individual.earning_available - COALESCE((
      SELECT sum(a.amount) FROM public.teacher_withdrawal_in_person_allocations a
      JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
      WHERE wr.teacher_id = _teacher_id
        AND wr.status IN ('pending', 'approved', 'processing', 'paid')
        AND a.in_person_earning_id IS NOT NULL
    ), 0), 0),
    GREATEST(individual.compensation_available - COALESCE((
      SELECT sum(a.amount) FROM public.teacher_withdrawal_in_person_allocations a
      JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
      WHERE wr.teacher_id = _teacher_id
        AND wr.status IN ('pending', 'approved', 'processing', 'paid')
        AND a.in_person_compensation_id IS NOT NULL
    ), 0), 0),
    online_allocated.reserved + in_person_allocated.reserved,
    individual.pending,
    individual.paid + payments.amount + online_paid.amount,
    adjustments.amount
  FROM online CROSS JOIN online_paid CROSS JOIN online_allocated CROSS JOIN individual
    CROSS JOIN in_person_allocated CROSS JOIN payments CROSS JOIN adjustments;
END;
$$;
REVOKE ALL ON FUNCTION public.get_teacher_withdrawal_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_withdrawal_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_in_person_earnings_status()
RETURNS TABLE(
  source_id uuid,
  booking_id uuid,
  source_type text,
  amount numeric,
  status text,
  available_amount numeric,
  reserved_amount numeric,
  paid_amount numeric,
  available_at timestamptz,
  scheduled_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH sources AS (
    SELECT e.id AS source_id, e.booking_id, 'lesson'::text AS source_type,
      e.amount, e.status, e.available_at, b.scheduled_at
    FROM public.in_person_teacher_earnings e
    JOIN public.bookings b ON b.id = e.booking_id
    WHERE e.teacher_id = auth.uid()
    UNION ALL
    SELECT c.id, c.booking_id, 'compensation'::text,
      c.amount, c.status, c.available_at, b.scheduled_at
    FROM public.in_person_teacher_compensations c
    JOIN public.bookings b ON b.id = c.booking_id
    WHERE c.teacher_id = auth.uid()
  ),
  allocations AS (
    SELECT
      COALESCE(a.in_person_earning_id, a.in_person_compensation_id) AS source_id,
      COALESCE(sum(a.amount) FILTER (WHERE wr.status IN ('pending', 'approved', 'processing')), 0) AS reserved,
      COALESCE(sum(a.amount) FILTER (WHERE wr.status = 'paid'), 0) AS paid
    FROM public.teacher_withdrawal_in_person_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE wr.teacher_id = auth.uid()
      AND wr.status IN ('pending', 'approved', 'processing', 'paid')
    GROUP BY COALESCE(a.in_person_earning_id, a.in_person_compensation_id)
  ),
  amounts AS (
    SELECT s.*,
      COALESCE(a.reserved, 0) AS reserved_amount,
      CASE WHEN s.status = 'paid' THEN s.amount ELSE COALESCE(a.paid, 0) END AS paid_amount,
      CASE WHEN s.status = 'available'
        THEN GREATEST(s.amount - COALESCE(a.reserved, 0) - COALESCE(a.paid, 0), 0)
        ELSE 0 END AS available_amount
    FROM sources s LEFT JOIN allocations a ON a.source_id = s.source_id
  )
  SELECT a.source_id, a.booking_id, a.source_type, a.amount,
    CASE
      WHEN a.status = 'adjusted' THEN 'adjusted'
      WHEN a.status = 'pending' THEN 'pending'
      WHEN a.paid_amount >= a.amount AND a.amount > 0 THEN 'paid'
      WHEN a.reserved_amount > 0 THEN 'reserved'
      WHEN a.paid_amount > 0 AND a.available_amount > 0 THEN 'partially_paid'
      ELSE a.status
    END,
    a.available_amount, a.reserved_amount, a.paid_amount, a.available_at, a.scheduled_at
  FROM amounts a
  ORDER BY a.scheduled_at DESC, a.source_type;
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_in_person_earnings_status()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_in_person_earnings_status()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_own_withdrawal_request(_withdrawal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _request
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND OR _request.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;
  IF _request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending withdrawal requests can be cancelled';
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'cancelled',
      teacher_notes = concat_ws(E'\n', NULLIF(teacher_notes, ''), 'ألغاه المعلم'),
      updated_at = now()
  WHERE id = _withdrawal_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_own_withdrawal_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_withdrawal_request(uuid) TO authenticated;
