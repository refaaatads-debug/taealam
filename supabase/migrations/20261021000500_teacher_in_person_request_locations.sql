CREATE OR REPLACE FUNCTION public.list_teacher_in_person_request_locations()
RETURNS TABLE(
  request_group_id uuid,
  street_address text,
  district text,
  city_name text,
  latitude text,
  longitude text
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
  SELECT
    g.id,
    g.visit_address_snapshot->>'street_address',
    g.visit_address_snapshot->>'district',
    c.name_ar,
    g.visit_address_snapshot->>'latitude',
    g.visit_address_snapshot->>'longitude'
  FROM public.in_person_request_recipients r
  JOIN public.in_person_request_groups g ON g.id = r.request_group_id
  JOIN public.cities c ON c.id = g.city_id
  WHERE r.teacher_id = v_teacher_id
    AND r.status = 'pending'
    AND g.status = 'open'
    AND now() < g.acceptance_deadline
  ORDER BY g.scheduled_at;
END;
$$;

REVOKE ALL ON FUNCTION public.list_teacher_in_person_request_locations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teacher_in_person_request_locations() TO authenticated;
