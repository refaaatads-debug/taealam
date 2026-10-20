ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS in_person_latitude double precision,
  ADD COLUMN IF NOT EXISTS in_person_longitude double precision;

ALTER TABLE public.teacher_profiles
  DROP CONSTRAINT IF EXISTS teacher_profiles_in_person_coordinates_check;
ALTER TABLE public.teacher_profiles
  ADD CONSTRAINT teacher_profiles_in_person_coordinates_check
  CHECK (
    (in_person_latitude IS NULL AND in_person_longitude IS NULL)
    OR
    (in_person_latitude BETWEEN -90 AND 90 AND in_person_longitude BETWEEN -180 AND 180)
  );

CREATE OR REPLACE FUNCTION public.search_in_person_teachers(
  p_city_id uuid,
  p_subject_id uuid,
  p_address_id uuid
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
DECLARE
  v_student_id uuid := auth.uid();
  v_address public.user_addresses%ROWTYPE;
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this student'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_address
  FROM public.user_addresses
  WHERE id = p_address_id
    AND owner_id = v_student_id
    AND city_id = p_city_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Address is not available to this student'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tp.user_id,
    pp.full_name::text,
    COALESCE(tp.avg_rating, 0)::numeric,
    distance.distance_km,
    tp.in_person_service_radius_km
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
  WHERE tp.city_id = p_city_id
    AND ts.subject_id = p_subject_id
    AND tp.is_approved
    AND tp.in_person_enabled
    AND tp.in_person_approval_status = 'approved'
    AND tp.in_person_latitude IS NOT NULL
    AND tp.in_person_longitude IS NOT NULL
    AND tp.in_person_service_radius_km IS NOT NULL
    AND distance.distance_km <= tp.in_person_service_radius_km
  ORDER BY distance.distance_km ASC, COALESCE(tp.avg_rating, 0) DESC, pp.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.search_in_person_teachers(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_in_person_teachers(uuid, uuid, uuid) TO authenticated;
