-- Expose only the authenticated student's own in-person reservation ledger.
-- This is read-only: it does not change subscription balances or ledger rows.
CREATE OR REPLACE FUNCTION public.get_my_in_person_package_credit_history(
  p_subscription_id uuid
)
RETURNS TABLE(
  reservation_id uuid,
  request_group_id uuid,
  booking_id uuid,
  subscription_id uuid,
  reserved_minutes integer,
  consumed_minutes integer,
  released_minutes integer,
  reservation_status text,
  created_at timestamptz,
  settled_at timestamptz,
  scheduled_at timestamptz,
  instruction_duration_minutes integer,
  booking_status text,
  teacher_id uuid,
  subject_id uuid,
  subject_name text,
  teacher_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
BEGIN
  IF v_student_id IS NULL
     OR NOT public.has_role(v_student_id, 'student'::public.app_role) THEN
    RAISE EXCEPTION 'Student authentication is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_subscription_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_subscriptions subscription
    WHERE subscription.id = p_subscription_id
      AND subscription.user_id = v_student_id
  ) THEN
    RAISE EXCEPTION 'Package not found'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    reservation.id,
    reservation.request_group_id,
    reservation.booking_id,
    reservation.subscription_id,
    reservation.reserved_minutes,
    reservation.consumed_minutes,
    reservation.released_minutes,
    reservation.status,
    reservation.created_at,
    reservation.settled_at,
    COALESCE(booking.scheduled_at, request_group.scheduled_at),
    COALESCE(booking.instruction_duration_minutes, request_group.instruction_duration_minutes),
    booking.status::text,
    booking.teacher_id,
    request_group.subject_id,
    subject.name::text,
    COALESCE(teacher_profile.full_name, 'معلم')::text
  FROM public.in_person_credit_reservations reservation
  JOIN public.user_subscriptions subscription
    ON subscription.id = reservation.subscription_id
   AND subscription.user_id = v_student_id
  LEFT JOIN public.in_person_request_groups request_group
    ON request_group.id = reservation.request_group_id
   AND request_group.student_id = v_student_id
  LEFT JOIN public.bookings booking
    ON booking.id = reservation.booking_id
   AND booking.student_id = v_student_id
   AND booking.subscription_id = reservation.subscription_id
  LEFT JOIN public.subjects subject
    ON subject.id = request_group.subject_id
  LEFT JOIN public.public_profiles teacher_profile
    ON teacher_profile.user_id = booking.teacher_id
  WHERE reservation.subscription_id = p_subscription_id
    AND reservation.student_id = v_student_id
  ORDER BY COALESCE(booking.scheduled_at, request_group.scheduled_at) DESC NULLS LAST,
           reservation.created_at DESC,
           reservation.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_in_person_package_credit_history(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_in_person_package_credit_history(uuid)
  TO authenticated;
