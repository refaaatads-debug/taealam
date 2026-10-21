-- Run against an empty schema-only copy of production after migrations 013-015.
-- Every synthetic auth user, booking, subscription, session, and earning is
-- rolled back at the end of the test.
BEGIN;

DO $$
DECLARE
  v_teacher uuid := 'a1000000-0000-4000-8000-000000000001';
  v_student uuid := 'a1000000-0000-4000-8000-000000000002';
  v_low_balance_student uuid := 'a1000000-0000-4000-8000-000000000003';
  v_plan uuid := 'a1000000-0000-4000-8000-000000000006';
  v_subscription uuid := 'a1000000-0000-4000-8000-000000000004';
  v_low_subscription uuid := 'a1000000-0000-4000-8000-000000000005';
  v_booking uuid;
  v_session uuid;
  v_low_booking uuid;
  v_low_session uuid;
  v_count integer;
  v_amount numeric;
  v_balance integer;
  v_failed boolean;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES
    (v_teacher, 'authenticated', 'authenticated', 'finance-teacher@example.invalid', '', now(), now()),
    (v_student, 'authenticated', 'authenticated', 'finance-student@example.invalid', '', now(), now()),
    (v_low_balance_student, 'authenticated', 'authenticated', 'finance-low-balance@example.invalid', '', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles(user_id, full_name)
  VALUES (v_teacher, 'Synthetic finance teacher'),
         (v_student, 'Synthetic finance student'),
         (v_low_balance_student, 'Synthetic low-balance student')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
  VALUES (v_teacher, 20, true, 'approved')
  ON CONFLICT (user_id) DO UPDATE SET hourly_rate = EXCLUDED.hourly_rate;

  INSERT INTO public.financial_settings(in_person_instruction_duration_minutes)
  VALUES (45);
  IF public.get_in_person_instruction_duration() <> 45 THEN
    RAISE EXCEPTION 'Configured 45-minute duration was not read';
  END IF;

  INSERT INTO public.subscription_plans(
    id, tier, name_ar, price, sessions_count, session_duration_minutes
  )
  VALUES (v_plan, 'basic', 'خطة اختبار مالية', 1, 1, 60);

  INSERT INTO public.user_subscriptions(
    id, user_id, plan_id, starts_at, ends_at, is_active, remaining_minutes, total_hours, session_duration_minutes
  )
  VALUES
    (v_subscription, v_student, v_plan, now() - interval '1 day', now() + interval '10 days', true, 100, 2, 60),
    (v_low_subscription, v_low_balance_student, v_plan, now() - interval '1 day', now() + interval '10 days', true, 60, 1, 60);

  INSERT INTO public.bookings(
    student_id, teacher_id, scheduled_at, duration_minutes, status, used_subscription, subscription_id
  )
  VALUES (v_student, v_teacher, now() - interval '1 hour', 60, 'confirmed', true, v_subscription)
  RETURNING id INTO v_booking;
  SELECT id INTO v_session FROM public.sessions WHERE booking_id = v_booking;
  IF v_session IS NULL THEN
    INSERT INTO public.sessions(booking_id) VALUES (v_booking) RETURNING id INTO v_session;
  END IF;

  UPDATE public.sessions
  SET started_at = now() - interval '20 minutes',
      ended_at = now(),
      duration_seconds = 1200
  WHERE id = v_session;

  IF (SELECT teacher_hourly_rate_snapshot FROM public.bookings WHERE id = v_booking) <> 20 THEN
    RAISE EXCEPTION 'The booking did not preserve the teacher hourly rate';
  END IF;
  IF (SELECT teacher_earning FROM public.sessions WHERE id = v_session) <> 6.67
     OR (SELECT gross_amount FROM public.sessions WHERE id = v_session) <> 20
     OR (SELECT platform_fee FROM public.sessions WHERE id = v_session) <> 13.33 THEN
    RAISE EXCEPTION '20 minutes at 20 SAR/hour did not preserve the saved 6.67 SAR net formula';
  END IF;
  IF (SELECT remaining_minutes FROM public.user_subscriptions WHERE id = v_subscription) <> 80 THEN
    RAISE EXCEPTION 'Actual 20-minute duration was not debited atomically';
  END IF;
  SELECT count(*), max(amount) INTO v_count, v_amount
  FROM public.teacher_earnings
  WHERE teacher_id = v_teacher AND notes LIKE '%auto:session:%';
  IF v_count <> 1 OR v_amount <> 6.67 THEN
    RAISE EXCEPTION 'One session did not produce exactly one saved rollup claim';
  END IF;
  UPDATE public.sessions SET ended_at = ended_at WHERE id = v_session;
  IF (SELECT amount FROM public.teacher_earnings
      WHERE teacher_id = v_teacher AND notes LIKE '%auto:session:%' LIMIT 1) <> 6.67
     OR (SELECT count(*) FROM public.teacher_session_earning_claims WHERE session_id = v_session) <> 1 THEN
    RAISE EXCEPTION 'Retry duplicated the session earning claim';
  END IF;

  INSERT INTO public.bookings(
    student_id, teacher_id, scheduled_at, duration_minutes, status, used_subscription, subscription_id
  )
  VALUES (v_low_balance_student, v_teacher, now() + interval '2 days', 20, 'confirmed', true, v_low_subscription)
  RETURNING id INTO v_low_booking;
  SELECT id INTO v_low_session FROM public.sessions WHERE booking_id = v_low_booking;
  IF v_low_session IS NULL THEN
    INSERT INTO public.sessions(booking_id) VALUES (v_low_booking) RETURNING id INTO v_low_session;
  END IF;
  UPDATE public.user_subscriptions SET remaining_minutes = 10 WHERE id = v_low_subscription;

  v_failed := false;
  BEGIN
    UPDATE public.sessions
    SET started_at = now() - interval '20 minutes',
        ended_at = now(),
        duration_seconds = 1200
    WHERE id = v_low_session;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Insufficient-balance session unexpectedly completed';
  END IF;
  IF (SELECT ended_at FROM public.sessions WHERE id = v_low_session) IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.teacher_session_earning_claims WHERE session_id = v_low_session)
     OR (SELECT remaining_minutes FROM public.user_subscriptions WHERE id = v_low_subscription) <> 10 THEN
    RAISE EXCEPTION 'Failed settlement did not roll back the session, claim, and balance together';
  END IF;
END;
$$;

ROLLBACK;
