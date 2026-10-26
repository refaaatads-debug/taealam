ALTER TABLE public.in_person_request_groups
  ADD COLUMN IF NOT EXISTS teaching_stage text;

CREATE OR REPLACE FUNCTION public.search_in_person_teachers(
  p_city_id uuid,
  p_subject_id uuid,
  p_address_id uuid,
  p_scheduled_at timestamptz,
  p_teaching_stage text
)
RETURNS TABLE(
  teacher_id uuid,
  full_name text,
  avg_rating numeric,
  distance_km numeric,
  service_radius_km integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_teaching_stage IS NULL OR p_teaching_stage NOT IN (
    'رياض الأطفال', 'الابتدائية', 'المتوسطة', 'الثانوية', 'قدرات', 'تحصيلي'
  ) THEN
    RAISE EXCEPTION 'A valid teaching stage is required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT eligible.teacher_id, eligible.full_name, eligible.avg_rating,
         eligible.distance_km, eligible.service_radius_km
  FROM public.search_in_person_teachers(
    p_city_id, p_subject_id, p_address_id, p_scheduled_at
  ) eligible
  JOIN public.teacher_profiles tp ON tp.user_id = eligible.teacher_id
  WHERE tp.teaching_stages @> ARRAY[p_teaching_stage]::text[];
END;
$$;
REVOKE ALL ON FUNCTION public.search_in_person_teachers(uuid, uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_in_person_teachers(uuid, uuid, uuid, timestamptz, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.create_in_person_request(
  p_subject_id uuid,
  p_scheduled_at timestamptz,
  p_city_id uuid,
  p_address_id uuid,
  p_teacher_ids uuid[],
  p_idempotency_key text,
  p_teaching_stage text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_group_id uuid;
BEGIN
  IF p_teaching_stage IS NULL OR p_teaching_stage NOT IN (
    'رياض الأطفال', 'الابتدائية', 'المتوسطة', 'الثانوية', 'قدرات', 'تحصيلي'
  ) THEN
    RAISE EXCEPTION 'A valid teaching stage is required' USING ERRCODE = '22023';
  END IF;

  IF p_teacher_ids IS NULL OR cardinality(p_teacher_ids) = 0 OR EXISTS (
    SELECT 1
    FROM unnest(p_teacher_ids) AS requested(teacher_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.teacher_profiles tp
      JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
      WHERE tp.user_id = requested.teacher_id
        AND ts.subject_id = p_subject_id
        AND tp.teaching_stages @> ARRAY[p_teaching_stage]::text[]
    )
  ) THEN
    RAISE EXCEPTION 'One or more selected teachers do not teach this stage and subject'
      USING ERRCODE = '42501';
  END IF;

  v_group_id := public.create_in_person_request(
    p_subject_id, p_scheduled_at, p_city_id, p_address_id, p_teacher_ids, p_idempotency_key
  );

  UPDATE public.in_person_request_groups
  SET teaching_stage = p_teaching_stage
  WHERE id = v_group_id AND student_id = v_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not save the selected teaching stage' USING ERRCODE = '42501';
  END IF;

  RETURN v_group_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_in_person_request(uuid, timestamptz, uuid, uuid, uuid[], text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_in_person_request(uuid, timestamptz, uuid, uuid, uuid[], text, text)
  TO authenticated;

DROP FUNCTION IF EXISTS public.list_my_in_person_request_groups();
CREATE FUNCTION public.list_my_in_person_request_groups()
RETURNS TABLE(
  request_group_id uuid,
  subject_name text,
  teaching_stage text,
  scheduled_at timestamptz,
  status text,
  acceptance_deadline timestamptz,
  accepted_teacher_id uuid,
  booking_id uuid,
  attendance_confirmed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, s.name::text, g.teaching_stage, g.scheduled_at, g.status,
         g.acceptance_deadline, accepted.teacher_id, reservation.booking_id,
         b.attendance_confirmed_at
  FROM public.in_person_request_groups g
  LEFT JOIN public.subjects s ON s.id = g.subject_id
  LEFT JOIN public.in_person_credit_reservations reservation ON reservation.request_group_id = g.id
  LEFT JOIN public.bookings b ON b.id = reservation.booking_id
  LEFT JOIN LATERAL (
    SELECT r.teacher_id
    FROM public.in_person_request_recipients r
    WHERE r.request_group_id = g.id AND r.status = 'accepted'
    LIMIT 1
  ) accepted ON true
  WHERE g.student_id = v_student_id
  ORDER BY g.scheduled_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_in_person_request_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_in_person_request_groups() TO authenticated;

DROP FUNCTION IF EXISTS public.list_teacher_in_person_requests_priced();
CREATE FUNCTION public.list_teacher_in_person_requests_priced()
RETURNS TABLE(
  request_group_id uuid,
  student_name text,
  subject_name text,
  teaching_stage text,
  city_name text,
  scheduled_at timestamptz,
  acceptance_deadline timestamptz,
  offered_teacher_rate_sar numeric,
  offered_platform_share_sar numeric,
  pricing_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
BEGIN
  IF v_teacher_id IS NULL OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, COALESCE(pp.full_name, 'طالب')::text, COALESCE(s.name, 'مادة')::text,
    g.teaching_stage, c.name_ar, g.scheduled_at, g.acceptance_deadline,
    COALESCE(r.offered_teacher_rate_sar, 60), COALESCE(r.offered_platform_share_sar, 40),
    COALESCE(r.pricing_source, 'default')
  FROM public.in_person_request_recipients r
  JOIN public.in_person_request_groups g ON g.id = r.request_group_id
  JOIN public.cities c ON c.id = g.city_id
  LEFT JOIN public.public_profiles pp ON pp.user_id = g.student_id
  LEFT JOIN public.subjects s ON s.id = g.subject_id
  WHERE r.teacher_id = v_teacher_id AND r.status = 'pending'
    AND g.status = 'open' AND now() < g.acceptance_deadline
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.teacher_id = v_teacher_id AND b.status::text IN ('pending', 'confirmed')
        AND tstzrange(b.scheduled_at - interval '30 minutes',
          b.scheduled_at + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60))
            + interval '30 minutes', '[)')
          && tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests q
      WHERE q.accepted_by = v_teacher_id AND q.status = 'accepted'
        AND tstzrange(q.scheduled_at - interval '30 minutes',
          q.scheduled_at + make_interval(mins => COALESCE(q.duration_minutes, 60))
            + interval '30 minutes', '[)')
          && tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
    )
  ORDER BY g.scheduled_at;
END;
$$;
REVOKE ALL ON FUNCTION public.list_teacher_in_person_requests_priced() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teacher_in_person_requests_priced() TO authenticated;
