-- Runs only in a disposable production-schema clone; verifies the in-person
-- no-attendance deadline releases the original reservation exactly once.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_teacher uuid := 'a5000000-0000-4000-8000-000000000001';
  v_student uuid := 'a5000000-0000-4000-8000-000000000002';
  v_plan uuid := 'a5000000-0000-4000-8000-000000000003';
  v_subscription uuid := 'a5000000-0000-4000-8000-000000000004';
  v_city uuid := 'a5000000-0000-4000-8000-000000000005';
  v_address uuid := 'a5000000-0000-4000-8000-000000000006';
  v_group uuid := 'a5000000-0000-4000-8000-000000000007';
  v_booking uuid := 'a5000000-0000-4000-8000-000000000008';
  v_reservation uuid := 'a5000000-0000-4000-8000-000000000009';
  v_processed integer;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES
    (v_teacher, 'authenticated', 'authenticated', 'deadline-teacher@example.invalid', '', now(), now()),
    (v_student, 'authenticated', 'authenticated', 'deadline-student@example.invalid', '', now(), now());
  INSERT INTO public.profiles(user_id, full_name)
  VALUES (v_teacher, 'Synthetic deadline teacher'), (v_student, 'Synthetic deadline student')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
  VALUES (v_teacher, 20, true, 'approved');
  INSERT INTO public.subscription_plans(id, tier, name_ar, price, sessions_count, session_duration_minutes)
  VALUES (v_plan, 'basic', 'خطة اختبار إرجاع الدقائق', 1, 1, 60);
  INSERT INTO public.user_subscriptions(
    id, user_id, plan_id, starts_at, ends_at, is_active, remaining_minutes, total_hours, session_duration_minutes
  ) VALUES (v_subscription, v_student, v_plan, now()-interval '1 day', now()+interval '10 days', true, 0, 1, 60);
  INSERT INTO public.countries(iso2, name_ar, name_en)
  VALUES ('SA', 'السعودية', 'Saudi Arabia')
  ON CONFLICT (iso2) DO NOTHING;
  INSERT INTO public.cities(id, name_ar, is_active, in_person_enabled)
  VALUES (v_city, 'مدينة اختبار', true, true);
  INSERT INTO public.user_addresses(id, owner_id, city_id, street_address, latitude, longitude)
  VALUES (v_address, v_student, v_city, 'عنوان اختبار مؤقت', 24.7, 46.7);
  INSERT INTO public.in_person_request_groups(
    id, student_id, scheduled_at, city_id, address_id, visit_address_snapshot,
    status, acceptance_deadline, instruction_duration_minutes
  ) VALUES (
    v_group, v_student, now()-interval '2 hours', v_city, v_address,
    jsonb_build_object('address', 'عنوان اختبار مؤقت'), 'accepted', now()-interval '3 hours', 45
  );

  INSERT INTO public.bookings(
    id, student_id, teacher_id, scheduled_at, duration_minutes, status,
    used_subscription, subscription_id, delivery_mode, instruction_duration_minutes
  ) VALUES (
    v_booking, v_student, v_teacher, now()-interval '2 hours', 60, 'confirmed',
    true, v_subscription, 'online', 45
  );
  UPDATE public.bookings SET delivery_mode = 'in_person' WHERE id = v_booking;
  INSERT INTO public.in_person_credit_reservations(
    id, request_group_id, booking_id, student_id, subscription_id,
    reserved_minutes, status, idempotency_key
  ) VALUES (
    v_reservation, v_group, v_booking, v_student, v_subscription,
    100, 'reserved', 'test-deadline-refund-a5000000'
  );
  INSERT INTO public.in_person_teacher_earnings(booking_id, teacher_id, amount, status, available_at)
  VALUES (v_booking, v_teacher, 45, 'pending', now()+interval '1 day');

  SELECT public.process_in_person_deadlines() INTO v_processed;
  IF v_processed <> 1 THEN
    RAISE EXCEPTION 'Expected one processed in-person no-show, got %', v_processed;
  END IF;
  IF (SELECT remaining_minutes FROM public.user_subscriptions WHERE id = v_subscription) <> 100 THEN
    RAISE EXCEPTION 'Reserved minutes were not fully restored';
  END IF;
  IF (SELECT status FROM public.in_person_credit_reservations WHERE id = v_reservation) <> 'released'
     OR (SELECT released_minutes FROM public.in_person_credit_reservations WHERE id = v_reservation) <> 100 THEN
    RAISE EXCEPTION 'Reservation did not transition to a full release';
  END IF;
  IF (SELECT status::text FROM public.bookings WHERE id = v_booking) <> 'cancelled'
     OR (SELECT cancellation_reason FROM public.bookings WHERE id = v_booking) <> 'attendance_window_expired' THEN
    RAISE EXCEPTION 'Booking was not cancelled with the attendance-expired reason';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id IN (v_student,v_teacher)
      AND title = 'انتهت مهلة تأكيد الحضور') <> 2 THEN
    RAISE EXCEPTION 'Expected Arabic attendance-expiry notifications for both users';
  END IF;
  IF (SELECT amount FROM public.in_person_teacher_earnings WHERE booking_id = v_booking) <> 0
     OR (SELECT status FROM public.in_person_teacher_earnings WHERE booking_id = v_booking) <> 'adjusted' THEN
    RAISE EXCEPTION 'No-show teacher earning was not zeroed and adjusted';
  END IF;

  -- A repeated deadline processor run must not refund the same reservation twice.
  SELECT public.process_in_person_deadlines() INTO v_processed;
  IF v_processed <> 0
     OR (SELECT remaining_minutes FROM public.user_subscriptions WHERE id = v_subscription) <> 100 THEN
    RAISE EXCEPTION 'Repeated deadline processing duplicated the refund';
  END IF;
END;
$$;

ROLLBACK;
