-- Run in an isolated production-schema clone. The outer transaction removes all
-- synthetic users, packages, bookings, and reservations.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_student uuid := 'a8100000-0000-4000-8000-000000000001';
  v_teacher uuid := 'a8100000-0000-4000-8000-000000000002';
  v_teacher_profile uuid;
  v_subject uuid;
  v_subscription uuid;
  v_plan uuid;
  v_city uuid;
  v_address uuid;
  v_settings uuid;
  v_group_45 uuid;
  v_group_60 uuid;
  v_booking_45 uuid;
  v_booking_60 uuid;
  v_time_45 timestamptz := (
    date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh') + interval '3 days 12 hours'
  ) AT TIME ZONE 'Asia/Riyadh';
  v_time_60 timestamptz := (
    date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh') + interval '3 days 14 hours'
  ) AT TIME ZONE 'Asia/Riyadh';
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES
    (v_student, 'authenticated', 'authenticated', 'snapshot-student@example.invalid', '', now(), now()),
    (v_teacher, 'authenticated', 'authenticated', 'snapshot-teacher@example.invalid', '', now(), now());
  INSERT INTO public.profiles(user_id, full_name)
  VALUES (v_student, 'Snapshot student'), (v_teacher, 'Snapshot teacher')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.countries(iso2, name_ar, name_en)
  VALUES ('SA', 'السعودية', 'Saudi Arabia')
  ON CONFLICT (iso2) DO NOTHING;
  INSERT INTO public.subjects(name) VALUES ('مادة اختبار') RETURNING id INTO v_subject;
  INSERT INTO public.cities(name_ar, in_person_enabled)
  VALUES ('مدينة اختبار', true) RETURNING id INTO v_city;
  INSERT INTO public.user_addresses(owner_id, city_id, street_address, latitude, longitude)
  VALUES (v_student, v_city, 'عنوان اختبار', 24.7136, 46.6753) RETURNING id INTO v_address;
  INSERT INTO public.teacher_profiles(
    user_id, hourly_rate, is_approved, approval_status, in_person_teacher_rate_sar,
    in_person_enabled, in_person_approval_status, in_person_service_radius_km,
    city_id, in_person_latitude, in_person_longitude, available_days, available_from, available_to
  ) VALUES (
    v_teacher, 50, true, 'approved', 50,
    true, 'approved', 100, v_city, 24.7136, 46.6753,
    ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
    '00:00', '23:59'
  ) RETURNING id INTO v_teacher_profile;
  INSERT INTO public.teacher_subjects(teacher_id, subject_id)
  VALUES (v_teacher_profile, v_subject);
  INSERT INTO public.subscription_plans(tier, name_ar, price, sessions_count, session_duration_minutes)
  VALUES ('basic', 'باقة اختبار', 100, 10, 60) RETURNING id INTO v_plan;
  INSERT INTO public.user_subscriptions(
    user_id, plan_id, remaining_minutes, ends_at, is_active
  ) VALUES (
    v_student, v_plan, 500, now() - interval '1 day', true
  ) RETURNING id INTO v_subscription;
  INSERT INTO public.financial_settings(in_person_instruction_duration_minutes, in_person_default_teacher_rate_sar)
  VALUES (45, 60) RETURNING id INTO v_settings;

  INSERT INTO public.in_person_request_groups(
    student_id, subject_id, scheduled_at, city_id, address_id, visit_address_snapshot, acceptance_deadline
  ) VALUES (
    v_student, v_subject, v_time_45, v_city, v_address,
    jsonb_build_object('city_id', v_city, 'street_address', 'عنوان اختبار', 'latitude', 24.7136, 'longitude', 46.6753),
    v_time_45 - interval '2 hours'
  ) RETURNING id INTO v_group_45;
  IF (SELECT instruction_duration_minutes FROM public.in_person_request_groups WHERE id = v_group_45) <> 45 THEN
    RAISE EXCEPTION '45-minute request did not snapshot the configured teaching duration';
  END IF;
  UPDATE public.in_person_request_groups SET status = 'accepted' WHERE id = v_group_45;
  INSERT INTO public.in_person_request_recipients(
    request_group_id, teacher_id, status, responded_at, offered_teacher_rate_sar, pricing_source
  ) VALUES (v_group_45, v_teacher, 'accepted', now(), 50, 'custom');
  INSERT INTO public.in_person_credit_reservations(
    request_group_id, student_id, subscription_id, idempotency_key
  ) VALUES (v_group_45, v_student, v_subscription, 'snapshot-45');
  INSERT INTO public.bookings(
    student_id, teacher_id, scheduled_at, duration_minutes, status, delivery_mode, visit_address_snapshot
  ) VALUES (
    v_student, v_teacher, v_time_45, 100, 'confirmed', 'in_person',
    jsonb_build_object('city_id', v_city, 'street_address', 'عنوان اختبار', 'latitude', 24.7136, 'longitude', 46.6753)
  ) RETURNING id INTO v_booking_45;

  UPDATE public.financial_settings
  SET in_person_instruction_duration_minutes = 60,
      in_person_default_teacher_rate_sar = 80,
      updated_at = now() + interval '1 second'
  WHERE id = v_settings;
  INSERT INTO public.in_person_request_groups(
    student_id, subject_id, scheduled_at, city_id, address_id, visit_address_snapshot, acceptance_deadline
  ) VALUES (
    v_student, v_subject, v_time_60, v_city, v_address,
    jsonb_build_object('city_id', v_city, 'street_address', 'عنوان اختبار', 'latitude', 24.7136, 'longitude', 46.6753),
    v_time_60 - interval '2 hours'
  ) RETURNING id INTO v_group_60;
  IF (SELECT instruction_duration_minutes FROM public.in_person_request_groups WHERE id = v_group_60) <> 60 THEN
    RAISE EXCEPTION '60-minute request did not snapshot the configured teaching duration';
  END IF;
  UPDATE public.in_person_request_groups SET status = 'accepted' WHERE id = v_group_60;
  INSERT INTO public.in_person_request_recipients(
    request_group_id, teacher_id, status, responded_at, offered_teacher_rate_sar, pricing_source
  ) VALUES (v_group_60, v_teacher, 'accepted', now(), 70, 'custom');
  INSERT INTO public.in_person_credit_reservations(
    request_group_id, student_id, subscription_id, idempotency_key
  ) VALUES (v_group_60, v_student, v_subscription, 'snapshot-60');
  INSERT INTO public.bookings(
    student_id, teacher_id, scheduled_at, duration_minutes, status, delivery_mode, visit_address_snapshot
  ) VALUES (
    v_student, v_teacher, v_time_60, 100, 'confirmed', 'in_person',
    jsonb_build_object('city_id', v_city, 'street_address', 'عنوان اختبار', 'latitude', 24.7136, 'longitude', 46.6753)
  ) RETURNING id INTO v_booking_60;

  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = v_booking_45
      AND instruction_duration_minutes = 45
      AND in_person_teaching_minutes = 45
      AND in_person_package_minutes = 100
      AND in_person_teacher_rate_sar = 50
  ) THEN
    RAISE EXCEPTION '45-minute booking failed to preserve teaching/package minutes or offered teacher price';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = v_booking_60
      AND instruction_duration_minutes = 60
      AND in_person_teaching_minutes = 60
      AND in_person_package_minutes = 100
      AND in_person_teacher_rate_sar = 70
  ) THEN
    RAISE EXCEPTION '60-minute booking failed to preserve teaching/package minutes or offered teacher price';
  END IF;
  IF (SELECT remaining_minutes FROM public.user_subscriptions WHERE id = v_subscription) <> 500 THEN
    RAISE EXCEPTION 'Booking snapshot test unexpectedly deducted package minutes';
  END IF;
END $$;

ROLLBACK;
