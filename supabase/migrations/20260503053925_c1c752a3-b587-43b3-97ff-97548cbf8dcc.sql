-- Call Wallet (Pass-through) Reporting RPC
-- Treats teacher wallet topups & call usage as a financial intermediary,
-- NOT as platform revenue. Excluded from invoices and ZATCA reports.

CREATE OR REPLACE FUNCTION public.get_call_wallet_summary(_month text DEFAULT NULL)
RETURNS TABLE(
  inflow_total numeric,
  outflow_total numeric,
  refunds_total numeric,
  net_balance numeric,
  current_wallet_balance numeric,
  topup_count integer,
  call_usage_count integer,
  refund_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH topups AS (
    SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*)::int AS cnt
    FROM public.wallet_transactions
    WHERE type = 'credit'
      AND stripe_session_id IS NOT NULL
      AND (stripe_session_id NOT LIKE 'refund_%')
      AND (_month IS NULL OR to_char(created_at,'YYYY-MM') = _month)
  ),
  usage AS (
    SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*)::int AS cnt
    FROM public.wallet_transactions
    WHERE type = 'debit'
      AND reference_id IS NOT NULL
      AND (_month IS NULL OR to_char(created_at,'YYYY-MM') = _month)
  ),
  refunds AS (
    SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*)::int AS cnt
    FROM public.wallet_transactions
    WHERE type = 'credit'
      AND stripe_session_id LIKE 'refund_%'
      AND (_month IS NULL OR to_char(created_at,'YYYY-MM') = _month)
  ),
  wallet_balance AS (
    SELECT COALESCE(SUM(balance),0) AS bal FROM public.wallets
  )
  SELECT
    topups.amt,
    usage.amt,
    refunds.amt,
    (topups.amt - usage.amt + refunds.amt),
    wallet_balance.bal,
    topups.cnt,
    usage.cnt,
    refunds.cnt
  FROM topups, usage, refunds, wallet_balance
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;

-- Itemized listing for export & audit
CREATE OR REPLACE FUNCTION public.list_call_wallet_transactions(_month text DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  user_id uuid,
  user_name text,
  category text,
  amount numeric,
  balance_after numeric,
  description text,
  reference_id uuid,
  stripe_session_id text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    wt.id,
    wt.created_at,
    wt.user_id,
    COALESCE(p.full_name, '—') AS user_name,
    CASE
      WHEN wt.type = 'credit' AND wt.stripe_session_id LIKE 'refund_%' THEN 'refund'
      WHEN wt.type = 'credit' AND wt.stripe_session_id IS NOT NULL THEN 'topup'
      WHEN wt.type = 'debit' AND wt.reference_id IS NOT NULL THEN 'call_usage'
      ELSE wt.type
    END AS category,
    wt.amount,
    wt.balance_after,
    wt.description,
    wt.reference_id,
    wt.stripe_session_id
  FROM public.wallet_transactions wt
  LEFT JOIN public.profiles p ON p.user_id = wt.user_id
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
    AND (
      (wt.type = 'credit' AND wt.stripe_session_id IS NOT NULL)
      OR (wt.type = 'debit' AND wt.reference_id IS NOT NULL)
    )
    AND (_month IS NULL OR to_char(wt.created_at,'YYYY-MM') = _month)
  ORDER BY wt.created_at DESC
  LIMIT 5000;
$$;

COMMENT ON FUNCTION public.get_call_wallet_summary(text) IS
  'Pass-through call wallet summary. NOT revenue, NOT VAT, excluded from ZATCA invoices.';
COMMENT ON FUNCTION public.list_call_wallet_transactions(text) IS
  'Itemized call wallet transactions (topups, usage, refunds). Pass-through, no VAT.';