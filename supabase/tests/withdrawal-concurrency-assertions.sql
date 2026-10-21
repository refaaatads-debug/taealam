-- Verify one of two racing requests reserved the same teacher's funds exactly once.
DO $$
DECLARE
  v_requests integer;
  v_allocated numeric;
  v_available numeric;
BEGIN
  SELECT count(*) INTO v_requests FROM public.withdrawal_requests
  WHERE teacher_id = 'a9010000-0000-4000-8000-000000000001' AND status = 'pending';
  SELECT COALESCE(sum(a.amount), 0) INTO v_allocated
  FROM public.teacher_withdrawal_earning_allocations a
  JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
  WHERE wr.teacher_id = 'a9010000-0000-4000-8000-000000000001'
    AND wr.status IN ('pending', 'approved', 'processing', 'paid');
  SELECT COALESCE(sum(e.amount), 0) - v_allocated INTO v_available
  FROM public.teacher_earnings e
  WHERE e.teacher_id = 'a9010000-0000-4000-8000-000000000001' AND e.status = 'confirmed';
  IF v_requests <> 1 OR v_allocated <> 100 OR v_available <> 20 THEN
    RAISE EXCEPTION 'Withdrawal race mismatch: requests %, allocated %, available %',
      v_requests, v_allocated, v_available;
  END IF;
END;
$$;

DELETE FROM public.teacher_withdrawal_earning_allocations
WHERE withdrawal_request_id IN (
  SELECT id FROM public.withdrawal_requests
  WHERE teacher_id = 'a9010000-0000-4000-8000-000000000001'
);
DELETE FROM public.withdrawal_requests
WHERE teacher_id = 'a9010000-0000-4000-8000-000000000001';
DELETE FROM public.teacher_earnings
WHERE teacher_id = 'a9010000-0000-4000-8000-000000000001';
DELETE FROM public.profiles WHERE user_id = 'a9010000-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id = 'a9010000-0000-4000-8000-000000000001';
DELETE FROM public.user_roles WHERE user_id = 'a9010000-0000-4000-8000-000000000001';
