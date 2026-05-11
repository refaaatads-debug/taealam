-- Fix get_platform_revenue_summary: use sessions.gross_amount as revenue source
-- (invoices table is empty; all revenue flows through session financial columns)
-- Also fix: mark 14 sessions with short_session=false but zero financials as short_session=true

UPDATE sessions
SET short_session = true
WHERE ended_at IS NOT NULL
  AND short_session = false
  AND (teacher_base_amount IS NULL OR teacher_base_amount = 0)
  AND (gross_amount IS NULL OR gross_amount = 0);

DROP FUNCTION IF EXISTS public.get_platform_revenue_summary(text);
DROP FUNCTION IF EXISTS public.get_platform_revenue_summary(text, date, date);

CREATE OR REPLACE FUNCTION public.get_platform_revenue_summary(
  _month      text    DEFAULT NULL::text,
  _from_date  date    DEFAULT NULL::date,
  _to_date    date    DEFAULT NULL::date
)
RETURNS TABLE(
  total_revenue             numeric,
  total_vat                 numeric,
  total_platform_earnings   numeric,
  total_teacher_payouts     numeric,
  net_profit                numeric,
  sessions_count            integer,
  minutes_total             integer,
  invoices_count            integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $fn$
  WITH sess AS (
    SELECT
      COALESCE(SUM(s.gross_amount),        0) AS gross,
      COALESCE(SUM(s.vat_amount),          0) AS vat,
      COALESCE(SUM(s.platform_fee),        0) AS platform_fee_sum,
      COALESCE(SUM(s.teacher_base_amount), 0) AS teacher_payouts_sum,
      COUNT(*)::int                            AS cnt,
      COALESCE(SUM(
        CASE WHEN s.deducted_minutes > 0 THEN s.deducted_minutes
             WHEN s.duration_minutes  > 0 THEN s.duration_minutes
             ELSE 0 END
      ), 0)::int AS mins
    FROM public.sessions s
    WHERE s.ended_at IS NOT NULL
      AND s.short_session = false
      AND (_month     IS NULL OR to_char(s.ended_at, YYYY-MM) = _month)
      AND (_from_date IS NULL OR s.ended_at::date >= _from_date)
      AND (_to_date   IS NULL OR s.ended_at::date <= _to_date)
  )
  SELECT
    sess.gross,
    sess.vat,
    sess.platform_fee_sum,
    sess.teacher_payouts_sum,
    sess.platform_fee_sum,
    sess.cnt,
    sess.mins,
    0::int
  FROM sess
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$fn$;

GRANT EXECUTE ON FUNCTION public.get_platform_revenue_summary(text,date,date) TO authenticated;
