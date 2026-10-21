-- Reconcile the in-person session lifecycle with pre-created session rows.
-- The generic booking trigger can create the session before attendance is
-- confirmed, so the confirmation RPC must upsert rather than ignore conflicts.

CREATE OR REPLACE FUNCTION public.confirm_in_person_attendance_code(
  p_booking_id uuid,
  p_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_code public.in_person_attendance_codes%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
  v_started_at timestamptz;
  v_duration integer;
  v_updated integer;
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND student_id = v_student_id
    AND delivery_mode = 'in_person'
  FOR UPDATE;

  IF NOT FOUND
     OR v_booking.status::text <> 'confirmed'
     OR now() < v_booking.scheduled_at
     OR now() >= v_booking.scheduled_at + interval '15 minutes' THEN
    RAISE EXCEPTION 'Attendance code cannot be confirmed at this time'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_code
  FROM public.in_person_attendance_codes
  WHERE booking_id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance code is missing' USING ERRCODE = 'P0002';
  END IF;

  IF v_code.confirmed_at IS NOT NULL THEN
    RETURN true;
  END IF;
  IF v_code.invalidated_at IS NOT NULL OR v_code.attempts >= 5 THEN
    RAISE EXCEPTION 'Attendance code is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation
  FROM public.in_person_credit_reservations
  WHERE booking_id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND OR v_reservation.status <> 'reserved'
     OR v_reservation.reserved_minutes <> 100 THEN
    RAISE EXCEPTION 'In-person credit reservation is not available'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sessions
    WHERE booking_id = p_booking_id AND ended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'In-person session already has an end time'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_code.code_value <> p_code THEN
    UPDATE public.in_person_attendance_codes
    SET attempts = attempts + 1,
        invalidated_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE NULL END
    WHERE booking_id = p_booking_id;
    RETURN false;
  END IF;

  v_started_at := clock_timestamp();
  v_duration := COALESCE(
    v_booking.instruction_duration_minutes,
    v_booking.duration_minutes,
    60
  );
  IF v_duration NOT IN (45, 60) THEN
    RAISE EXCEPTION 'Saved in-person teaching duration is invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.in_person_attendance_codes
  SET confirmed_at = v_started_at
  WHERE booking_id = p_booking_id;

  UPDATE public.bookings
  SET attendance_confirmed_at = v_started_at,
      session_status = 'in_progress'
  WHERE id = p_booking_id;

  -- The attendance timestamp is the teaching start. Credit debit remains the
  -- separate 100-minute reservation settled below.
  INSERT INTO public.sessions AS existing (
    booking_id, started_at, duration_minutes, duration_seconds
  )
  VALUES (p_booking_id, v_started_at, v_duration, v_duration * 60)
  ON CONFLICT (booking_id) DO UPDATE
  SET started_at = COALESCE(existing.started_at, EXCLUDED.started_at),
      duration_minutes = CASE
        WHEN existing.started_at IS NOT NULL
          AND COALESCE(existing.duration_minutes, 0) > 0
          THEN existing.duration_minutes
        ELSE EXCLUDED.duration_minutes
      END,
      duration_seconds = CASE
        WHEN existing.started_at IS NOT NULL
          AND COALESCE(existing.duration_seconds, 0) > 0
          THEN existing.duration_seconds
        ELSE EXCLUDED.duration_seconds
      END
  WHERE existing.ended_at IS NULL;

  UPDATE public.in_person_credit_reservations
  SET status = 'consumed', consumed_minutes = 100, settled_at = v_started_at
  WHERE id = v_reservation.id AND status = 'reserved';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'In-person credit could not be settled'
      USING ERRCODE = 'P0001';
  END IF;

  -- Do not make a teacher earning available before the confirmed lesson's
  -- saved teaching duration has elapsed.
  UPDATE public.in_person_teacher_earnings
  SET available_at = v_started_at + make_interval(mins => v_duration)
  WHERE booking_id = p_booking_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Pending in-person teacher earning is missing'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_in_person_attendance_code(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_in_person_attendance_code(uuid, text)
  TO authenticated;

-- Keep completion and release in one transaction; do not use the old
-- scheduled_at-based availability timestamp as proof that teaching completed.
CREATE OR REPLACE FUNCTION public.process_in_person_session_completions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_completed integer;
  v_released integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  WITH due AS (
    SELECT b.id
    FROM public.bookings b
    WHERE b.delivery_mode = 'in_person'
      AND b.status::text = 'confirmed'
      AND b.session_status = 'in_progress'
      AND b.attendance_confirmed_at IS NOT NULL
      AND COALESCE(b.instruction_duration_minutes, b.duration_minutes) IN (45, 60)
      AND now() >= b.attendance_confirmed_at
        + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.bookings b
  SET status = 'completed',
      session_status = 'completed'
  FROM due
  WHERE b.id = due.id
    AND b.status::text = 'confirmed'
    AND b.session_status = 'in_progress'
    AND b.attendance_confirmed_at IS NOT NULL;
  GET DIAGNOSTICS v_completed = ROW_COUNT;

  -- A separate statement lets the release guard see the completed state
  -- written above while keeping completion and payment availability atomic.
  UPDATE public.in_person_teacher_earnings e
  SET status = 'available'
  FROM public.bookings b
  WHERE b.id = e.booking_id
    AND b.delivery_mode = 'in_person'
    AND b.status::text = 'completed'
    AND b.session_status = 'completed'
    AND b.attendance_confirmed_at IS NOT NULL
    AND COALESCE(b.instruction_duration_minutes, b.duration_minutes) IN (45, 60)
    AND now() >= b.attendance_confirmed_at
      + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes))
    AND e.status = 'pending'
    AND e.available_at <= now();
  GET DIAGNOSTICS v_released = ROW_COUNT;

  IF v_released < v_completed THEN
    RAISE EXCEPTION 'In-person completion could not release its matching teacher earning'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_completed;
END;
$$;

REVOKE ALL ON FUNCTION public.process_in_person_session_completions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_in_person_session_completions()
  TO service_role;

-- Also protect availability transitions initiated by the deadline worker.
-- If the lesson is not complete yet, keep the earning pending; the completion
-- worker will release it atomically when the saved duration has elapsed.
CREATE OR REPLACE FUNCTION public.guard_in_person_teacher_earning_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IN ('available', 'paid')
     AND OLD.status = 'pending'
     AND NOT EXISTS (
       SELECT 1
       FROM public.bookings b
       WHERE b.id = NEW.booking_id
         AND b.delivery_mode = 'in_person'
         AND b.status::text = 'completed'
         AND b.session_status = 'completed'
         AND b.attendance_confirmed_at IS NOT NULL
         AND COALESCE(b.instruction_duration_minutes, b.duration_minutes) IN (45, 60)
         AND now() >= b.attendance_confirmed_at
           + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes))
     ) THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_in_person_teacher_earning_release
  ON public.in_person_teacher_earnings;
CREATE TRIGGER guard_in_person_teacher_earning_release
  BEFORE UPDATE OF status ON public.in_person_teacher_earnings
  FOR EACH ROW EXECUTE FUNCTION public.guard_in_person_teacher_earning_release();

REVOKE ALL ON FUNCTION public.guard_in_person_teacher_earning_release()
  FROM PUBLIC, anon, authenticated;
