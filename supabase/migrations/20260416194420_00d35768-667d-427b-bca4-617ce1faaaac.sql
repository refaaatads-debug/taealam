-- Wallets table
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all wallets" ON public.wallets
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Call logs table
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  student_id uuid,
  booking_id uuid,
  twilio_call_sid text,
  student_phone text,
  duration_minutes numeric(5,2) DEFAULT 0,
  estimated_minutes integer DEFAULT 0,
  cost numeric(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'initiated',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view own call logs" ON public.call_logs
  FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Students view own call logs" ON public.call_logs
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Admins manage all call logs" ON public.call_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Wallet transactions
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(10,2) NOT NULL,
  balance_after numeric(10,2) NOT NULL,
  reference_id uuid,
  description text,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transactions" ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all transactions" ON public.wallet_transactions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Auto-create wallet when teacher profile is created
CREATE OR REPLACE FUNCTION public.auto_create_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balance)
  VALUES (NEW.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_create_wallet_for_teacher
  AFTER INSERT ON public.teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_wallet();

-- Backfill wallets for existing teachers
INSERT INTO public.wallets (user_id, balance)
SELECT user_id, 0 FROM public.teacher_profiles
ON CONFLICT (user_id) DO NOTHING;

-- Atomic deduct function
CREATE OR REPLACE FUNCTION public.deduct_wallet_balance(_user_id uuid, _amount numeric, _reference_id uuid, _description text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance numeric;
BEGIN
  UPDATE public.wallets
  SET balance = balance - _amount, updated_at = now()
  WHERE user_id = _user_id AND balance >= _amount
  RETURNING balance INTO _new_balance;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
  VALUES (_user_id, 'debit', _amount, _new_balance, _reference_id, _description);

  RETURN _new_balance;
END;
$$;

-- Atomic credit function
CREATE OR REPLACE FUNCTION public.credit_wallet_balance(_user_id uuid, _amount numeric, _stripe_session_id text, _description text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance numeric;
BEGIN
  INSERT INTO public.wallets (user_id, balance)
  VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = wallets.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, stripe_session_id, description)
  VALUES (_user_id, 'credit', _amount, _new_balance, _stripe_session_id, _description);

  RETURN _new_balance;
END;
$$;