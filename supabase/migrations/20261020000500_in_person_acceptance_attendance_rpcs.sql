CREATE TABLE IF NOT EXISTS public.in_person_teacher_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric(10,2) NOT NULL CHECK (amount = 60),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'paid', 'adjusted')),
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.in_person_teacher_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_person_teacher_earnings
  DROP CONSTRAINT IF EXISTS in_person_teacher_earnings_amount_check;
ALTER TABLE public.in_person_teacher_earnings
  ADD CONSTRAINT in_person_teacher_earnings_amount_check CHECK (amount IN (0, 60));
REVOKE ALL ON public.in_person_teacher_earnings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_in_person_request(p_request_group_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_group public.in_person_request_groups%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
  v_booking_id uuid;
BEGIN
  IF v_teacher_id IS NULL
     OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group
  FROM public.in_person_request_groups
  WHERE id = p_request_group_id
  FOR UPDATE;
  IF NOT FOUND OR v_group.status <> 'open' THEN
    RAISE EXCEPTION 'Request is no longer available' USING ERRCODE = 'P0002';
  END IF;
  IF now() >= v_group.acceptance_deadline THEN
    RAISE EXCEPTION 'Acceptance closed one hour before the lesson'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.in_person_request_recipients r
  WHERE r.request_group_id = v_group.id
    AND r.teacher_id = v_teacher_id
    AND r.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Teacher is not an eligible recipient' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'in-person-student:' || v_group.student_id::text || ':' ||
      (v_group.scheduled_at AT TIME ZONE 'UTC')::date::text,
    0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'in-person-teacher:' || v_teacher_id::text || ':' ||
      (v_group.scheduled_at AT TIME ZONE 'UTC')::date::text,
    0
  ));

  IF NOT EXISTS (
    SELECT 1
    FROM public.teacher_profiles tp
    JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = v_teacher_id
      AND tp.is_approved
      AND tp.in_person_enabled
      AND tp.in_person_approval_status = 'approved'
      AND tp.city_id = v_group.city_id
      AND tp.in_person_latitude IS NOT NULL
      AND tp.in_person_longitude IS NOT NULL
      AND tp.in_person_service_radius_km IS NOT NULL
      AND round((6371 * acos(least(1.0, greatest(-1.0,
        sin(radians((v_group.visit_address_snapshot->>'latitude')::double precision))
          * sin(radians(tp.in_person_latitude))
        + cos(radians((v_group.visit_address_snapshot->>'latitude')::double precision))
          * cos(radians(tp.in_person_latitude))
          * cos(radians(tp.in_person_longitude - (v_group.visit_address_snapshot->>'longitude')::double precision))
      ))))::numeric, 1) <= tp.in_person_service_radius_km
      AND ts.subject_id = v_group.subject_id
  ) THEN
    RAISE EXCEPTION 'Teacher eligibility changed' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.teacher_id = v_teacher_id
      AND b.status::text IN ('pending', 'confirmed')
      AND tstzrange(b.scheduled_at - interval '30 minutes',
        b.scheduled_at + make_interval(mins =>
          COALESCE(b.instruction_duration_minutes, b.duration_minutes)) + interval '30 minutes', '[)')
        && tstzrange(v_group.scheduled_at, v_group.scheduled_at + interval '60 minutes', '[)')
  ) OR EXISTS (
    SELECT 1 FROM public.booking_requests r
    WHERE r.accepted_by = v_teacher_id
      AND r.status = 'accepted'
      AND tstzrange(r.scheduled_at - interval '30 minutes',
        r.scheduled_at + make_interval(mins => COALESCE(r.duration_minutes, 60)) + interval '30 minutes', '[)')
        && tstzrange(v_group.scheduled_at, v_group.scheduled_at + interval '60 minutes', '[)')
  ) OR EXISTS (
    SELECT 1
    FROM public.in_person_request_groups g
    JOIN public.in_person_request_recipients r ON r.request_group_id = g.id
    WHERE g.status = 'accepted'
      AND r.teacher_id = v_teacher_id
      AND r.status = 'accepted'
      AND tstzrange(g.scheduled_at - interval '30 minutes',
        g.scheduled_at + interval '90 minutes', '[)')
        && tstzrange(v_group.scheduled_at, v_group.scheduled_at + interval '60 minutes', '[)')
  ) THEN
    RAISE EXCEPTION 'Teacher has a booking or travel-time conflict'
      USING ERRCODE = '23P01';
  END IF;

  SELECT * INTO v_reservation
  FROM public.in_person_credit_reservations
  WHERE request_group_id = v_group.id
    AND status = 'reserved'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserved package credit is missing' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.in_person_request_recipients
  SET status = CASE WHEN teacher_id = v_teacher_id THEN 'accepted' ELSE 'closed' END,
      responded_at = now()
  WHERE request_group_id = v_group.id;

  UPDATE public.in_person_request_groups
  SET status = 'accepted', updated_at = now()
  WHERE id = v_group.id;

  INSERT INTO public.bookings (
    student_id, teacher_id, subject_id, scheduled_at, duration_minutes,
    status, price, used_subscription, subscription_id, delivery_mode,
    instruction_duration_minutes, balance_cost_minutes,
    visit_address_snapshot, in_person_policy_version
  )
  VALUES (
    v_group.student_id, v_teacher_id, v_group.subject_id, v_group.scheduled_at, 60,
    'confirmed', 0, true, v_reservation.subscription_id, 'in_person',
    60, 100, v_group.visit_address_snapshot, v_group.policy_version
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.in_person_attendance_codes(booking_id, code_value)
  VALUES (v_booking_id, lpad(floor(random() * 10000)::integer::text, 4, '0'));

  UPDATE public.in_person_credit_reservations
  SET booking_id = v_booking_id
  WHERE id = v_reservation.id;

  INSERT INTO public.in_person_teacher_earnings(booking_id, teacher_id, amount, available_at)
  VALUES (v_booking_id, v_teacher_id, 60, v_group.scheduled_at + interval '60 minutes');

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_in_person_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_in_person_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_in_person_attendance_code(p_booking_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_code text;
BEGIN
  IF v_teacher_id IS NULL
     OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND teacher_id = v_teacher_id
    AND delivery_mode = 'in_person';
  IF NOT FOUND OR now() < v_booking.scheduled_at - interval '60 minutes'
     OR now() >= v_booking.scheduled_at + interval '15 minutes' THEN
    RAISE EXCEPTION 'Attendance code is not available at this time'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.in_person_attendance_codes
  SET revealed_at = COALESCE(revealed_at, now())
  WHERE booking_id = p_booking_id
    AND confirmed_at IS NULL
    AND invalidated_at IS NULL
  RETURNING code_value INTO v_code;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Attendance code is unavailable' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_in_person_attendance_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_in_person_attendance_code(uuid) TO authenticated;

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
  v_scheduled_at timestamptz;
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student'
      USING ERRCODE = '42501';
  END IF;

  SELECT scheduled_at INTO v_scheduled_at
  FROM public.bookings
  WHERE id = p_booking_id
    AND student_id = v_student_id
    AND delivery_mode = 'in_person'
  FOR UPDATE;
  IF NOT FOUND OR now() < v_scheduled_at OR now() >= v_scheduled_at + interval '15 minutes' THEN
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

  UPDATE public.in_person_attendance_codes
  SET confirmed_at = now()
  WHERE booking_id = p_booking_id;
  UPDATE public.bookings
  SET attendance_confirmed_at = now()
  WHERE id = p_booking_id;
  UPDATE public.in_person_credit_reservations
  SET status = 'consumed', consumed_minutes = 100, settled_at = now()
  WHERE booking_id = p_booking_id
    AND status = 'reserved';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_in_person_attendance_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_in_person_attendance_code(uuid, text) TO authenticated;
