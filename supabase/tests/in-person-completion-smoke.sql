-- Run against a schema-only production clone after migrations 013-015.
-- The transaction rolls back all synthetic accounts, bookings, and earnings.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_student uuid := 'a2000000-0000-4000-8000-000000000001';
  v_teacher uuid := 'a2000000-0000-4000-8000-000000000002';
  v_booking uuid;
  v_later_booking uuid;
  v_completed integer;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES
    (v_student, 'authenticated', 'authenticated', 'inperson-student@example.invalid', '', now(), now()),
    (v_teacher, 'authenticated', 'authenticated', 'inperson-teacher@example.invalid', '', now(), now());
  INSERT INTO public.profiles(user_id, full_name)
  VALUES (v_student, 'Synthetic in-person student'), (v_teacher, 'Synthetic in-person teacher')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
  VALUES (v_teacher, 20, true, 'approved');

  INSERT INTO public.bookings(student_id, teacher_id, scheduled_at, duration_minutes, status)
  VALUES (v_student, v_teacher, now() + interval '1 day', 45, 'confirmed')
  RETURNING id INTO v_booking;
  UPDATE public.bookings
  SET delivery_mode = 'in_person',
      instruction_duration_minutes = 45,
      attendance_confirmed_at = now() - interval '46 minutes',
      session_status = 'in_progress'
  WHERE id = v_booking;
  INSERT INTO public.in_person_teacher_earnings(booking_id, teacher_id, amount, status, available_at)
  VALUES (v_booking, v_teacher, 60, 'pending', now() - interval '1 minute');

  v_completed := public.process_in_person_session_completions();
  IF v_completed <> 1 THEN
    RAISE EXCEPTION 'Due 45-minute in-person session was not completed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = v_booking AND status::text = 'completed' AND session_status = 'completed'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.in_person_teacher_earnings
    WHERE booking_id = v_booking AND status = 'available'
  ) THEN
    RAISE EXCEPTION 'Completion and earning availability were not atomic';
  END IF;
  IF public.process_in_person_session_completions() <> 0 THEN
    RAISE EXCEPTION 'Repeated completion was not idempotent';
  END IF;

  INSERT INTO public.bookings(student_id, teacher_id, scheduled_at, duration_minutes, status)
  VALUES (v_student, v_teacher, now() + interval '2 days', 60, 'confirmed')
  RETURNING id INTO v_later_booking;
  UPDATE public.bookings
  SET delivery_mode = 'in_person',
      instruction_duration_minutes = 60,
      attendance_confirmed_at = now() - interval '10 minutes',
      session_status = 'in_progress'
  WHERE id = v_later_booking;
  INSERT INTO public.in_person_teacher_earnings(booking_id, teacher_id, amount, status, available_at)
  VALUES (v_later_booking, v_teacher, 60, 'pending', now() - interval '1 hour');
  IF public.process_in_person_session_completions() <> 0
     OR (SELECT status FROM public.in_person_teacher_earnings WHERE booking_id = v_later_booking) <> 'pending' THEN
    RAISE EXCEPTION 'Premature earning release was not blocked';
  END IF;
END;
$$;

ROLLBACK;
