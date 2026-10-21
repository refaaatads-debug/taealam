-- Serialize teacher acceptance and booking writes across all lesson types.
-- The older cross-mode guard covered online/in-person conflicts, but it did
-- not prevent two online acceptances from racing for the same teacher.
CREATE OR REPLACE FUNCTION public.prevent_teacher_booking_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher uuid;
  v_student uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_minutes integer;
BEGIN
  IF TG_TABLE_NAME = 'booking_requests' THEN
    IF NEW.status <> 'accepted' OR NEW.accepted_by IS NULL THEN
      RETURN NEW;
    END IF;
    v_teacher := NEW.accepted_by;
    v_student := NEW.student_id;
    v_start := NEW.scheduled_at;
    v_minutes := COALESCE(NEW.duration_minutes, 45);
  ELSE
    IF NEW.status::text NOT IN ('pending', 'confirmed') OR NEW.teacher_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_teacher := NEW.teacher_id;
    v_student := NEW.student_id;
    v_start := NEW.scheduled_at;
    v_minutes := COALESCE(NEW.instruction_duration_minutes, NEW.duration_minutes, 45);
  END IF;

  IF v_start IS NULL OR v_minutes <= 0 THEN
    RETURN NEW;
  END IF;
  v_end := v_start + make_interval(mins => v_minutes);

  PERFORM pg_advisory_xact_lock(hashtextextended('booking-teacher:' || v_teacher::text, 0));

  IF TG_TABLE_NAME = 'booking_requests' THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.teacher_id = v_teacher
        AND b.status::text IN ('pending', 'confirmed')
        AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins =>
          COALESCE(b.instruction_duration_minutes, b.duration_minutes, 45)), '[)')
          && tstzrange(v_start, v_end, '[)')
    ) OR EXISTS (
      SELECT 1 FROM public.booking_requests r
      WHERE r.accepted_by = v_teacher AND r.status = 'accepted' AND r.id <> NEW.id
        AND tstzrange(r.scheduled_at, r.scheduled_at + make_interval(mins =>
          COALESCE(r.duration_minutes, 45)), '[)')
          && tstzrange(v_start, v_end, '[)')
    ) OR EXISTS (
      SELECT 1 FROM public.in_person_request_groups g
      JOIN public.in_person_request_recipients recipient
        ON recipient.request_group_id = g.id
      WHERE g.status = 'accepted' AND recipient.teacher_id = v_teacher
        AND recipient.status = 'accepted'
        AND tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
          && tstzrange(v_start, v_end, '[)')
    ) THEN
      RAISE EXCEPTION 'Teacher already has a lesson at that time'
        USING ERRCODE = '23P01';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.teacher_id = v_teacher
        AND b.status::text IN ('pending', 'confirmed')
        AND b.id <> NEW.id
        AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins =>
          COALESCE(b.instruction_duration_minutes, b.duration_minutes, 45)), '[)')
          && tstzrange(v_start, v_end, '[)')
    ) OR EXISTS (
      SELECT 1 FROM public.booking_requests r
      WHERE r.accepted_by = v_teacher AND r.status = 'accepted'
        AND NOT (r.student_id = v_student AND r.scheduled_at = v_start)
        AND tstzrange(r.scheduled_at, r.scheduled_at + make_interval(mins =>
          COALESCE(r.duration_minutes, 45)), '[)')
          && tstzrange(v_start, v_end, '[)')
    ) OR EXISTS (
      SELECT 1 FROM public.in_person_request_groups g
      JOIN public.in_person_request_recipients recipient
        ON recipient.request_group_id = g.id
      WHERE g.status = 'accepted' AND recipient.teacher_id = v_teacher
        AND recipient.status = 'accepted'
        AND NOT (g.student_id = v_student AND g.scheduled_at = v_start
          AND COALESCE(NEW.delivery_mode::text, 'online') = 'in_person')
        AND tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
          && tstzrange(v_start, v_end, '[)')
    ) THEN
      RAISE EXCEPTION 'Teacher already has a lesson at that time'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_teacher_booking_overlap() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_teacher_double_booking_request ON public.booking_requests;
CREATE TRIGGER prevent_teacher_double_booking_request
BEFORE UPDATE OF status, accepted_by, scheduled_at, duration_minutes ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_teacher_booking_overlap();

DROP TRIGGER IF EXISTS prevent_teacher_double_booking ON public.bookings;
CREATE TRIGGER prevent_teacher_double_booking
BEFORE INSERT OR UPDATE OF status, teacher_id, scheduled_at, duration_minutes, instruction_duration_minutes
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_teacher_booking_overlap();

-- Do not keep offering a pending in-person request to a teacher who has since
-- become busy in either delivery mode. Acceptance remains protected above and
-- by the existing in-person acceptance RPC.
CREATE OR REPLACE FUNCTION public.list_teacher_in_person_requests()
RETURNS TABLE(
  request_group_id uuid,
  student_name text,
  subject_name text,
  city_name text,
  scheduled_at timestamptz,
  acceptance_deadline timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_teacher_id uuid := auth.uid();
BEGIN
  IF v_teacher_id IS NULL
     OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, COALESCE(pp.full_name, 'طالب')::text, COALESCE(s.name, 'مادة')::text,
         c.name_ar, g.scheduled_at, g.acceptance_deadline
  FROM public.in_person_request_recipients r
  JOIN public.in_person_request_groups g ON g.id = r.request_group_id
  JOIN public.cities c ON c.id = g.city_id
  LEFT JOIN public.public_profiles pp ON pp.user_id = g.student_id
  LEFT JOIN public.subjects s ON s.id = g.subject_id
  WHERE r.teacher_id = v_teacher_id
    AND r.status = 'pending'
    AND g.status = 'open'
    AND now() < g.acceptance_deadline
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.teacher_id = v_teacher_id AND b.status::text IN ('pending', 'confirmed')
        AND tstzrange(b.scheduled_at - interval '30 minutes',
          b.scheduled_at + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60))
            + interval '30 minutes', '[)')
          && tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests accepted
      WHERE accepted.accepted_by = v_teacher_id AND accepted.status = 'accepted'
        AND tstzrange(accepted.scheduled_at - interval '30 minutes',
          accepted.scheduled_at + make_interval(mins => COALESCE(accepted.duration_minutes, 60))
            + interval '30 minutes', '[)')
          && tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
    )
  ORDER BY g.scheduled_at;
END;
$$;

REVOKE ALL ON FUNCTION public.list_teacher_in_person_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teacher_in_person_requests() TO authenticated;
