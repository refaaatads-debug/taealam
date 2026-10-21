BEGIN;
DO $$
DECLARE
  v_claims integer;
  v_rollups integer;
  v_amount numeric;
  v_balances integer[];
BEGIN
  SELECT count(*) INTO v_claims
  FROM public.teacher_session_earning_claims c
  JOIN public.sessions s ON s.id = c.session_id
  WHERE s.booking_id IN (
    'a3000000-0000-4000-8000-000000000007',
    'a3000000-0000-4000-8000-000000000008'
  );
  SELECT count(*), max(e.amount) INTO v_rollups, v_amount
  FROM public.teacher_earnings e
  WHERE e.teacher_id = 'a3000000-0000-4000-8000-000000000001'
    AND e.month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
    AND e.status = 'unconfirmed'
    AND e.notes LIKE 'auto:session:%';
  SELECT array_agg(s.remaining_minutes ORDER BY s.id) INTO v_balances
  FROM public.user_subscriptions s
  WHERE s.id IN (
    'a3000000-0000-4000-8000-000000000005',
    'a3000000-0000-4000-8000-000000000006'
  );
  IF v_claims <> 2 OR v_rollups <> 1 OR v_amount <> 20
     OR v_balances IS DISTINCT FROM ARRAY[70,70]::integer[] THEN
    RAISE EXCEPTION 'Concurrent settlement mismatch: claims %, rollups %, amount %, balances %',
      v_claims, v_rollups, v_amount, v_balances;
  END IF;
END;
$$;

DELETE FROM public.teacher_session_earning_claims
WHERE session_id IN (
  SELECT id FROM public.sessions
  WHERE booking_id IN ('a3000000-0000-4000-8000-000000000007','a3000000-0000-4000-8000-000000000008')
);
DELETE FROM public.teacher_earnings
WHERE teacher_id = 'a3000000-0000-4000-8000-000000000001'
  AND notes LIKE '%a3000000-0000-4000-8000-000000000009%'
  OR teacher_id = 'a3000000-0000-4000-8000-000000000001'
  AND notes LIKE '%a3000000-0000-4000-8000-000000000010%';
DELETE FROM public.sessions
WHERE booking_id IN ('a3000000-0000-4000-8000-000000000007','a3000000-0000-4000-8000-000000000008');
DELETE FROM public.bookings
WHERE id IN ('a3000000-0000-4000-8000-000000000007','a3000000-0000-4000-8000-000000000008');
DELETE FROM public.user_subscriptions
WHERE id IN ('a3000000-0000-4000-8000-000000000005','a3000000-0000-4000-8000-000000000006');
DELETE FROM public.teacher_profiles WHERE user_id = 'a3000000-0000-4000-8000-000000000001';
DELETE FROM public.subscription_plans WHERE id = 'a3000000-0000-4000-8000-000000000004';
DELETE FROM auth.users
WHERE id IN (
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000003'
);
COMMIT;
