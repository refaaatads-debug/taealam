-- Keep withdrawable funds restricted to confirmed administrator-added entries.
-- RLS remains enabled; this grant only makes the existing RLS policy reachable.
DO $rls_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'teacher_withdrawal_earning_allocations'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS must remain enabled on teacher withdrawal allocations';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teacher_withdrawal_earning_allocations'
      AND policyname = 'Admins manage teacher withdrawal allocations'
  ) THEN
    RAISE EXCEPTION 'Expected admin/withdrawal-manager RLS policy is missing';
  END IF;
END;
$rls_check$;
GRANT SELECT ON TABLE public.teacher_withdrawal_earning_allocations TO authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  -- Remove calendar expiry from the active online booking trigger.
  v_definition := pg_get_functiondef(
    'public.check_student_subscription_for_instant_session()'::regprocedure
  );
  v_old := 'AND ends_at > now()';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected online subscription validator; refusing unsafe rewrite';
  END IF;
  EXECUTE replace(v_definition, v_old, '');

  -- Remove calendar expiry from the active in-person reservation RPC.
  v_definition := pg_get_functiondef(
    'public.create_in_person_request(uuid,timestamp with time zone,uuid,uuid,uuid[],text)'::regprocedure
  );
  v_old := 'AND s.ends_at > p_scheduled_at';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected in-person reservation function; refusing unsafe rewrite';
  END IF;
  EXECUTE replace(v_definition, v_old, '');

  -- Keep the dormant request validator consistent if it is wired back later.
  v_definition := pg_get_functiondef(
    'public.validate_booking_request_against_balance()'::regprocedure
  );
  v_old := 'AND (us.ends_at IS NULL OR us.ends_at >= now())';
  IF position(v_old IN v_definition) > 0 THEN
    EXECUTE replace(v_definition, v_old, '');
  END IF;

  -- Withdrawal validation must only accept confirmed admin-added funds.
  v_definition := pg_get_functiondef(
    'public.validate_withdrawal_minimum()'::regprocedure
  );
  v_old := 'WHERE e.teacher_id = NEW.teacher_id AND e.status = ''confirmed'' AND e.amount > 0';
  v_new := 'WHERE e.teacher_id = NEW.teacher_id AND e.status = ''confirmed'' AND e.added_by_admin IS NOT NULL AND e.amount > 0';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected withdrawal validator; refusing unsafe rewrite';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := 'JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id' || E'\n' ||
    '     WHERE wr.teacher_id = NEW.teacher_id';
  v_new := 'JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id' || E'\n' ||
    '      JOIN public.teacher_earnings source ON source.id = a.teacher_earning_id' || E'\n' ||
    '      WHERE wr.teacher_id = NEW.teacher_id' || E'\n' ||
    '        AND source.status = ''confirmed''' || E'\n' ||
    '        AND source.added_by_admin IS NOT NULL' || E'\n' ||
    '        AND source.amount > 0';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected withdrawal reservation source; refusing unsafe rewrite';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;

  v_definition := pg_get_functiondef(
    'public.allocate_teacher_earnings_for_withdrawal()'::regprocedure
  );
  v_old := 'AND e.status = ''confirmed''' || E'\n' || '      AND e.amount > 0';
  v_new := 'AND e.status = ''confirmed''' || E'\n' || '      AND e.added_by_admin IS NOT NULL' || E'\n' || '      AND e.amount > 0';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected withdrawal allocator; refusing unsafe rewrite';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- The single-teacher summary uses the same source and source-specific allocations.
  v_definition := pg_get_functiondef(
    'public.get_teacher_earnings_breakdown(uuid)'::regprocedure
  );
  v_old := 'GREATEST(online.confirmed - online_allocations.allocated, 0)';
  v_new := $replacement$
    GREATEST(
      (SELECT COALESCE(sum(e.amount), 0)
       FROM public.teacher_earnings e
       WHERE e.teacher_id = _teacher_id
         AND e.status = 'confirmed'
         AND e.added_by_admin IS NOT NULL
         AND e.amount > 0
         AND e.earning_type <> 'deduction')
      -
      (SELECT COALESCE(sum(a.amount), 0)
       FROM public.teacher_withdrawal_earning_allocations a
       JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
       JOIN public.teacher_earnings e ON e.id = a.teacher_earning_id
       WHERE wr.teacher_id = _teacher_id
         AND wr.status IN ('pending', 'approved', 'processing', 'paid')
         AND e.status = 'confirmed'
         AND e.added_by_admin IS NOT NULL
         AND e.amount > 0
         AND e.earning_type <> 'deduction'),
      0)
  $replacement$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected earnings breakdown function; refusing unsafe rewrite';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := 'online.paid + in_person.paid + payments.paid';
  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, 'payments.paid');
  END IF;
  EXECUTE v_definition;

  -- The dashboard withdrawal summary exposes the same available and paid values.
  v_definition := pg_get_functiondef(
    'public.get_teacher_withdrawal_summary(uuid)'::regprocedure
  );
  v_old := 'WHERE e.teacher_id = _teacher_id AND e.status = ''confirmed'' AND e.amount > 0';
  v_new := 'WHERE e.teacher_id = _teacher_id AND e.status = ''confirmed'' AND e.added_by_admin IS NOT NULL AND e.amount > 0';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected withdrawal summary source; refusing unsafe rewrite';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := 'JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id' || E'\n' ||
    '    WHERE wr.teacher_id = _teacher_id AND wr.status IN (''pending'', ''approved'', ''processing'', ''paid'')';
  v_new := 'JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id' || E'\n' ||
    '    JOIN public.teacher_earnings source ON source.id = a.teacher_earning_id' || E'\n' ||
    '    WHERE wr.teacher_id = _teacher_id AND wr.status IN (''pending'', ''approved'', ''processing'', ''paid'')' ||
    E'\n' || '      AND source.status = ''confirmed'' AND source.added_by_admin IS NOT NULL AND source.amount > 0';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected online allocation summary; refusing unsafe rewrite';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := 'individual.paid + payments.amount + online_paid.amount';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected paid-total formula; refusing unsafe rewrite';
  END IF;
  v_definition := replace(v_definition, v_old, 'payments.amount');
  EXECUTE v_definition;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.admin_list_teacher_withdrawable_balances()
RETURNS TABLE(user_id uuid, available_balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR (
       NOT public.has_role(auth.uid(), 'admin'::public.app_role)
       AND NOT public.has_permission(auth.uid(), 'manage_teacher_earnings'::public.app_permission)
       AND NOT public.has_permission(auth.uid(), 'manage_withdrawals'::public.app_permission)
       AND NOT public.has_permission(auth.uid(), 'manage_teacher_payments'::public.app_permission)
     ) THEN
    RAISE EXCEPTION 'Not authorized to view teacher withdrawable balances'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH manual_confirmed AS (
    SELECT e.teacher_id, sum(e.amount) AS amount
    FROM public.teacher_earnings e
    WHERE e.status = 'confirmed'
      AND e.added_by_admin IS NOT NULL
      AND e.amount > 0
      AND e.earning_type <> 'deduction'
    GROUP BY e.teacher_id
  ),
  allocated AS (
    SELECT e.teacher_id, sum(a.amount) AS amount
    FROM public.teacher_withdrawal_earning_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    JOIN public.teacher_earnings e ON e.id = a.teacher_earning_id
    WHERE wr.status IN ('pending', 'approved', 'processing', 'paid')
      AND e.status = 'confirmed'
      AND e.added_by_admin IS NOT NULL
      AND e.amount > 0
      AND e.earning_type <> 'deduction'
    GROUP BY e.teacher_id
  )
  SELECT tp.user_id,
    GREATEST(COALESCE(m.amount, 0) - COALESCE(a.amount, 0), 0)
  FROM public.teacher_profiles tp
  LEFT JOIN manual_confirmed m ON m.teacher_id = tp.user_id
  LEFT JOIN allocated a ON a.teacher_id = tp.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_teacher_withdrawable_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_withdrawable_balances() TO authenticated;
