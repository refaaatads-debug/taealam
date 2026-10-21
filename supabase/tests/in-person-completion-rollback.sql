-- Run only on an isolated schema clone. The function call must be atomic:
-- a due booking without its matching earning may not remain completed.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_student uuid := 'a4000000-0000-4000-8000-000000000001';
  v_teacher uuid := 'a4000000-0000-4000-8000-000000000002';
  v_booking uuid := 'a4000000-0000-4000-8000-000000000003';
  v_failed boolean := false;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES
    (v_student, 'authenticated', 'authenticated', 'rollback-student@example.invalid', '', now(), now()),
    (v_teacher, 'authenticated', 'authenticated', 'rollback-teacher@example.invalid', '', now(), now());

  INSERT INTO public.profiles(user_id, full_name)
  VALUES (v_student, 'Synthetic rollback student'), (v_teacher, 'Synthetic rollback teacher')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
  VALUES (v_teacher, 20, true, 'approved');

  INSERT INTO public.bookings(
    id, student_id, teacher_id, scheduled_at, duration_minutes, status
  )
  VALUES (
    v_booking, v_student, v_teacher, now() - interval '46 minutes', 45,
    'confirmed'
  );
  UPDATE public.bookings
  SET delivery_mode = 'in_person',
      instruction_duration_minutes = 45,
      attendance_confirmed_at = now() - interval '46 minutes',
      session_status = 'in_progress'
  WHERE id = v_booking;

  BEGIN
    PERFORM public.process_in_person_session_completions();
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Missing earning did not abort in-person completion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = v_booking
      AND status::text = 'confirmed'
      AND session_status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Failed completion step did not roll back the booking state';
  END IF;
END;
$$;

ROLLBACK;
