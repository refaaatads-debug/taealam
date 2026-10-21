-- Run after two concurrent calls to process_in_person_session_completions().
BEGIN;
DO $$
DECLARE
  v_booking_status text;
  v_session_status text;
  v_earning_count integer;
  v_amount numeric;
  v_earning_status text;
BEGIN
  SELECT status::text, session_status INTO v_booking_status, v_session_status
  FROM public.bookings
  WHERE id = 'a5000000-0000-4000-8000-000000000003';
  SELECT count(*), max(amount), max(status) INTO v_earning_count, v_amount, v_earning_status
  FROM public.in_person_teacher_earnings
  WHERE booking_id = 'a5000000-0000-4000-8000-000000000003';
  IF v_booking_status <> 'completed' OR v_session_status <> 'completed'
     OR v_earning_count <> 1 OR v_amount <> 60 OR v_earning_status <> 'available' THEN
    RAISE EXCEPTION 'Concurrent in-person completion mismatch: booking %, session %, earning rows %, amount %, status %',
      v_booking_status, v_session_status, v_earning_count, v_amount, v_earning_status;
  END IF;
END;
$$;
DELETE FROM public.in_person_teacher_earnings
WHERE booking_id = 'a5000000-0000-4000-8000-000000000003';
DELETE FROM public.bookings
WHERE id = 'a5000000-0000-4000-8000-000000000003';
DELETE FROM public.teacher_profiles
WHERE user_id = 'a5000000-0000-4000-8000-000000000001';
DELETE FROM public.profiles
WHERE user_id IN ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002');
DELETE FROM auth.users
WHERE id IN ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002');
DELETE FROM public.user_roles
WHERE user_id IN ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002');
COMMIT;
