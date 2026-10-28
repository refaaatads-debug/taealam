BEGIN;
CREATE TABLE public.admin_wallet_operations (
  operation_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('credit', 'debit')),
  amount numeric NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
  note text NOT NULL DEFAULT '',
  balance_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_wallet_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_wallet_operations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_admin_wallet_operation(
  _operation_id uuid, _actor_id uuid, _user_id uuid,
  _action text, _amount numeric, _note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous public.admin_wallet_operations%ROWTYPE;
  result_balance numeric;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     OR NOT public.has_role(_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator service required' USING ERRCODE = '42501';
  END IF;
  IF _operation_id IS NULL OR _user_id IS NULL OR _amount IS NULL
     OR _amount <= 0 OR _amount::text IN ('NaN','Infinity','-Infinity')
     OR _amount <> round(_amount, 2) OR _action IS NULL
     OR _action NOT IN ('credit','debit') OR length(COALESCE(_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Invalid operation' USING ERRCODE = '22023';
  END IF;
  -- Serializes concurrent retries, including before the first row exists.
  PERFORM pg_advisory_xact_lock(hashtextextended(_operation_id::text, 0));
  SELECT * INTO previous FROM public.admin_wallet_operations
    WHERE operation_id = _operation_id;
  IF FOUND THEN
    IF previous.actor_id <> _actor_id OR previous.target_user_id <> _user_id
       OR previous.action <> _action OR previous.amount <> _amount
       OR previous.note <> COALESCE(_note, '') THEN
      RAISE EXCEPTION 'Operation key reused for different input' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('success', true, 'newBalance', previous.balance_after,
      'operationId', _operation_id, 'duplicate', true);
  END IF;
  IF _action = 'credit' THEN
    result_balance := public.credit_wallet_balance(
      _user_id, _amount, 'admin_' || _operation_id::text, 'Administrative credit'
    );
  ELSE
    result_balance := public.deduct_wallet_balance(
      _user_id, _amount, _operation_id, 'Administrative debit'
    );
  END IF;
  INSERT INTO public.admin_wallet_operations (
    operation_id, actor_id, target_user_id, action, amount, note, balance_after
  ) VALUES (_operation_id, _actor_id, _user_id, _action, _amount, COALESCE(_note, ''), result_balance);
  -- An audit failure rolls back BOTH the balance and the operation key.
  INSERT INTO public.system_logs (level, source, message, user_id, metadata)
  VALUES ('info', 'admin_wallet_action', 'Administrative wallet operation', _actor_id,
    jsonb_build_object('operation_id', _operation_id, 'action', _action,
      'target_user', _user_id, 'amount', _amount, 'new_balance', result_balance));
  RETURN jsonb_build_object('success', true, 'newBalance', result_balance,
    'operationId', _operation_id, 'duplicate', false);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_admin_wallet_operation(uuid,uuid,uuid,text,numeric,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_wallet_operation(uuid,uuid,uuid,text,numeric,text)
  TO service_role;
COMMIT;
