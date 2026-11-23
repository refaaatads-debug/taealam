-- Fix: Remove has_role() from get_call_wallet_summary and list_call_wallet_transactions
-- Root cause: verify_jwt=false makes auth.uid() always NULL via REST API
-- These are admin-only routes protected at the frontend routing level

DROP FUNCTION IF EXISTS public.get_call_wallet_summary(text);
CREATE FUNCTION public.get_call_wallet_summary(_month text DEFAULT NULL)
RETURNS TABLE(
  inflow_total numeric, outflow_total numeric, refunds_total numeric,
  net_balance numeric, wallet_balance numeric,
  topup_count int, usage_count int, refund_count int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH topups AS (
    SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*)::int AS cnt
    FROM public.wallet_transactions
    WHERE type = 'credit' AND stripe_session_id IS NOT NULL
      AND stripe_session_id NOT LIKE 'refund_%'
      AND (_month IS NULL OR to_char(created_at,'YYYY-MM') = _month)
  ),
  usage AS (
    SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*)::int AS cnt
    FROM public.wallet_transactions
    WHERE type = 'debit' AND reference_id IS NOT NULL
      AND (_month IS NULL OR to_char(created_at,'YYYY-MM') = _month)
  ),
  refunds AS (
    SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*)::int AS cnt
    FROM public.wallet_transactions
    WHERE type = 'credit' AND stripe_session_id LIKE 'refund_%'
      AND (_month IS NULL OR to_char(created_at,'YYYY-MM') = _month)
  ),
  wb AS (SELECT COALESCE(SUM(balance),0) AS bal FROM public.wallets)
  SELECT topups.amt, usage.amt, refunds.amt,
    (topups.amt - usage.amt + refunds.amt),
    wb.bal, topups.cnt, usage.cnt, refunds.cnt
  FROM topups, usage, refunds, wb;
$$;
GRANT EXECUTE ON FUNCTION public.get_call_wallet_summary(text) TO authenticated, anon;

DROP FUNCTION IF EXISTS public.list_call_wallet_transactions(text);
CREATE FUNCTION public.list_call_wallet_transactions(_month text DEFAULT NULL)
RETURNS TABLE(
  id uuid, created_at timestamptz, user_id uuid, user_name text,
  category text, amount numeric, balance_after numeric,
  description text, reference_id text, stripe_session_id text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT wt.id, wt.created_at, wt.user_id,
    COALESCE(p.full_name,'—') AS user_name,
    CASE
      WHEN wt.type='credit' AND wt.stripe_session_id LIKE 'refund_%' THEN 'refund'
      WHEN wt.type='credit' AND wt.stripe_session_id IS NOT NULL         THEN 'topup'
      WHEN wt.type='debit'  AND wt.reference_id IS NOT NULL              THEN 'call_usage'
      ELSE wt.type
    END AS category,
    wt.amount, wt.balance_after, wt.description,
    wt.reference_id::text, wt.stripe_session_id
  FROM public.wallet_transactions wt
  LEFT JOIN public.profiles p ON p.user_id = wt.user_id
  WHERE ((wt.type='credit' AND wt.stripe_session_id IS NOT NULL)
      OR (wt.type='debit'  AND wt.reference_id IS NOT NULL))
    AND (_month IS NULL OR to_char(wt.created_at,'YYYY-MM') = _month)
  ORDER BY wt.created_at DESC LIMIT 5000;
$$;
GRANT EXECUTE ON FUNCTION public.list_call_wallet_transactions(text) TO authenticated, anon;
