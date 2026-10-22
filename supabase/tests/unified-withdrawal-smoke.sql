-- Synthetic-only test for exact-source allocation, approval-versus-payment
-- accounting, idempotent payment, and rejection/cancellation release. Run in
-- the isolated production-schema clone.
BEGIN;

DELETE FROM public.user_roles
WHERE user_id IN (
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'a9000000-0000-4000-8000-000000000003'
);

INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'withdrawal-teacher@example.invalid', '', now(), now()),
  ('a9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'withdrawal-student@example.invalid', '', now(), now()),
  ('a9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'withdrawal-admin@example.invalid', '', now(), now());
INSERT INTO public.profiles(user_id, full_name)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'Synthetic withdrawal teacher'),
  ('a9000000-0000-4000-8000-000000000002', 'Synthetic withdrawal student'),
  ('a9000000-0000-4000-8000-000000000003', 'Synthetic withdrawal admin')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role)
VALUES ('a9000000-0000-4000-8000-000000000003', 'admin');
INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
VALUES ('a9000000-0000-4000-8000-000000000001', 20, true, 'approved');

INSERT INTO public.bookings(student_id, teacher_id, scheduled_at, duration_minutes, status)
VALUES (
  'a9000000-0000-4000-8000-000000000002',
  'a9000000-0000-4000-8000-000000000001',
  now(), 60, 'confirmed'
);
UPDATE public.bookings
SET delivery_mode = 'in_person', instruction_duration_minutes = 60
WHERE teacher_id = 'a9000000-0000-4000-8000-000000000001';

INSERT INTO public.in_person_teacher_earnings(booking_id, teacher_id, amount, status, available_at)
SELECT id, teacher_id, 60, 'available', now() - interval '1 minute'
FROM public.bookings
WHERE teacher_id = 'a9000000-0000-4000-8000-000000000001';
INSERT INTO public.in_person_teacher_compensations(booking_id, teacher_id, amount, status, available_at)
SELECT id, teacher_id, 30, 'available', now() - interval '1 minute'
FROM public.bookings
WHERE teacher_id = 'a9000000-0000-4000-8000-000000000001';

INSERT INTO public.teacher_earnings(teacher_id, amount, month, status, earning_type, notes)
VALUES (
  'a9000000-0000-4000-8000-000000000001',
  20,
  to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM'),
  'confirmed',
  'bonus',
  'synthetic withdrawal allocation test'
);

-- The platform's explicit manual payout is the only way to add the in-person
-- amount to the teacher's online withdrawal balance.
INSERT INTO public.teacher_earnings(teacher_id, amount, month, status, earning_type, notes)
VALUES (
  'a9000000-0000-4000-8000-000000000001',
  80,
  to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM'),
  'confirmed',
  'bonus',
  'synthetic manual payout balance'
);

SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_request uuid;
  v_second_request uuid;
  v_cancel_request uuid;
  v_online numeric;
  v_lesson numeric;
  v_compensation numeric;
  v_active numeric;
  v_paid numeric;
  v_payment_count integer;
  v_retry_failed boolean := false;
  v_in_person_only_rejected boolean := false;
  v_payment_result jsonb;
BEGIN
  IF (SELECT available_balance FROM public.get_teacher_earnings_breakdown(
      'a9000000-0000-4000-8000-000000000001')) <> 100 THEN
    RAISE EXCEPTION 'Withdrawable balance must include manual/online entries only';
  END IF;

  BEGIN
    INSERT INTO public.withdrawal_requests(teacher_id, amount)
    VALUES ('a9000000-0000-4000-8000-000000000001', 110);
  EXCEPTION WHEN OTHERS THEN
    v_in_person_only_rejected := true;
  END;
  IF NOT v_in_person_only_rejected THEN
    RAISE EXCEPTION 'Withdrawal used in-person earnings before platform payout';
  END IF;

  INSERT INTO public.withdrawal_requests(teacher_id, amount)
  VALUES ('a9000000-0000-4000-8000-000000000001', 100)
  RETURNING id INTO v_request;

  SELECT COALESCE(sum(amount), 0) INTO v_online
  FROM public.teacher_withdrawal_earning_allocations
  WHERE withdrawal_request_id = v_request;
  SELECT COALESCE(sum(amount), 0) INTO v_lesson
  FROM public.teacher_withdrawal_in_person_allocations
  WHERE withdrawal_request_id = v_request AND in_person_earning_id IS NOT NULL;
  SELECT COALESCE(sum(amount), 0) INTO v_compensation
  FROM public.teacher_withdrawal_in_person_allocations
  WHERE withdrawal_request_id = v_request AND in_person_compensation_id IS NOT NULL;

  IF v_online <> 100 OR v_lesson <> 0 OR v_compensation <> 0 THEN
    RAISE EXCEPTION 'Unexpected exact-source allocation: online %, lesson %, compensation %',
      v_online, v_lesson, v_compensation;
  END IF;

  UPDATE public.withdrawal_requests SET status = 'approved' WHERE id = v_request;
  SELECT paid_total INTO v_paid
  FROM public.get_teacher_withdrawal_summary('a9000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_payment_count
  FROM public.teacher_payments
  WHERE withdrawal_request_id = v_request;
  IF v_paid <> 0 OR v_payment_count <> 0 THEN
    RAISE EXCEPTION 'Approval alone must not create a paid total or payment record';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
  v_payment_result := public.approve_teacher_withdrawal_and_record_payment(v_request, 'synthetic actual payment');
  IF COALESCE((v_payment_result ->> 'already_paid')::boolean, true) THEN
    RAISE EXCEPTION 'First actual payment was incorrectly reported as already paid';
  END IF;
  SELECT paid_total INTO v_paid
  FROM public.get_teacher_withdrawal_summary('a9000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_payment_count
  FROM public.teacher_payments
  WHERE withdrawal_request_id = v_request;
  IF v_paid <> 100 OR v_payment_count <> 1 THEN
    RAISE EXCEPTION 'Actual payment was not recorded exactly once (paid %, records %)', v_paid, v_payment_count;
  END IF;
  v_payment_result := public.approve_teacher_withdrawal_and_record_payment(v_request, 'synthetic retry');
  IF NOT COALESCE((v_payment_result ->> 'already_paid')::boolean, false) THEN
    RAISE EXCEPTION 'Retry did not report the payment as already recorded';
  END IF;
  SELECT count(*) INTO v_payment_count
  FROM public.teacher_payments
  WHERE withdrawal_request_id = v_request;
  IF v_payment_count <> 1 THEN
    RAISE EXCEPTION 'Retry duplicated the actual payment record';
  END IF;

  INSERT INTO public.teacher_earnings(teacher_id, amount, month, status, earning_type, notes)
  VALUES (
    'a9000000-0000-4000-8000-000000000001',
    100,
    to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM'),
    'confirmed',
    'bonus',
    'synthetic next payout balance'
  );
  PERFORM set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);

  INSERT INTO public.withdrawal_requests(teacher_id, amount)
  VALUES ('a9000000-0000-4000-8000-000000000001', 100)
  RETURNING id INTO v_second_request;
  UPDATE public.withdrawal_requests SET status = 'rejected' WHERE id = v_second_request;

  INSERT INTO public.withdrawal_requests(teacher_id, amount)
  VALUES ('a9000000-0000-4000-8000-000000000001', 100)
  RETURNING id INTO v_cancel_request;
  IF NOT public.cancel_own_withdrawal_request(v_cancel_request) THEN
    RAISE EXCEPTION 'Cancellation did not report success';
  END IF;

  BEGIN
    PERFORM public.cancel_own_withdrawal_request(v_cancel_request);
  EXCEPTION WHEN OTHERS THEN
    v_retry_failed := true;
  END;
  IF NOT v_retry_failed THEN
    RAISE EXCEPTION 'Repeated cancellation should be rejected';
  END IF;

  SELECT COALESCE(sum(a.amount), 0) INTO v_active
  FROM public.teacher_withdrawal_in_person_allocations a
  JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
  WHERE wr.teacher_id = 'a9000000-0000-4000-8000-000000000001'
    AND wr.status IN ('pending', 'approved', 'processing', 'paid');
  IF v_active <> 0 THEN
    RAISE EXCEPTION 'Rejected/cancelled requests still reserve in-person amount %', v_active;
  END IF;

  IF (SELECT status FROM public.withdrawal_requests WHERE id = v_cancel_request) <> 'cancelled' THEN
    RAISE EXCEPTION 'Request status was not cancelled';
  END IF;
END;
$$;

ROLLBACK;
