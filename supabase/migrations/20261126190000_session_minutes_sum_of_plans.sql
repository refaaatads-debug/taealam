-- PREVIEW ONLY. Not applied. Apply manually in one transaction after a backup.
-- Session minutes: use the SUM of the student's active plans for both the server auto-close
-- and settlement (billing), like the live screen does. Before this, both used ONE plan.
-- Rollback: rollbacks_20261126190000_session_minutes_sum_of_plans.sql (restores previous definitions).
CREATE OR REPLACE FUNCTION public.auto_complete_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_duration_minutes integer;
  v_actual_seconds numeric;
  v_vat_rate numeric := 15;
  v_hourly_rate numeric;
  v_gross numeric := 0;
  v_vat_amount numeric := 0;
  v_teacher_base numeric := 0;
  v_platform_fee numeric := 0;
  v_row record;
  v_take integer;
  v_left integer;
  v_available integer := 0;
  v_requested_minutes integer;
  v_updated integer;
BEGIN
  IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = NEW.booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session has no booking' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.delivery_mode = 'in_person' THEN
    RETURN NEW;
  END IF;

  IF NEW.started_at IS NULL OR NEW.ended_at <= NEW.started_at THEN
    RAISE EXCEPTION 'Session start and end times are invalid' USING ERRCODE = '22023';
  END IF;
  v_actual_seconds := CASE
    WHEN NEW.duration_seconds > 0 THEN NEW.duration_seconds
    ELSE EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))
  END;
  IF v_actual_seconds <= 0 OR v_actual_seconds > 14400 THEN
    RAISE EXCEPTION 'Actual session duration is outside the allowed range'
      USING ERRCODE = '22023';
  END IF;
  v_duration_minutes := CEIL(v_actual_seconds / 60.0)::integer;
  v_requested_minutes := v_duration_minutes;

  -- Clamp to the student's TOTAL active minutes across all plans (same total the live
  -- screen shows). Rows are locked so a parallel settlement cannot spend them twice.
  SELECT COALESCE(SUM(q.remaining_minutes), 0)::integer INTO v_available
  FROM (
    SELECT s.remaining_minutes
    FROM public.user_subscriptions s
    WHERE s.user_id = v_booking.student_id
      AND s.is_active
      AND s.remaining_minutes > 0
    FOR UPDATE
  ) q;
  IF v_duration_minutes > v_available THEN
    v_duration_minutes := v_available;
  END IF;

  NEW.duration_minutes := v_duration_minutes;
  NEW.unbilled_minutes := GREATEST(0, v_requested_minutes - v_duration_minutes);

  IF v_duration_minutes < 5 THEN
    NEW.short_session := true;
    NEW.deducted_minutes := 0;
    NEW.teacher_earning := 0;
    NEW.gross_amount := 0;
    NEW.platform_fee := 0;
    NEW.teacher_base_amount := 0;
    NEW.vat_amount := 0;
    NEW.net_amount := 0;
    UPDATE public.bookings SET status = 'completed' WHERE id = NEW.booking_id;
    RETURN NEW;
  END IF;

  v_hourly_rate := COALESCE(
    v_booking.teacher_hourly_rate_snapshot,
    (SELECT tp.hourly_rate FROM public.teacher_profiles tp WHERE tp.user_id = v_booking.teacher_id)
  );
  IF v_hourly_rate IS NULL OR v_hourly_rate <= 0 OR v_hourly_rate > 1000 THEN
    RAISE EXCEPTION 'Saved teacher hourly rate is missing or outside the allowed range'
      USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(fs.vat_rate, 15) INTO v_vat_rate
  FROM public.financial_settings fs
  ORDER BY fs.updated_at DESC
  LIMIT 1;

  -- Preserve the 60-SAR gross base and net teacher hourly-rate formula.
  v_gross := ROUND((v_duration_minutes::numeric / 60.0) * 60.0, 2);
  v_vat_amount := ROUND(v_gross * v_vat_rate / (100.0 + v_vat_rate), 2);
  v_teacher_base := ROUND((v_duration_minutes::numeric / 60.0) * v_hourly_rate, 2);
  v_platform_fee := ROUND(v_gross - v_teacher_base, 2);
  NEW.short_session := false;
  NEW.deducted_minutes := v_duration_minutes;
  NEW.gross_amount := v_gross;
  NEW.vat_amount := v_vat_amount;
  NEW.vat_rate_snapshot := v_vat_rate;
  NEW.teacher_base_amount := v_teacher_base;
  NEW.teacher_earning := v_teacher_base;
  NEW.platform_fee := v_platform_fee;
  NEW.platform_fee_rate_snapshot := ROUND((v_gross - v_teacher_base) / NULLIF(v_gross, 0), 6);
  NEW.net_amount := v_teacher_base;

  -- Take the minutes from the booking's own plan first, then the other active plans
  -- (soonest to end first), so a session can use the whole balance.
  v_left := v_duration_minutes;
  FOR v_row IN
    SELECT s.id, s.remaining_minutes
    FROM public.user_subscriptions s
    WHERE s.user_id = v_booking.student_id
      AND s.is_active
      AND s.remaining_minutes > 0
    ORDER BY CASE WHEN s.id = v_booking.subscription_id THEN 0 ELSE 1 END, s.ends_at, s.created_at
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_row.remaining_minutes, v_left);
    UPDATE public.user_subscriptions
    SET remaining_minutes = remaining_minutes - v_take
    WHERE id = v_row.id
      AND remaining_minutes >= v_take;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Package balance changed before session settlement'
        USING ERRCODE = '40001';
    END IF;
    v_left := v_left - v_take;
  END LOOP;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'Package balance changed before session settlement'
      USING ERRCODE = '40001';
  END IF;
  UPDATE public.bookings SET status = 'completed' WHERE id = NEW.booking_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_stale_sessions(p_stale_after interval DEFAULT '00:10:00'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_limited integer := 0;
BEGIN
  WITH stale AS (
    SELECT s.id, s.started_at, s.last_heartbeat_at
    FROM public.sessions s
    WHERE s.ended_at IS NULL
      AND s.started_at IS NOT NULL
      AND s.last_heartbeat_at IS NOT NULL
      AND s.last_heartbeat_at < now() - p_stale_after
      -- never settle more than the hard duration cap the trigger allows
      AND s.last_heartbeat_at > s.started_at
  ), closed AS (
    UPDATE public.sessions s
    SET ended_at = LEAST(stale.last_heartbeat_at, stale.started_at + interval '4 hours'),
        duration_seconds = LEAST(14400, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (stale.last_heartbeat_at - stale.started_at)))::integer))
    FROM stale
    WHERE s.id = stale.id
      AND s.ended_at IS NULL
    RETURNING s.id
  )
  SELECT count(*) INTO v_count FROM closed;

  -- Auto-close when the student's minutes run out (server-side backstop; the
  -- teacher's client already ends at the limit, this covers its absence).
  WITH limits AS (
    SELECT s.id,
           s.started_at,
           FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer AS elapsed_seconds,
           sub.remaining_minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    JOIN LATERAL (
      SELECT COALESCE(SUM(sub.remaining_minutes), 0)::integer AS remaining_minutes
      FROM public.user_subscriptions sub
      WHERE sub.user_id = b.student_id
        AND sub.is_active
        AND sub.remaining_minutes > 0
    ) sub ON true
    WHERE s.ended_at IS NULL
      AND s.started_at IS NOT NULL
      -- heartbeat-capable sessions only: without a live heartbeat we cannot
      -- trust elapsed, and ending an old row would bill days of wall-clock
      AND s.last_heartbeat_at IS NOT NULL
      AND sub.remaining_minutes > 0
      AND EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)) >= sub.remaining_minutes * 60
  ), closed AS (
    UPDATE public.sessions s
    SET ended_at = limits.started_at + make_interval(secs => limits.remaining_minutes * 60),
        duration_seconds = LEAST(14400, limits.elapsed_seconds, limits.remaining_minutes * 60)
    FROM limits
    WHERE s.id = limits.id
      AND s.ended_at IS NULL
    RETURNING s.id
  )
  SELECT count(*) INTO v_limited FROM closed;

  RETURN v_count + v_limited;
END;
$function$;
