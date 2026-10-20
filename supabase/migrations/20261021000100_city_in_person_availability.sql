-- Per-city in-person availability is independent from whether a city can be used
-- for addresses. Existing city identities and saved user locations are retained.
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS in_person_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_person_enabled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS in_person_enabled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.city_in_person_availability_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city_id uuid NOT NULL REFERENCES public.cities(id),
  enabled boolean NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.city_in_person_availability_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_in_person_availability_audit FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.cities FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_in_person_cities()
RETURNS TABLE (
  city_id uuid, city_name text, enabled boolean,
  changed_by uuid, changed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name_ar, c.in_person_enabled, c.in_person_enabled_by, c.in_person_enabled_at
  FROM public.cities c
  WHERE c.country_iso2 = 'SA'
  ORDER BY c.name_ar;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_in_person_cities() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_in_person_cities() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_saudi_city_from_places(
  p_name_ar text, p_name_en text, p_latitude double precision, p_longitude double precision
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_name text := regexp_replace(btrim(COALESCE(p_name_ar, '')), '[[:space:]]+', ' ', 'g');
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR length(v_name) > 120
     OR p_latitude NOT BETWEEN 16.0 AND 33.0
     OR p_longitude NOT BETWEEN 33.0 AND 57.0 THEN
    RAISE EXCEPTION 'Choose a valid Saudi city from Google Maps' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cities:SA:' || lower(v_name)));
  SELECT c.id INTO v_id
  FROM public.cities c
  WHERE c.country_iso2 = 'SA'
    AND lower(regexp_replace(btrim(c.name_ar), '[[:space:]]+', ' ', 'g')) = lower(v_name)
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.cities(name_ar, name_en, country_iso2, places_source)
    VALUES (v_name, NULLIF(btrim(p_name_en), ''), 'SA', 'google_places')
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_saudi_city_from_places(text, text, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_saudi_city_from_places(text, text, double precision, double precision)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_in_person_city_enabled(p_city_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_city public.cities%ROWTYPE;
  v_group public.in_person_request_groups%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('in-person-city:' || p_city_id::text, 0));
  SELECT * INTO v_city FROM public.cities WHERE id = p_city_id AND country_iso2 = 'SA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saudi city not found' USING ERRCODE = 'P0002'; END IF;
  IF v_city.in_person_enabled IS NOT DISTINCT FROM p_enabled THEN RETURN; END IF;

  UPDATE public.cities
  SET in_person_enabled = p_enabled,
      in_person_enabled_by = auth.uid(),
      in_person_enabled_at = now()
  WHERE id = p_city_id;
  INSERT INTO public.city_in_person_availability_audit(city_id, enabled, changed_by)
  VALUES (p_city_id, p_enabled, auth.uid());

  IF NOT p_enabled THEN
    FOR v_group IN
      SELECT * FROM public.in_person_request_groups
      WHERE city_id = p_city_id AND status = 'open'
      ORDER BY id FOR UPDATE
    LOOP
      SELECT * INTO v_reservation
      FROM public.in_person_credit_reservations
      WHERE request_group_id = v_group.id AND status = 'reserved'
      FOR UPDATE;
      IF FOUND THEN
        UPDATE public.user_subscriptions
        SET remaining_minutes = remaining_minutes + v_reservation.reserved_minutes
        WHERE id = v_reservation.subscription_id;
        UPDATE public.in_person_credit_reservations
        SET status = 'released', released_minutes = reserved_minutes, settled_at = now()
        WHERE id = v_reservation.id AND status = 'reserved';
      END IF;
      UPDATE public.in_person_request_groups
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_group.id AND status = 'open';
      UPDATE public.in_person_request_recipients
      SET status = 'closed', responded_at = COALESCE(responded_at, now())
      WHERE request_group_id = v_group.id AND status = 'pending';
    END LOOP;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_in_person_city_enabled(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_in_person_city_enabled(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_in_person_city_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_city_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'in_person_request_groups' THEN
    v_city_id := NEW.city_id;
  ELSE
    v_city_id := NULLIF(NEW.visit_address_snapshot->>'city_id', '')::uuid;
  END IF;
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'A valid in-person service city is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('in-person-city:' || v_city_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.cities
    WHERE id = v_city_id AND country_iso2 = 'SA' AND in_person_enabled
  ) THEN
    RAISE EXCEPTION 'In-person service is unavailable in this city' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_in_person_city_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_in_person_request_city ON public.in_person_request_groups;
CREATE TRIGGER guard_in_person_request_city
  BEFORE INSERT ON public.in_person_request_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_in_person_city_write();

DROP TRIGGER IF EXISTS guard_in_person_booking_city ON public.bookings;
CREATE TRIGGER guard_in_person_booking_city
  BEFORE INSERT ON public.bookings
  FOR EACH ROW WHEN (NEW.delivery_mode = 'in_person')
  EXECUTE FUNCTION public.guard_in_person_city_write();

CREATE OR REPLACE FUNCTION public.guard_in_person_recipient_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE g public.in_person_request_groups%ROWTYPE;
BEGIN
  SELECT * INTO g FROM public.in_person_request_groups WHERE id = NEW.request_group_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.teacher_profiles tp
    JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = NEW.teacher_id AND ts.subject_id = g.subject_id
      AND tp.is_approved AND tp.in_person_enabled AND tp.in_person_approval_status = 'approved'
      AND tp.city_id = g.city_id AND tp.in_person_latitude IS NOT NULL
      AND tp.in_person_longitude IS NOT NULL AND tp.in_person_service_radius_km IS NOT NULL
      AND tp.available_days @> ARRAY[trim(lower(to_char(g.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'FMDay')))]
      AND tp.available_from IS NOT NULL AND tp.available_to IS NOT NULL
      AND tp.available_from <= (g.scheduled_at AT TIME ZONE 'Asia/Riyadh')::time
      AND tp.available_to >= ((g.scheduled_at + interval '60 minutes') AT TIME ZONE 'Asia/Riyadh')::time
      AND round((6371 * acos(least(1.0, greatest(-1.0,
        sin(radians((g.visit_address_snapshot->>'latitude')::double precision))
          * sin(radians(tp.in_person_latitude))
        + cos(radians((g.visit_address_snapshot->>'latitude')::double precision))
          * cos(radians(tp.in_person_latitude))
          * cos(radians(tp.in_person_longitude -
            (g.visit_address_snapshot->>'longitude')::double precision))
      ))))::numeric, 1) <= tp.in_person_service_radius_km
  ) THEN
    RAISE EXCEPTION 'Teacher is not available for this city, subject, and time' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_in_person_recipient_availability() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_in_person_recipient_availability_trigger ON public.in_person_request_recipients;
CREATE TRIGGER guard_in_person_recipient_availability_trigger
  BEFORE INSERT ON public.in_person_request_recipients
  FOR EACH ROW EXECUTE FUNCTION public.guard_in_person_recipient_availability();

-- Keep the lock order city -> request group so deactivation can safely close
-- pending requests while an acceptance is in flight.
CREATE OR REPLACE FUNCTION public.accept_in_person_request(p_request_group_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_city_id uuid;
  v_group public.in_person_request_groups%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
  v_booking_id uuid;
BEGIN
  IF v_teacher_id IS NULL OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher' USING ERRCODE = '42501';
  END IF;
  SELECT city_id INTO v_city_id FROM public.in_person_request_groups WHERE id = p_request_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request is no longer available' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('in-person-city:' || v_city_id::text, 0));
  SELECT * INTO v_group FROM public.in_person_request_groups
  WHERE id = p_request_group_id FOR UPDATE;
  IF NOT FOUND OR v_group.status <> 'open' THEN
    RAISE EXCEPTION 'Request is no longer available' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE id = v_city_id AND in_person_enabled) THEN
    RAISE EXCEPTION 'In-person service is unavailable in this city' USING ERRCODE = 'P0001';
  END IF;
  IF now() >= v_group.acceptance_deadline THEN
    RAISE EXCEPTION 'Acceptance closed one hour before the lesson' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.in_person_request_recipients r
  WHERE r.request_group_id = v_group.id AND r.teacher_id = v_teacher_id AND r.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teacher is not an eligible recipient' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'in-person-student:' || v_group.student_id::text || ':' ||
    (v_group.scheduled_at AT TIME ZONE 'UTC')::date::text, 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'in-person-teacher:' || v_teacher_id::text || ':' ||
    (v_group.scheduled_at AT TIME ZONE 'UTC')::date::text, 0
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_profiles tp
    JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = v_teacher_id AND tp.is_approved AND tp.in_person_enabled
      AND tp.in_person_approval_status = 'approved' AND tp.city_id = v_city_id
      AND tp.in_person_latitude IS NOT NULL AND tp.in_person_longitude IS NOT NULL
      AND tp.in_person_service_radius_km IS NOT NULL AND ts.subject_id = v_group.subject_id
      AND tp.available_from IS NOT NULL AND tp.available_to IS NOT NULL
      AND tp.available_days @> ARRAY[trim(lower(to_char(v_group.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'FMDay')))]
      AND tp.available_from <= (v_group.scheduled_at AT TIME ZONE 'Asia/Riyadh')::time
      AND tp.available_to >= ((v_group.scheduled_at + interval '60 minutes') AT TIME ZONE 'Asia/Riyadh')::time
      AND round((6371 * acos(least(1.0, greatest(-1.0,
        sin(radians((v_group.visit_address_snapshot->>'latitude')::double precision))
          * sin(radians(tp.in_person_latitude))
        + cos(radians((v_group.visit_address_snapshot->>'latitude')::double precision))
          * cos(radians(tp.in_person_latitude))
          * cos(radians(tp.in_person_longitude -
            (v_group.visit_address_snapshot->>'longitude')::double precision))
      ))))::numeric, 1) <= tp.in_person_service_radius_km
  ) THEN RAISE EXCEPTION 'Teacher eligibility changed' USING ERRCODE = '42501'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.teacher_id = v_teacher_id
      AND b.status::text IN ('pending', 'confirmed')
      AND tstzrange(b.scheduled_at - interval '30 minutes',
        b.scheduled_at + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes))
          + interval '30 minutes', '[)')
        && tstzrange(v_group.scheduled_at, v_group.scheduled_at + interval '60 minutes', '[)')
  ) OR EXISTS (
    SELECT 1 FROM public.booking_requests r WHERE r.accepted_by = v_teacher_id
      AND r.status = 'accepted'
      AND tstzrange(r.scheduled_at - interval '30 minutes',
        r.scheduled_at + make_interval(mins => COALESCE(r.duration_minutes, 60))
          + interval '30 minutes', '[)')
        && tstzrange(v_group.scheduled_at, v_group.scheduled_at + interval '60 minutes', '[)')
  ) OR EXISTS (
    SELECT 1 FROM public.in_person_request_groups g
    JOIN public.in_person_request_recipients r ON r.request_group_id = g.id
    WHERE g.status = 'accepted' AND r.teacher_id = v_teacher_id AND r.status = 'accepted'
      AND tstzrange(g.scheduled_at - interval '30 minutes',
        g.scheduled_at + interval '90 minutes', '[)')
        && tstzrange(v_group.scheduled_at, v_group.scheduled_at + interval '60 minutes', '[)')
  ) THEN RAISE EXCEPTION 'Teacher has a booking or travel-time conflict' USING ERRCODE = '23P01'; END IF;
  SELECT * INTO v_reservation FROM public.in_person_credit_reservations
  WHERE request_group_id = v_group.id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserved package credit is missing' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.in_person_request_recipients
  SET status = CASE WHEN teacher_id = v_teacher_id THEN 'accepted' ELSE 'closed' END, responded_at = now()
  WHERE request_group_id = v_group.id;
  UPDATE public.in_person_request_groups SET status = 'accepted', updated_at = now() WHERE id = v_group.id;
  INSERT INTO public.bookings (
    student_id, teacher_id, subject_id, scheduled_at, duration_minutes, status, price,
    used_subscription, subscription_id, delivery_mode, instruction_duration_minutes,
    balance_cost_minutes, visit_address_snapshot, in_person_policy_version
  )
  VALUES (
    v_group.student_id, v_teacher_id, v_group.subject_id, v_group.scheduled_at, 60,
    'confirmed', 0, true, v_reservation.subscription_id, 'in_person', 60, 100,
    v_group.visit_address_snapshot, v_group.policy_version
  ) RETURNING id INTO v_booking_id;
  INSERT INTO public.in_person_attendance_codes(booking_id, code_value)
  VALUES (v_booking_id, lpad(floor(random() * 10000)::integer::text, 4, '0'));
  UPDATE public.in_person_credit_reservations SET booking_id = v_booking_id WHERE id = v_reservation.id;
  INSERT INTO public.in_person_teacher_earnings(booking_id, teacher_id, amount, available_at)
  VALUES (v_booking_id, v_teacher_id, 60, v_group.scheduled_at + interval '60 minutes');
  RETURN v_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_in_person_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_in_person_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_in_person_city_status()
RETURNS TABLE(city_id uuid, city_name text, city_enabled boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name_ar, c.in_person_enabled
  FROM public.teacher_profiles tp
  LEFT JOIN public.cities c ON c.id = tp.city_id
  WHERE tp.user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_in_person_city_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_in_person_city_status() TO authenticated;

DROP FUNCTION IF EXISTS public.search_in_person_teachers(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.search_in_person_teachers(
  p_city_id uuid, p_subject_id uuid, p_address_id uuid, p_scheduled_at timestamptz
)
RETURNS TABLE(
  teacher_id uuid, full_name text, avg_rating numeric,
  distance_km numeric, service_radius_km integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_address public.user_addresses%ROWTYPE;
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_address FROM public.user_addresses
  WHERE id = p_address_id AND owner_id = v_student_id AND city_id = p_city_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Address is not available to this student' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE id = p_city_id AND in_person_enabled) THEN
    RAISE EXCEPTION 'In-person service is unavailable in this city' USING ERRCODE = 'P0001';
  END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'Choose a future lesson time' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT tp.user_id, pp.full_name::text, COALESCE(tp.avg_rating, 0)::numeric,
    distance.distance_km, tp.in_person_service_radius_km
  FROM public.teacher_profiles tp
  JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
  JOIN public.public_profiles pp ON pp.user_id = tp.user_id
  CROSS JOIN LATERAL (
    SELECT round((6371 * acos(least(1.0, greatest(-1.0,
      sin(radians(v_address.latitude)) * sin(radians(tp.in_person_latitude))
      + cos(radians(v_address.latitude)) * cos(radians(tp.in_person_latitude))
      * cos(radians(tp.in_person_longitude - v_address.longitude))
    ))))::numeric, 1) AS distance_km
  ) distance
  WHERE tp.city_id = p_city_id AND ts.subject_id = p_subject_id
    AND tp.is_approved AND tp.in_person_enabled AND tp.in_person_approval_status = 'approved'
    AND tp.in_person_latitude IS NOT NULL AND tp.in_person_longitude IS NOT NULL
    AND tp.in_person_service_radius_km IS NOT NULL
    AND tp.available_days @> ARRAY[trim(lower(to_char(p_scheduled_at AT TIME ZONE 'Asia/Riyadh', 'FMDay')))]
    AND tp.available_from IS NOT NULL AND tp.available_to IS NOT NULL
    AND tp.available_from <= (p_scheduled_at AT TIME ZONE 'Asia/Riyadh')::time
    AND tp.available_to >= ((p_scheduled_at + interval '60 minutes') AT TIME ZONE 'Asia/Riyadh')::time
    AND distance.distance_km <= tp.in_person_service_radius_km
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.teacher_id = tp.user_id AND b.status::text IN ('pending','confirmed')
        AND tstzrange(
          b.scheduled_at - interval '30 minutes',
          b.scheduled_at + make_interval(mins => COALESCE(b.instruction_duration_minutes,b.duration_minutes))
            + interval '30 minutes', '[)')
          && tstzrange(p_scheduled_at,p_scheduled_at + interval '60 minutes','[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests r
      WHERE r.accepted_by = tp.user_id AND r.status = 'accepted'
        AND tstzrange(r.scheduled_at - interval '30 minutes',
          r.scheduled_at + make_interval(mins => COALESCE(r.duration_minutes,60)) + interval '30 minutes','[)')
          && tstzrange(p_scheduled_at,p_scheduled_at + interval '60 minutes','[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.in_person_request_groups g
      JOIN public.in_person_request_recipients r ON r.request_group_id = g.id
      WHERE g.status = 'accepted' AND r.teacher_id = tp.user_id AND r.status = 'accepted'
        AND tstzrange(g.scheduled_at - interval '30 minutes',g.scheduled_at + interval '90 minutes','[)')
          && tstzrange(p_scheduled_at,p_scheduled_at + interval '60 minutes','[)')
    )
  ORDER BY distance.distance_km ASC, COALESCE(tp.avg_rating, 0) DESC, pp.full_name ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.search_in_person_teachers(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_in_person_teachers(uuid, uuid, uuid, timestamptz) TO authenticated;
