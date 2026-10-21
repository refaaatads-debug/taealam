-- Use Saudi calendar months for future automatic rollups. Existing ledger
-- rows retain their saved month and amount; no historical rows are repriced.
CREATE OR REPLACE FUNCTION public.auto_create_teacher_earning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid;
  v_delivery_mode text;
  v_month text;
  v_marker text;
  v_claimed integer;
  v_claim_teacher uuid;
  v_claim_month text;
  v_rollup public.teacher_earnings%ROWTYPE;
BEGIN
  IF NEW.ended_at IS NULL
     OR OLD.ended_at IS NOT NULL
     OR NEW.short_session IS DISTINCT FROM false
     OR COALESCE(NEW.teacher_earning, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT b.teacher_id, b.delivery_mode
  INTO v_teacher_id, v_delivery_mode
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;
  IF NOT FOUND OR v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Session earning has no assigned teacher'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_delivery_mode IS DISTINCT FROM 'online' THEN
    RETURN NEW;
  END IF;

  v_month := to_char(NEW.ended_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM');
  v_marker := 'auto:session:' || NEW.id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'auto-session-earning:' || v_teacher_id::text || ':' || v_month, 0
  ));

  INSERT INTO public.teacher_session_earning_claims (
    session_id, teacher_id, earning_month, amount
  )
  VALUES (NEW.id, v_teacher_id, v_month, NEW.teacher_earning)
  ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    SELECT teacher_id, earning_month
    INTO v_claim_teacher, v_claim_month
    FROM public.teacher_session_earning_claims
    WHERE session_id = NEW.id;
    IF NOT FOUND OR v_claim_teacher IS DISTINCT FROM v_teacher_id
       OR v_claim_month IS DISTINCT FROM v_month THEN
      RAISE EXCEPTION 'Session earning claim conflicts with its saved teacher or month'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_rollup
  FROM public.teacher_earnings e
  WHERE e.teacher_id = v_teacher_id
    AND e.month = v_month
    AND e.earning_type = 'monthly_transfer'
    AND e.status = 'unconfirmed'
    AND e.notes LIKE 'auto:session:%'
  ORDER BY e.created_at, e.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF strpos(COALESCE(v_rollup.notes, ''), v_marker) > 0 THEN
      RETURN NEW;
    END IF;
    UPDATE public.teacher_earnings
    SET amount = amount + NEW.teacher_earning,
        gross_amount = COALESCE(gross_amount, 0) + COALESCE(NEW.gross_amount, 0),
        platform_fee = COALESCE(platform_fee, 0) + COALESCE(NEW.platform_fee, 0),
        teacher_base_amount = COALESCE(teacher_base_amount, 0)
          + COALESCE(NEW.teacher_base_amount, 0),
        net_amount = COALESCE(net_amount, 0)
          + COALESCE(NEW.net_amount, NEW.teacher_earning),
        vat_amount = COALESCE(vat_amount, 0) + COALESCE(NEW.vat_amount, 0),
        hours = COALESCE(hours, 0)
          + ROUND(COALESCE(NEW.duration_minutes, 0)::numeric / 60.0, 4),
        minutes_snapshot = COALESCE(minutes_snapshot, 0)
          + COALESCE(NEW.duration_minutes, 0),
        total_sessions_snapshot = COALESCE(total_sessions_snapshot, 0) + 1,
        notes = concat_ws(', ', NULLIF(notes, ''), v_marker)
    WHERE id = v_rollup.id;
  ELSE
    INSERT INTO public.teacher_earnings (
      teacher_id, amount, gross_amount, platform_fee, teacher_base_amount,
      net_amount, vat_amount, vat_rate_snapshot, platform_fee_rate_snapshot,
      hours, minutes_snapshot, total_sessions_snapshot, month, status,
      earning_type, notes
    )
    VALUES (
      v_teacher_id, NEW.teacher_earning, COALESCE(NEW.gross_amount, 0),
      COALESCE(NEW.platform_fee, 0), COALESCE(NEW.teacher_base_amount, 0),
      COALESCE(NEW.net_amount, NEW.teacher_earning), COALESCE(NEW.vat_amount, 0),
      COALESCE(NEW.vat_rate_snapshot, 0), COALESCE(NEW.platform_fee_rate_snapshot, 0),
      ROUND(COALESCE(NEW.duration_minutes, 0)::numeric / 60.0, 4),
      COALESCE(NEW.duration_minutes, 0), 1, v_month, 'unconfirmed',
      'monthly_transfer', v_marker
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Include the saved request subject and the actual package-credit settlement
-- in admin reporting. Teaching duration remains a separate booking snapshot.
DROP FUNCTION IF EXISTS public.admin_list_in_person_financials();
CREATE FUNCTION public.admin_list_in_person_financials()
RETURNS TABLE(
  booking_id uuid,
  teacher_id uuid,
  scheduled_at timestamptz,
  teacher_earning numeric,
  teacher_earning_status text,
  teacher_compensation numeric,
  compensation_status text,
  platform_revenue numeric,
  revenue_events integer,
  subject_id uuid,
  package_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.id, b.teacher_id, b.scheduled_at,
         COALESCE(e.amount, 0), e.status,
         COALESCE(c.amount, 0), c.status,
         COALESCE(r.amount, 0), COALESCE(r.event_count, 0),
         COALESCE(b.subject_id, g.subject_id),
         CASE
           WHEN credit.status IN ('consumed', 'partially_settled')
             THEN COALESCE(credit.consumed_minutes, 0)
           ELSE 0
         END::integer
  FROM public.bookings b
  LEFT JOIN public.in_person_teacher_earnings e ON e.booking_id = b.id
  LEFT JOIN (
    SELECT compensation.booking_id, sum(compensation.amount)::numeric AS amount,
           max(compensation.status::text) AS status
    FROM public.in_person_teacher_compensations compensation
    GROUP BY compensation.booking_id
  ) c ON c.booking_id = b.id
  LEFT JOIN (
    SELECT revenue.booking_id, sum(revenue.amount)::numeric AS amount,
           count(*)::integer AS event_count
    FROM public.in_person_platform_revenue revenue
    GROUP BY revenue.booking_id
  ) r ON r.booking_id = b.id
  LEFT JOIN LATERAL (
    SELECT reservation.request_group_id, reservation.status,
           reservation.consumed_minutes
    FROM public.in_person_credit_reservations reservation
    WHERE reservation.booking_id = b.id
    ORDER BY reservation.created_at DESC, reservation.id
    LIMIT 1
  ) credit ON true
  LEFT JOIN public.in_person_request_groups g ON g.id = credit.request_group_id
  WHERE b.delivery_mode = 'in_person'
  ORDER BY b.scheduled_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_in_person_financials()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_in_person_financials()
  TO authenticated;

-- A month report aggregates stored online earnings and the dedicated
-- in-person earning/compensation ledgers without deriving money from rates.
CREATE OR REPLACE FUNCTION public.get_teacher_month_earnings_split(
  _teacher_id uuid,
  _month text DEFAULT NULL
)
RETURNS TABLE(
  online_earnings numeric,
  in_person_earnings numeric,
  in_person_compensations numeric,
  combined_earnings numeric,
  online_sessions integer,
  in_person_sessions integer,
  online_minutes integer,
  in_person_teaching_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _teacher_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::public.app_permission)
     AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::public.app_permission) THEN
    RAISE EXCEPTION 'Not authorized to view teacher earnings'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH online AS (
    SELECT COALESCE(sum(COALESCE(s.teacher_earning, s.net_amount, 0)), 0)::numeric AS amount,
           count(*)::integer AS sessions,
           COALESCE(sum(CASE WHEN COALESCE(s.deducted_minutes, 0) > 0
             THEN s.deducted_minutes ELSE ceil(COALESCE(s.duration_seconds, 0)::numeric / 60)::integer END), 0)::integer AS minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.teacher_id = _teacher_id
      AND b.delivery_mode = 'online'
      AND s.ended_at IS NOT NULL
      AND s.short_session = false
      AND (_month IS NULL OR to_char(s.ended_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = _month)
  ),
  in_person AS (
    SELECT COALESCE(sum(e.amount), 0)::numeric AS amount,
           count(DISTINCT b.id)::integer AS sessions,
           COALESCE(sum(COALESCE(b.in_person_teaching_minutes,
             b.instruction_duration_minutes, b.duration_minutes)), 0)::integer AS minutes
    FROM public.in_person_teacher_earnings e
    JOIN public.bookings b ON b.id = e.booking_id
    WHERE e.teacher_id = _teacher_id
      AND b.status::text = 'completed'
      AND b.attendance_confirmed_at IS NOT NULL
      AND (_month IS NULL OR to_char(b.attendance_confirmed_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = _month)
  ),
  compensations AS (
    SELECT COALESCE(sum(c.amount), 0)::numeric AS amount
    FROM public.in_person_teacher_compensations c
    JOIN public.bookings b ON b.id = c.booking_id
    WHERE c.teacher_id = _teacher_id
      AND (_month IS NULL OR to_char(COALESCE(b.attendance_confirmed_at, b.scheduled_at)
        AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = _month)
  )
  SELECT o.amount, p.amount, c.amount, o.amount + p.amount + c.amount,
         o.sessions, p.sessions, o.minutes, p.minutes
  FROM online o CROSS JOIN in_person p CROSS JOIN compensations c;
END;
$$;
REVOKE ALL ON FUNCTION public.get_teacher_month_earnings_split(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_month_earnings_split(uuid, text)
  TO authenticated;
