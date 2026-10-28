-- Isolated database only; everything below rolls back.
BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE
  actor uuid := 'ba280000-0000-4000-8000-000000000011';
  target uuid := 'ba280000-0000-4000-8000-000000000012';
  op uuid := 'ba280000-0000-4000-8000-000000000013';
  result jsonb;
  failed boolean := false;
BEGIN
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
  VALUES (actor,'authenticated','authenticated','wallet-admin@example.invalid',now(),now()),
         (target,'authenticated','authenticated','wallet-target@example.invalid',now(),now());
  INSERT INTO public.user_roles(user_id,role) VALUES(actor,'admin');
  result := public.apply_admin_wallet_operation(op,actor,target,'credit',50,'test');
  IF (result->>'newBalance')::numeric <> 50 THEN RAISE EXCEPTION 'First credit failed'; END IF;
  result := public.apply_admin_wallet_operation(op,actor,target,'credit',50,'test');
  IF (result->>'duplicate')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Retry not recognized'; END IF;
  BEGIN
    PERFORM public.apply_admin_wallet_operation(op,actor,target,'credit',51,'test');
  EXCEPTION WHEN invalid_parameter_value THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Different payload accepted with same key'; END IF;
  IF (SELECT balance FROM public.wallets WHERE user_id=target) <> 50 THEN
    RAISE EXCEPTION 'Retry changed balance';
  END IF;
  IF (SELECT count(*) FROM public.wallet_transactions WHERE user_id=target) <> 1 THEN
    RAISE EXCEPTION 'Retry duplicated ledger';
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.reject_test_wallet_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source = 'admin_wallet_action' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_test_wallet_audit BEFORE INSERT ON public.system_logs
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_wallet_audit();
DO $$
DECLARE failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.apply_admin_wallet_operation(
      'ba280000-0000-4000-8000-000000000014','ba280000-0000-4000-8000-000000000011',
      'ba280000-0000-4000-8000-000000000012','debit',10,'test failure');
  EXCEPTION WHEN raise_exception THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Synthetic audit failure did not run'; END IF;
  IF (SELECT balance FROM public.wallets WHERE user_id='ba280000-0000-4000-8000-000000000012') <> 50 THEN
    RAISE EXCEPTION 'Audit failure left financial side effects';
  END IF;
  IF EXISTS(SELECT 1 FROM public.admin_wallet_operations
    WHERE operation_id='ba280000-0000-4000-8000-000000000014') THEN
    RAISE EXCEPTION 'Audit failure consumed the operation key';
  END IF;
END;
$$;
ROLLBACK;
