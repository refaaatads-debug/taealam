
-- withdrawal_requests
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='withdrawal_requests') THEN
    EXECUTE 'ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage withdrawals" ON public.withdrawal_requests';
    EXECUTE 'DROP POLICY IF EXISTS "Admins manage withdrawals" ON public.withdrawal_requests';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage all withdrawals" ON public.withdrawal_requests';
    EXECUTE 'DROP POLICY IF EXISTS "Admins or withdrawal managers can manage withdrawals" ON public.withdrawal_requests';
    EXECUTE 'DROP POLICY IF EXISTS "Teachers can view own withdrawals" ON public.withdrawal_requests';
    EXECUTE 'DROP POLICY IF EXISTS "Teachers can create own withdrawals" ON public.withdrawal_requests';
    EXECUTE $p$CREATE POLICY "Admins or withdrawal managers can manage withdrawals"
      ON public.withdrawal_requests FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_withdrawals'))
      WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_withdrawals'))$p$;
    EXECUTE $p$CREATE POLICY "Teachers can view own withdrawals"
      ON public.withdrawal_requests FOR SELECT TO authenticated
      USING (auth.uid() = teacher_id)$p$;
    EXECUTE $p$CREATE POLICY "Teachers can create own withdrawals"
      ON public.withdrawal_requests FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = teacher_id)$p$;
  END IF;
END $$;

-- wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage wallets" ON public.wallets;
DROP POLICY IF EXISTS "Admins manage all wallets" ON public.wallets;
DROP POLICY IF EXISTS "Admins or wallet managers can manage wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users view own wallet" ON public.wallets;
CREATE POLICY "Admins or wallet managers can manage wallets"
ON public.wallets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_wallets'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_wallets'));
CREATE POLICY "Users view own wallet"
ON public.wallets FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admins manage wallet transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admins or wallet managers can manage wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Users view own wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Admins or wallet managers can manage wallet_transactions"
ON public.wallet_transactions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_wallets'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_wallets'));
CREATE POLICY "Users view own wallet_transactions"
ON public.wallet_transactions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- call_logs
DROP POLICY IF EXISTS "Admins manage all call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Admins or wallet managers can manage call_logs" ON public.call_logs;
CREATE POLICY "Admins or wallet managers can manage call_logs"
ON public.call_logs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_wallets'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_wallets'));

-- financial_months
DROP POLICY IF EXISTS "Admins can manage financial_months" ON public.financial_months;
DROP POLICY IF EXISTS "Admins or earnings managers can manage financial_months" ON public.financial_months;
CREATE POLICY "Admins or earnings managers can manage financial_months"
ON public.financial_months FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_teacher_earnings'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_teacher_earnings'));
