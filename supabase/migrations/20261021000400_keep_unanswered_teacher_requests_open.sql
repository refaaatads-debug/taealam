-- A teacher declining a broadcast request must not cancel it for the student
-- or hide it from other eligible teachers.
CREATE TABLE IF NOT EXISTS public.booking_request_teacher_rejections (
  request_id uuid NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, teacher_id)
);
ALTER TABLE public.booking_request_teacher_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_request_teacher_rejections FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_booking_request(
  _request_ids uuid[],
  _teacher_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() <> _teacher_id
     OR NOT public.has_role(_teacher_id, 'teacher'::public.app_role) THEN
    RAISE EXCEPTION 'Teacher access required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.booking_request_teacher_rejections(request_id, teacher_id)
  SELECT DISTINCT r.id, _teacher_id
  FROM public.booking_requests r
  JOIN public.teacher_profiles tp ON tp.user_id = _teacher_id AND tp.is_approved
  JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id AND ts.subject_id = r.subject_id
  WHERE r.id = ANY(COALESCE(_request_ids, ARRAY[]::uuid[]))
    AND r.status = 'open'
    AND (r.expires_at IS NULL OR r.expires_at > now())
  ON CONFLICT (request_id, teacher_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_booking_request(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_booking_request(uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_booking_request_rejection_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT request_id
  FROM public.booking_request_teacher_rejections
  WHERE teacher_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.list_my_booking_request_rejection_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_booking_request_rejection_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_in_person_request(p_request_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_group public.in_person_request_groups%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
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
  IF NOT FOUND OR v_group.status <> 'open' OR now() >= v_group.acceptance_deadline THEN
    RETURN false;
  END IF;

  UPDATE public.in_person_request_recipients
  SET status = 'declined', responded_at = now()
  WHERE request_group_id = v_group.id
    AND teacher_id = v_teacher_id
    AND status = 'pending';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.in_person_request_recipients
    WHERE request_group_id = v_group.id AND status = 'pending'
  ) THEN
    SELECT * INTO v_reservation
    FROM public.in_person_credit_reservations
    WHERE request_group_id = v_group.id AND status = 'reserved'
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.user_subscriptions
      SET remaining_minutes = remaining_minutes + v_reservation.reserved_minutes
      WHERE id = v_reservation.subscription_id;
      UPDATE public.in_person_credit_reservations
      SET status = 'released',
          released_minutes = reserved_minutes,
          settled_at = now()
      WHERE id = v_reservation.id AND status = 'reserved';
      UPDATE public.in_person_request_groups
      SET status = 'expired', updated_at = now()
      WHERE id = v_group.id AND status = 'open';
    END IF;
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_in_person_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_in_person_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_in_person_teachers_with_dates()
RETURNS TABLE(
  teacher_id uuid,
  full_name text,
  is_enabled boolean,
  approval_status text,
  city_id uuid,
  city_name text,
  service_radius_km integer,
  latitude double precision,
  longitude double precision,
  created_at timestamptz
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
         tp.in_person_service_radius_km, tp.in_person_latitude,
         tp.in_person_longitude, tp.created_at
  FROM public.teacher_profiles tp
  LEFT JOIN public.public_profiles pp ON pp.user_id = tp.user_id
  LEFT JOIN public.cities c ON c.id = tp.city_id
  WHERE tp.in_person_approval_status <> 'not_requested'
     OR tp.in_person_enabled
  ORDER BY tp.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_in_person_teachers_with_dates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_in_person_teachers_with_dates() TO authenticated;
