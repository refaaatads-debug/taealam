-- Production-schema smoke test: online no-show expiry/refund, mode isolation,
-- and Arabic notices for the dedicated in-person expiry transition.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_teacher uuid := 'a4000000-0000-4000-8000-000000000001';
  v_student uuid := 'a4000000-0000-4000-8000-000000000002';
  v_plan uuid := 'a4000000-0000-4000-8000-000000000003';
  v_subscription uuid := 'a4000000-0000-4000-8000-000000000004';
  v_online_booking uuid := 'a4000000-0000-4000-8000-000000000005';
  v_in_person_booking uuid := 'a4000000-0000-4000-8000-000000000006';
  v_expired_count integer;
  v_online_notices integer;
  v_student_balance_notice integer;
  v_in_person_notices integer;
  v_online_refund integer;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES
    (v_teacher, 'authenticated', 'authenticated', 'expiry-teacher@example.invalid', '', now(), now()),
    (v_student, 'authenticated', 'authenticated', 'expiry-student@example.invalid', '', now(), now());
  INSERT INTO public.profiles(user_id, full_name)
  VALUES (v_teacher, 'Synthetic expiry teacher'), (v_student, 'Synthetic expiry student')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
  VALUES (v_teacher, 20, true, 'approved');
  INSERT INTO public.subscription_plans(id, tier, name_ar, price, sessions_count, session_duration_minutes)
  VALUES (v_plan, 'basic', 'خطة اختبار انتهاء الحجز', 1, 1, 60);
  INSERT INTO public.user_subscriptions(
    id, user_id, plan_id, starts_at, ends_at, is_active, remaining_minutes, total_hours, session_duration_minutes
  ) VALUES (v_subscription, v_student, v_plan, now()-interval '1 day', now()+interval '10 days', true, 60, 1, 60);

  INSERT INTO public.bookings(
    id, student_id, teacher_id, scheduled_at, duration_minutes, status,
    used_subscription, subscription_id, delivery_mode
  ) VALUES
    (v_online_booking, v_student, v_teacher, now()-interval '3 hours', 60, 'confirmed', true, v_subscription, 'online'),
    (v_in_person_booking, v_student, v_teacher, now()-interval '4 hours', 45, 'confirmed', false, NULL, 'online');

  UPDATE public.bookings SET delivery_mode = 'in_person' WHERE id = v_in_person_booking;

  SELECT expired_count INTO v_expired_count
  FROM public.auto_expire_stale_bookings();
  IF v_expired_count <> 1 THEN
    RAISE EXCEPTION 'Expected one online expiry, got %', v_expired_count;
  END IF;
  IF (SELECT status::text FROM public.bookings WHERE id = v_in_person_booking) <> 'confirmed' THEN
    RAISE EXCEPTION 'Generic expiry processor touched an in-person booking';
  END IF;
  SELECT count(*) INTO v_online_notices
  FROM public.notifications
  WHERE user_id IN (v_student, v_teacher)
    AND type = 'booking_cancelled'
    AND title = 'تم إلغاء الحصة تلقائياً';
  IF v_online_notices <> 2 THEN
    RAISE EXCEPTION 'Expected Arabic no-show notices for both users, got %', v_online_notices;
  END IF;
  SELECT count(*) INTO v_student_balance_notice
  FROM public.notifications
  WHERE user_id = v_student
    AND type = 'booking_cancelled'
    AND body LIKE '%لم تُخصم دقائق من رصيدك لعدم بدء الحصة%';
  IF v_student_balance_notice <> 1 THEN
    RAISE EXCEPTION 'Expected an accurate Arabic no-debit notice for the student';
  END IF;
  SELECT remaining_minutes INTO v_online_refund
  FROM public.user_subscriptions WHERE id = v_subscription;
  IF v_online_refund <> 60 THEN
    RAISE EXCEPTION 'Online no-show must not debit minutes before a session starts, got %', v_online_refund;
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled', cancellation_reason = 'attendance_window_expired'
  WHERE id = v_in_person_booking;
  SELECT count(*) INTO v_in_person_notices
  FROM public.notifications
  WHERE user_id IN (v_student, v_teacher)
    AND type = 'booking_cancelled'
    AND title = 'انتهت مهلة تأكيد الحضور';
  IF v_in_person_notices <> 2 THEN
    RAISE EXCEPTION 'Expected two dedicated in-person expiry notices, got %', v_in_person_notices;
  END IF;
END;
$$;

ROLLBACK;
