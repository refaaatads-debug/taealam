-- Attendance codes are generated once per accepted in-person booking. Teachers
-- may retrieve that same code before the lesson; student confirmation remains
-- restricted to the existing attendance window.
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
    AND delivery_mode = 'in_person'
    AND status::text = 'confirmed';
  IF NOT FOUND OR now() >= v_booking.scheduled_at + interval '15 minutes' THEN
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

CREATE OR REPLACE FUNCTION public.guard_in_person_online_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_status text := v_row->>'status';
  v_mode text;
  v_student uuid := NULLIF(v_row->>'student_id', '')::uuid;
  v_teacher uuid;
  v_start timestamptz := NULLIF(v_row->>'scheduled_at', '')::timestamptz;
  v_minutes integer;
  v_end timestamptz;
  v_request_id uuid;
BEGIN
  IF NOT public.is_in_person_test_user()
     OR v_status NOT IN ('open', 'accepted', 'pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'in_person_request_groups' THEN
    v_mode := 'in_person';
    v_minutes := 60;
  ELSIF TG_TABLE_NAME = 'bookings' THEN
    v_mode := COALESCE(v_row->>'delivery_mode', 'online');
    v_teacher := NULLIF(v_row->>'teacher_id', '')::uuid;
    v_minutes := COALESCE(
      NULLIF(v_row->>'instruction_duration_minutes', '')::integer,
      NULLIF(v_row->>'duration_minutes', '')::integer,
      CASE WHEN v_mode = 'in_person' THEN 60 ELSE 45 END
    );
  ELSE
    v_mode := 'online';
    v_teacher := NULLIF(v_row->>'accepted_by', '')::uuid;
    v_minutes := COALESCE(NULLIF(v_row->>'duration_minutes', '')::integer, 45);
    v_request_id := NULLIF(v_row->>'id', '')::uuid;
  END IF;

  IF v_start IS NULL OR v_student IS NULL OR v_minutes <= 0 THEN
    RETURN NEW;
  END IF;
  IF v_mode NOT IN ('online', 'in_person') THEN
    RETURN NEW;
  END IF;
  v_end := v_start + make_interval(mins => v_minutes);

  -- Serialize all booking writes for the same student/teacher so concurrent
  -- online and in-person submissions cannot both pass the overlap check.
  PERFORM pg_advisory_xact_lock(hashtextextended('booking-user:' || v_student::text, 0));
  IF v_teacher IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('booking-user:' || v_teacher::text, 0));
  END IF;

  IF v_mode = 'online' THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.delivery_mode = 'in_person'
        AND b.status::text IN ('pending', 'confirmed')
        AND (b.student_id = v_student OR (v_teacher IS NOT NULL AND b.teacher_id = v_teacher))
        AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins =>
          COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60)), '[)')
          && tstzrange(v_start, v_end, '[)')
    ) OR EXISTS (
      SELECT 1
      FROM public.in_person_request_groups g
      LEFT JOIN public.in_person_request_recipients r
        ON r.request_group_id = g.id AND r.status = 'accepted'
      WHERE g.status IN ('open', 'accepted')
        AND (g.student_id = v_student OR (v_teacher IS NOT NULL AND r.teacher_id = v_teacher))
        AND tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
          && tstzrange(v_start, v_end, '[)')
    ) THEN
      RAISE EXCEPTION 'This student or teacher already has an in-person lesson at that time'
        USING ERRCODE = '23P01';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.delivery_mode IS DISTINCT FROM 'in_person'
        AND b.status::text IN ('pending', 'confirmed')
        AND (b.student_id = v_student OR (v_teacher IS NOT NULL AND b.teacher_id = v_teacher))
        AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins =>
          COALESCE(b.instruction_duration_minutes, b.duration_minutes, 45)), '[)')
          && tstzrange(v_start, v_end, '[)')
    ) OR EXISTS (
      SELECT 1 FROM public.booking_requests r
      WHERE r.status = 'open'
        AND r.student_id = v_student
        AND (v_request_id IS NULL OR r.id <> v_request_id)
        AND tstzrange(r.scheduled_at, r.scheduled_at + make_interval(mins =>
          COALESCE(r.duration_minutes, 45)), '[)')
          && tstzrange(v_start, v_end, '[)')
    ) THEN
      RAISE EXCEPTION 'This student or teacher already has an online lesson at that time'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_booking_requests_in_person_overlap ON public.booking_requests;
CREATE TRIGGER guard_booking_requests_in_person_overlap
BEFORE INSERT OR UPDATE OF status, accepted_by, scheduled_at
ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_in_person_online_overlap();

DROP TRIGGER IF EXISTS guard_bookings_in_person_overlap ON public.bookings;
CREATE TRIGGER guard_bookings_in_person_overlap
BEFORE INSERT OR UPDATE OF status, teacher_id, student_id, scheduled_at, delivery_mode
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_in_person_online_overlap();

DROP TRIGGER IF EXISTS guard_in_person_groups_online_overlap ON public.in_person_request_groups;
CREATE TRIGGER guard_in_person_groups_online_overlap
BEFORE INSERT OR UPDATE OF status, scheduled_at
ON public.in_person_request_groups
FOR EACH ROW EXECUTE FUNCTION public.guard_in_person_online_overlap();

REVOKE ALL ON FUNCTION public.guard_in_person_online_overlap() FROM PUBLIC, anon, authenticated;
