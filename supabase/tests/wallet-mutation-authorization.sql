-- Only run in an isolated production-schema clone. No real payments.
BEGIN;
DO $$
DECLARE
  signature regprocedure;
  role_name text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.credit_wallet_balance(uuid,numeric,text,text)'::regprocedure,
    'public.deduct_wallet_balance(uuid,numeric,uuid,text)'::regprocedure
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(role_name, signature, 'EXECUTE') THEN
        RAISE EXCEPTION 'Untrusted role % can execute %', role_name, signature;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Service access broken: %', signature;
    END IF;
  END LOOP;
END;
$$;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE
  uid uuid := 'ba280000-0000-4000-8000-000000000001';
  invalid numeric;
  failed boolean;
  balance_before numeric;
  role_name text;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (uid, 'authenticated', 'authenticated', 'wallet-security@example.invalid', '', now(), now());
  PERFORM public.credit_wallet_balance(uid, 100, 'wallet-test-credit', 'Synthetic fixture');
  PERFORM public.deduct_wallet_balance(uid, 10, NULL, 'Synthetic fixture');
  SELECT balance INTO balance_before FROM public.wallets WHERE user_id = uid;
  IF balance_before <> 90 THEN RAISE EXCEPTION 'Service credit/debit failed'; END IF;

  FOREACH invalid IN ARRAY ARRAY[NULL::numeric, 0, -1, 'NaN'::numeric, 'Infinity'::numeric, 1.001] LOOP
    failed := false;
    BEGIN
      PERFORM public.credit_wallet_balance(uid, invalid, 'invalid', 'Synthetic fixture');
    EXCEPTION WHEN invalid_parameter_value THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Invalid credit accepted: %', invalid; END IF;
    failed := false;
    BEGIN
      PERFORM public.deduct_wallet_balance(uid, invalid, NULL, 'Synthetic fixture');
    EXCEPTION WHEN invalid_parameter_value THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Invalid debit accepted: %', invalid; END IF;
  END LOOP;

  -- Even if a future grant accidentally reopens the RPC, its body fails closed.
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    PERFORM set_config('request.jwt.claim.role', role_name, true);
    failed := false;
    BEGIN
      PERFORM public.credit_wallet_balance(uid, 10, 'unauthorized', 'Synthetic fixture');
    EXCEPTION WHEN insufficient_privilege THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Internal credit guard failed'; END IF;
    failed := false;
    BEGIN
      PERFORM public.deduct_wallet_balance(uid, 10, NULL, 'Synthetic fixture');
    EXCEPTION WHEN insufficient_privilege THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Internal debit guard failed'; END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  failed := false;
  BEGIN
    -- Duplicate transaction uniqueness must roll back the preceding balance update.
    PERFORM public.credit_wallet_balance(uid, 100, 'wallet-test-credit', 'Duplicate fixture');
  EXCEPTION WHEN unique_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Duplicate credit was accepted'; END IF;
  IF (SELECT balance FROM public.wallets WHERE user_id = uid) <> balance_before THEN
    RAISE EXCEPTION 'Failed request changed wallet balance';
  END IF;
END;
$$;
ROLLBACK;
