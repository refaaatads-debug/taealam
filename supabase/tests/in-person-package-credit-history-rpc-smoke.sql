-- Run only in an isolated production-schema clone. Uses synthetic accounts
-- and rolls back all fixture rows. It never changes a real package balance.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_student_a uuid := 'a9200000-0000-4000-8000-000000000001';
  v_student_b uuid := 'a9200000-0000-4000-8000-000000000002';
  v_plan uuid := 'a9200000-0000-4000-8000-000000000003';
  v_subscription_a uuid := 'a9200000-0000-4000-8000-000000000004';
  v_subscription_b uuid := 'a9200000-0000-4000-8000-000000000005';
  v_city uuid := 'a9200000-0000-4000-8000-000000000006';
  v_address_a uuid := 'a9200000-0000-4000-8000-000000000007';
  v_address_b uuid := 'a9200000-0000-4000-8000-000000000008';
  v_subject uuid;
  v_group_a uuid := 'a9200000-0000-4000-8000-000000000009';
  v_group_b uuid := 'a9200000-0000-4000-8000-000000000010';
  v_reservation_a uuid := 'a9200000-0000-4000-8000-000000000011';
  v_reservation_b uuid := 'a9200000-0000-4000-8000-000000000012';
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES
    (v_student_a, 'authenticated', 'authenticated', 'credit-history-a@example.invalid', '', now(), now()),
    (v_student_b, 'authenticated', 'authenticated', 'credit-history-b@example.invalid', '', now(), now());

  INSERT INTO public.user_roles(user_id, role)
  VALUES
    (v_student_a, 'student'::public.app_role),
    (v_student_b, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.countries(iso2, name_ar, name_en)
  VALUES ('SA', 'السعودية', 'Saudi Arabia')
  ON CONFLICT (iso2) DO NOTHING;
  INSERT INTO public.subjects(name)
  VALUES ('مادة اختبار سجل الرصيد') RETURNING id INTO v_subject;
  INSERT INTO public.cities(id, name_ar, is_active, in_person_enabled)
  VALUES (v_city, 'مدينة اختبار سجل الرصيد', true, true);
  INSERT INTO public.user_addresses(id, owner_id, city_id, street_address, latitude, longitude)
  VALUES
    (v_address_a, v_student_a, v_city, 'عنوان اختبار أ', 24.7, 46.7),
    (v_address_b, v_student_b, v_city, 'عنوان اختبار ب', 24.8, 46.8);
  INSERT INTO public.subscription_plans(id, tier, name_ar, price, sessions_count, session_duration_minutes)
  VALUES (v_plan, 'basic', 'باقة اختبار سجل الرصيد', 1, 1, 60);
  INSERT INTO public.user_subscriptions(
    id, user_id, plan_id, starts_at, ends_at, is_active, remaining_minutes, total_hours, session_duration_minutes
  )
  VALUES
    (v_subscription_a, v_student_a, v_plan, now() - interval '1 day', now() + interval '10 days', true, 55, 1, 60),
    (v_subscription_b, v_student_b, v_plan, now() - interval '1 day', now() + interval '10 days', true, 40, 1, 60);
  INSERT INTO public.in_person_request_groups(
    id, student_id, subject_id, scheduled_at, city_id, address_id,
    visit_address_snapshot, status, acceptance_deadline, instruction_duration_minutes
  )
  VALUES
    (v_group_a, v_student_a, v_subject, now() + interval '2 days', v_city, v_address_a,
      jsonb_build_object('street_address', 'عنوان اختبار أ'), 'accepted', now() + interval '1 day', 45),
    (v_group_b, v_student_b, v_subject, now() + interval '3 days', v_city, v_address_b,
      jsonb_build_object('street_address', 'عنوان اختبار ب'), 'accepted', now() + interval '2 days', 60);
  INSERT INTO public.in_person_credit_reservations(
    id, request_group_id, student_id, subscription_id, reserved_minutes,
    consumed_minutes, released_minutes, status, idempotency_key
  )
  VALUES
    (v_reservation_a, v_group_a, v_student_a, v_subscription_a, 80, 45, 20,
      'partially_settled', 'credit-history-test-a-0001'),
    (v_reservation_b, v_group_b, v_student_b, v_subscription_b, 100, 60, 40,
      'released', 'credit-history-test-b-0001');
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a9200000-0000-4000-8000-000000000001', true);
DO $$
DECLARE
  v_row record;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.get_my_in_person_package_credit_history('a9200000-0000-4000-8000-000000000004');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Student A must see exactly their own reservation; got % rows', v_count;
  END IF;
  SELECT * INTO v_row
  FROM public.get_my_in_person_package_credit_history('a9200000-0000-4000-8000-000000000004');
  IF v_row.reservation_id <> 'a9200000-0000-4000-8000-000000000011'
     OR v_row.reserved_minutes <> 80
     OR v_row.consumed_minutes <> 45
     OR v_row.released_minutes <> 20
     OR v_row.instruction_duration_minutes <> 45 THEN
    RAISE EXCEPTION 'Student A history returned incorrect ledger or teaching-duration values';
  END IF;

  BEGIN
    PERFORM 1
    FROM public.get_my_in_person_package_credit_history('a9200000-0000-4000-8000-000000000005');
    RAISE EXCEPTION 'Student A was allowed to read Student B package';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', 'a9200000-0000-4000-8000-000000000002', true);
  SELECT count(*) INTO v_count
  FROM public.get_my_in_person_package_credit_history('a9200000-0000-4000-8000-000000000005');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Student B must see exactly their own reservation; got % rows', v_count;
  END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.in_person_credit_reservations', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated clients must not have direct reservation-table SELECT';
  END IF;
END;
$$;

ROLLBACK;
