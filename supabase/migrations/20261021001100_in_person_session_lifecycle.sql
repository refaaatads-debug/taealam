-- Start an in-person session when the student confirms the teacher's attendance
-- code. In-person package credits and earnings are settled by the dedicated
-- reservation/settlement flow, so this path must not invoke online accounting.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;

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
  v_started_at timestamptz := now();
  v_duration integer;
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

  IF v_code.confirmed_at IS NOT NULL THEN
    RETURN true;
  END IF;
  IF v_code.invalidated_at IS NOT NULL OR v_code.attempts >= 5 THEN
    RAISE EXCEPTION 'Attendance code is unavailable' USING ERRCODE = '42501';
  END IF;
  IF v_code.code_value <> p_code THEN
    UPDATE public.in_person_attendance_codes
    SET attempts = attempts + 1,
        invalidated_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE NULL END
    WHERE booking_id = p_booking_id;
    RETURN false;
  END IF;

  v_duration := COALESCE(
    v_booking.instruction_duration_minutes,
    v_booking.duration_minutes,
    60
  );

  UPDATE public.in_person_attendance_codes
  SET confirmed_at = v_started_at
  WHERE booking_id = p_booking_id;

  UPDATE public.bookings
  SET attendance_confirmed_at = v_started_at,
      session_status = 'in_progress'
  WHERE id = p_booking_id;

  -- Do not set ended_at here: the generic online session trigger performs
  -- online subscription and earnings accounting when ended_at changes.
  INSERT INTO public.sessions (booking_id, started_at, duration_minutes, duration_seconds)
  VALUES (p_booking_id, v_started_at, v_duration, v_duration * 60)
  ON CONFLICT (booking_id) DO NOTHING;

  UPDATE public.in_person_credit_reservations
  SET status = 'consumed', consumed_minutes = 100, settled_at = v_started_at
  WHERE booking_id = p_booking_id
    AND status = 'reserved';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_in_person_attendance_code(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_in_person_attendance_code(uuid, text)
  TO authenticated;

-- Repair rows confirmed by the earlier flow: they consumed attendance but
-- never moved into the live-session state or created a session history row.
INSERT INTO public.sessions (booking_id, started_at, duration_minutes, duration_seconds)
SELECT b.id,
       b.attendance_confirmed_at,
       COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60),
       COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60) * 60
FROM public.bookings b
WHERE b.delivery_mode = 'in_person'
  AND b.attendance_confirmed_at IS NOT NULL
ON CONFLICT (booking_id) DO NOTHING;

UPDATE public.sessions s
SET duration_minutes = COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60),
    duration_seconds = COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60) * 60
FROM public.bookings b
WHERE b.id = s.booking_id
  AND b.delivery_mode = 'in_person'
  AND b.attendance_confirmed_at IS NOT NULL;

UPDATE public.bookings
SET session_status = 'in_progress'
WHERE delivery_mode = 'in_person'
  AND status::text = 'confirmed'
  AND attendance_confirmed_at IS NOT NULL
  AND session_status IS DISTINCT FROM 'in_progress';

-- The already configured pg_cron worker calls this once per minute. Keep
-- completion idempotent and use the duration snapshot on the booking.
CREATE OR REPLACE FUNCTION public.process_in_person_session_completions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_completed integer;
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
      AND now() >= b.attendance_confirmed_at
        + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.bookings b
  SET status = 'completed',
      session_status = 'completed'
  FROM due
  WHERE b.id = due.id
    AND b.status::text = 'confirmed'
    AND b.session_status = 'in_progress';

  GET DIAGNOSTICS v_completed = ROW_COUNT;
  RETURN v_completed;
END;
$$;

REVOKE ALL ON FUNCTION public.process_in_person_session_completions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_in_person_session_completions()
  TO service_role;

DO $$
DECLARE
  v_pg_cron_available boolean;
  v_job_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) INTO v_pg_cron_available;

  IF NOT v_pg_cron_available OR to_regnamespace('cron') IS NULL
     OR to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron unavailable; in-person session completion must be scheduled by deployment';
    RETURN;
  END IF;

  EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
    INTO v_job_exists
    USING 'process-in-person-session-completions';

  IF NOT v_job_exists THEN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING 'process-in-person-session-completions', '* * * * *',
        'SET request.jwt.claim.role = ''service_role''; SELECT public.process_in_person_session_completions();';
  END IF;
END;
$$;
