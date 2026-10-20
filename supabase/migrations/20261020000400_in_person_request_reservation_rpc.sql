-- Atomically open an in-person request and reserve exactly 100 package minutes.
-- No address details or credit records are directly exposed to client roles.
CREATE OR REPLACE FUNCTION public.create_in_person_request(
  p_subject_id uuid,
  p_scheduled_at timestamptz,
  p_city_id uuid,
  p_address_id uuid,
  p_teacher_ids uuid[],
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_group_id uuid;
  v_subscription_id uuid;
  v_teacher_count integer;
  v_address public.user_addresses%ROWTYPE;
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student'
      USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 16 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT r.request_group_id INTO v_group_id
  FROM public.in_person_credit_reservations r
  WHERE r.idempotency_key = p_idempotency_key
    AND r.student_id = v_student_id;
  IF v_group_id IS NOT NULL THEN
    RETURN v_group_id;
  END IF;

  IF p_scheduled_at < now() + interval '120 minutes' THEN
    RAISE EXCEPTION 'In-person requests must be created at least two hours before start'
      USING ERRCODE = '22023';
  END IF;

  IF p_teacher_ids IS NULL OR cardinality(p_teacher_ids) = 0 THEN
    RAISE EXCEPTION 'At least one eligible teacher is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize this student's reservation/calendar mutations for the date.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'in-person-student:' || v_student_id::text || ':' || (p_scheduled_at AT TIME ZONE 'UTC')::date::text,
    0
  ));

  -- Another copy of the same submission may have been waiting on the lock.
  SELECT r.request_group_id INTO v_group_id
  FROM public.in_person_credit_reservations r
  WHERE r.idempotency_key = p_idempotency_key
    AND r.student_id = v_student_id;
  IF v_group_id IS NOT NULL THEN
    RETURN v_group_id;
  END IF;

  SELECT * INTO v_address
  FROM public.user_addresses
  WHERE id = p_address_id
    AND owner_id = v_student_id
    AND city_id = p_city_id
  FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.cities c WHERE c.id = p_city_id AND c.is_active
  ) THEN
    RAISE EXCEPTION 'A valid address in an active city is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT requested.teacher_id) INTO v_teacher_count
  FROM unnest(p_teacher_ids) AS requested(teacher_id)
  JOIN public.teacher_profiles tp ON tp.user_id = requested.teacher_id
  JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
  WHERE ts.subject_id = p_subject_id
    AND tp.is_approved
    AND tp.in_person_enabled
    AND tp.in_person_approval_status = 'approved'
    AND tp.city_id = p_city_id
    AND tp.in_person_latitude IS NOT NULL
    AND tp.in_person_longitude IS NOT NULL
    AND tp.in_person_service_radius_km IS NOT NULL
    AND round((6371 * acos(least(1.0, greatest(-1.0,
      sin(radians(v_address.latitude)) * sin(radians(tp.in_person_latitude))
      + cos(radians(v_address.latitude)) * cos(radians(tp.in_person_latitude))
      * cos(radians(tp.in_person_longitude - v_address.longitude))
    ))))::numeric, 1) <= tp.in_person_service_radius_km;
  IF v_teacher_count <> (
    SELECT count(DISTINCT requested.teacher_id)
    FROM unnest(p_teacher_ids) AS requested(teacher_id)
  ) THEN
    RAISE EXCEPTION 'One or more teachers are not approved for this subject and city'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = v_student_id
      AND b.status::text IN ('pending', 'confirmed')
      AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins =>
        COALESCE(b.instruction_duration_minutes, b.duration_minutes)), '[)')
          && tstzrange(p_scheduled_at, p_scheduled_at + interval '60 minutes', '[)')
  ) OR EXISTS (
    SELECT 1 FROM public.booking_requests r
    WHERE r.student_id = v_student_id
      AND r.status IN ('open', 'accepted')
      AND tstzrange(r.scheduled_at, r.scheduled_at + make_interval(mins =>
        COALESCE(r.duration_minutes, 60)), '[)')
          && tstzrange(p_scheduled_at, p_scheduled_at + interval '60 minutes', '[)')
  ) OR EXISTS (
    SELECT 1 FROM public.in_person_request_groups g
    WHERE g.student_id = v_student_id
      AND g.status IN ('open', 'accepted')
      AND tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
          && tstzrange(p_scheduled_at, p_scheduled_at + interval '60 minutes', '[)')
  ) THEN
    RAISE EXCEPTION 'This time conflicts with another student booking or request'
      USING ERRCODE = '23P01';
  END IF;

  SELECT s.id INTO v_subscription_id
  FROM public.user_subscriptions s
  WHERE s.user_id = v_student_id
    AND s.is_active
    AND s.starts_at <= now()
    AND s.ends_at > p_scheduled_at
    AND s.remaining_minutes >= 100
  ORDER BY s.ends_at, s.created_at
  FOR UPDATE
  LIMIT 1;
  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'Insufficient active package balance: 100 minutes required'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.in_person_request_groups (
    student_id, subject_id, scheduled_at, city_id, address_id,
    visit_address_snapshot, acceptance_deadline
  )
  VALUES (
    v_student_id, p_subject_id, p_scheduled_at, p_city_id, p_address_id,
    jsonb_build_object(
      'city_id', v_address.city_id,
      'street_address', v_address.street_address,
      'district', v_address.district,
      'latitude', v_address.latitude,
      'longitude', v_address.longitude,
      'additional_details', v_address.additional_details
    ),
    p_scheduled_at - interval '60 minutes'
  )
  RETURNING id INTO v_group_id;

  INSERT INTO public.in_person_request_recipients (request_group_id, teacher_id)
  SELECT v_group_id, DISTINCT_TEACHERS.teacher_id
  FROM (
    SELECT DISTINCT tp.user_id AS teacher_id
    FROM unnest(p_teacher_ids) AS requested(user_id)
    JOIN public.teacher_profiles tp ON tp.user_id = requested.user_id
    JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE ts.subject_id = p_subject_id
  ) AS DISTINCT_TEACHERS;

  UPDATE public.user_subscriptions
  SET remaining_minutes = remaining_minutes - 100
  WHERE id = v_subscription_id
    AND remaining_minutes >= 100;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package balance changed; retry the request'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.in_person_credit_reservations (
    request_group_id, student_id, subscription_id, reserved_minutes,
    idempotency_key
  )
  VALUES (v_group_id, v_student_id, v_subscription_id, 100, p_idempotency_key);

  RETURN v_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_in_person_request(uuid, timestamptz, uuid, uuid, uuid[], text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_in_person_request(uuid, timestamptz, uuid, uuid, uuid[], text)
  TO authenticated;
