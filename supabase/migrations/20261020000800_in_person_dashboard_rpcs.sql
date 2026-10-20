DROP FUNCTION IF EXISTS public.list_my_in_person_request_groups();
CREATE FUNCTION public.list_my_in_person_request_groups()
RETURNS TABLE(
  request_group_id uuid,
  subject_name text,
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
DECLARE v_student_id uuid := auth.uid();
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, s.name::text, g.scheduled_at, g.status, g.acceptance_deadline,
          accepted.teacher_id, reservation.booking_id, b.attendance_confirmed_at
  FROM public.in_person_request_groups g
  LEFT JOIN public.subjects s ON s.id = g.subject_id
  LEFT JOIN public.in_person_credit_reservations reservation
    ON reservation.request_group_id = g.id
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
  ORDER BY g.scheduled_at;
END;
$$;
REVOKE ALL ON FUNCTION public.list_teacher_in_person_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teacher_in_person_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_in_person_request_group(p_request_group_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_group public.in_person_request_groups%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group
  FROM public.in_person_request_groups
  WHERE id = p_request_group_id AND student_id = v_student_id
  FOR UPDATE;
  IF NOT FOUND OR v_group.status <> 'open' THEN
    RAISE EXCEPTION 'Only an open request can be cancelled' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reservation
  FROM public.in_person_credit_reservations
  WHERE request_group_id = v_group.id AND student_id = v_student_id AND status = 'reserved'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The reserved credit is unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_subscriptions
  SET remaining_minutes = remaining_minutes + v_reservation.reserved_minutes
  WHERE id = v_reservation.subscription_id;
  UPDATE public.in_person_credit_reservations
  SET status = 'released', released_minutes = reserved_minutes, settled_at = now()
  WHERE id = v_reservation.id;
  UPDATE public.in_person_request_groups
  SET status = 'cancelled', updated_at = now()
  WHERE id = v_group.id;
  UPDATE public.in_person_request_recipients
  SET status = 'closed', responded_at = now()
  WHERE request_group_id = v_group.id AND status = 'pending';
  RETURN v_reservation.reserved_minutes;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_in_person_request_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_in_person_request_group(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_in_person_teachers()
RETURNS TABLE(
  teacher_id uuid,
  full_name text,
  is_enabled boolean,
  approval_status text,
  city_id uuid,
  city_name text,
  service_radius_km integer,
  latitude double precision,
  longitude double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT tp.user_id, COALESCE(pp.full_name, 'معلم')::text, tp.in_person_enabled,
         tp.in_person_approval_status, tp.city_id, c.name_ar,
         tp.in_person_service_radius_km, tp.in_person_latitude, tp.in_person_longitude
  FROM public.teacher_profiles tp
  LEFT JOIN public.public_profiles pp ON pp.user_id = tp.user_id
  LEFT JOIN public.cities c ON c.id = tp.city_id
  WHERE tp.in_person_approval_status <> 'not_requested'
     OR tp.in_person_enabled
  ORDER BY tp.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_in_person_teachers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_in_person_teachers() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_in_person_teacher(
  p_teacher_id uuid,
  p_approval_status text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_approval_status NOT IN ('not_requested', 'pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid in-person approval status' USING ERRCODE = '22023';
  END IF;
  IF p_enabled AND p_approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved teachers can be enabled' USING ERRCODE = '22023';
  END IF;
  IF p_enabled AND NOT EXISTS (
    SELECT 1 FROM public.teacher_profiles
    WHERE user_id = p_teacher_id
      AND is_approved
      AND city_id IS NOT NULL
      AND in_person_latitude IS NOT NULL
      AND in_person_longitude IS NOT NULL
      AND in_person_service_radius_km BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION 'Teacher profile must be approved with a complete service location'
      USING ERRCODE = '22023';
  END IF;
  UPDATE public.teacher_profiles
  SET in_person_approval_status = p_approval_status,
      in_person_enabled = p_enabled,
      updated_at = now()
  WHERE user_id = p_teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teacher profile not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_in_person_teacher(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_in_person_teacher(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_in_person_tester(
  p_user_id uuid,
  p_role public.app_role,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('student', 'teacher', 'admin') THEN
    RAISE EXCEPTION 'Unsupported pilot role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = p_role
  ) THEN
    RAISE EXCEPTION 'User does not have the selected role' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.in_person_feature_testers(user_id, role, enabled, created_by)
  VALUES (p_user_id, p_role, p_enabled, auth.uid())
  ON CONFLICT (user_id, role)
  DO UPDATE SET enabled = EXCLUDED.enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_in_person_tester(uuid, public.app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_in_person_tester(uuid, public.app_role, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_in_person_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() = OLD.user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF NEW.in_person_approval_status IS DISTINCT FROM OLD.in_person_approval_status
       AND NEW.in_person_approval_status <> 'pending' THEN
      RAISE EXCEPTION 'Teachers may request review but cannot approve or reject themselves'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.in_person_enabled AND OLD.in_person_approval_status <> 'approved' THEN
      RAISE EXCEPTION 'In-person teaching must be approved before it can be enabled'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_in_person_teacher_location(
  p_city_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_service_radius_km integer
)
RETURNS void
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
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude NOT BETWEEN -180 AND 180
     OR p_service_radius_km NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Enter a valid location and service radius'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE id = p_city_id AND is_active) THEN
    RAISE EXCEPTION 'Select an active city' USING ERRCODE = '22023';
  END IF;
  UPDATE public.teacher_profiles
  SET city_id = p_city_id,
      in_person_latitude = p_latitude,
      in_person_longitude = p_longitude,
      in_person_service_radius_km = p_service_radius_km,
      in_person_enabled = false,
      in_person_approval_status = 'pending',
      updated_at = now()
  WHERE user_id = v_teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teacher profile not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_in_person_teacher_location(uuid, double precision, double precision, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_in_person_teacher_location(uuid, double precision, double precision, integer)
  TO authenticated;
