-- Session reliability pack (2/4): settle-or-clamp instead of raising.
-- NOT YET APPLIED to production. Prepared 2026-11-25; apply only with the
-- owner's approval.
--
-- Problem: auto_complete_session RAISES 'Insufficient active package balance'
-- when the student's remaining minutes are below the session's duration. Any
-- end-session write then fails (client direct write, end_live_session RPC, or
-- the sweeper), so the session row stays open forever, billing never settles,
-- and every retry only makes the wall-clock duration larger. This is the
-- stale-open-session deadlock seen in production.
--
-- Change: clamp the settled duration to the student's available balance
-- instead of raising. The student is charged at most what they have; the
-- teacher is paid for the clamped minutes; the shortfall is recorded in
-- sessions.unbilled_minutes for review. When nothing is available the session
-- settles as a short session (deducted 0, earning 0) instead of erroring.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS unbilled_minutes integer NOT NULL DEFAULT 0;

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
  v_sub_id uuid;
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

  -- Clamp to what the student actually has so settlement can never fail.
  -- Prefer the booking's own subscription; fall back to any active one.
  SELECT s.id, s.remaining_minutes INTO v_sub_id, v_available
  FROM public.user_subscriptions s
  WHERE s.id = v_booking.subscription_id
    AND s.user_id = v_booking.student_id
    AND s.is_active
  FOR UPDATE;
  IF v_sub_id IS NULL THEN
    SELECT s.id, s.remaining_minutes INTO v_sub_id, v_available
    FROM public.user_subscriptions s
    WHERE s.user_id = v_booking.student_id
      AND s.is_active
    ORDER BY s.ends_at, s.created_at
    LIMIT 1
    FOR UPDATE;
  END IF;
  v_available := COALESCE(v_available, 0);
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

  UPDATE public.user_subscriptions
  SET remaining_minutes = remaining_minutes - v_duration_minutes
  WHERE id = v_sub_id
    AND remaining_minutes >= v_duration_minutes;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Package balance changed before session settlement'
      USING ERRCODE = '40001';
  END IF;
  UPDATE public.bookings SET status = 'completed' WHERE id = NEW.booking_id;
  RETURN NEW;
END;
$function$;
