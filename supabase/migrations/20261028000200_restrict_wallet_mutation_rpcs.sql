-- Preserve existing API signatures for verified payment/call/admin services.
-- Browser clients must never mutate wallet balances via SECURITY DEFINER RPCs.
BEGIN;

DO $$
DECLARE
  candidate record;
BEGIN
  FOR candidate IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('credit_wallet_balance', 'deduct_wallet_balance')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', candidate.signature);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_wallet_balance(
  _user_id uuid, _amount numeric, _stripe_session_id text, _description text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _new_balance numeric;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Wallet mutations require a trusted service' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0
     OR _amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR _amount <> round(_amount, 2) THEN
    RAISE EXCEPTION 'Invalid wallet amount or user' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.wallets (user_id, balance)
  VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = wallets.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;
  INSERT INTO public.wallet_transactions (
    user_id, type, amount, balance_after, stripe_session_id, description
  ) VALUES (_user_id, 'credit', _amount, _new_balance, _stripe_session_id, _description);
  RETURN _new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_wallet_balance(
  _user_id uuid, _amount numeric, _reference_id uuid, _description text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _new_balance numeric;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Wallet mutations require a trusted service' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0
     OR _amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR _amount <> round(_amount, 2) THEN
    RAISE EXCEPTION 'Invalid wallet amount or user' USING ERRCODE = '22023';
  END IF;
  UPDATE public.wallets
  SET balance = balance - _amount, updated_at = now()
  WHERE user_id = _user_id AND balance >= _amount
  RETURNING balance INTO _new_balance;
  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  INSERT INTO public.wallet_transactions (
    user_id, type, amount, balance_after, reference_id, description
  ) VALUES (_user_id, 'debit', _amount, _new_balance, _reference_id, _description);
  RETURN _new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_balance(uuid,numeric,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_wallet_balance(uuid,numeric,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_balance(uuid,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_wallet_balance(uuid,numeric,uuid,text) TO service_role;
COMMIT;
