-- Synthetic-only test for exact-source allocation, rejection/cancellation release,
-- and idempotent cancellation. Run inside the isolated production-schema clone.
BEGIN;

DELETE FROM public.user_roles
WHERE user_id IN (
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002'
);

INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'withdrawal-teacher@example.invalid', '', now(), now()),
  ('a9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'withdrawal-student@example.invalid', '', now(), now());
INSERT INTO public.profiles(user_id, full_name)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'Synthetic withdrawal teacher'),
  ('a9000000-0000-4000-8000-000000000002', 'Synthetic withdrawal student')
ON CONFLICT (user_id) DO NOTHING;
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

SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_request uuid;
  v_second_request uuid;
  v_online numeric;
  v_lesson numeric;
  v_compensation numeric;
  v_active numeric;
  v_retry_failed boolean := false;
BEGIN
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

  IF v_online <> 20 OR v_lesson <> 60 OR v_compensation <> 20 THEN
    RAISE EXCEPTION 'Unexpected exact-source allocation: online %, lesson %, compensation %',
      v_online, v_lesson, v_compensation;
  END IF;

  UPDATE public.withdrawal_requests SET status = 'rejected' WHERE id = v_request;
  INSERT INTO public.withdrawal_requests(teacher_id, amount)
  VALUES ('a9000000-0000-4000-8000-000000000001', 100)
  RETURNING id INTO v_second_request;
  IF NOT public.cancel_own_withdrawal_request(v_second_request) THEN
    RAISE EXCEPTION 'Cancellation did not report success';
  END IF;

  BEGIN
    PERFORM public.cancel_own_withdrawal_request(v_second_request);
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

  IF (SELECT status FROM public.withdrawal_requests WHERE id = v_second_request) <> 'cancelled' THEN
    RAISE EXCEPTION 'Request status was not cancelled';
  END IF;
END;
$$;

ROLLBACK;
