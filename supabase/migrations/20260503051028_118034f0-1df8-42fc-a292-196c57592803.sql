CREATE OR REPLACE FUNCTION public.get_platform_revenue_summary(_month text DEFAULT NULL)
RETURNS TABLE(
  total_revenue numeric,
  total_vat numeric,
  total_platform_earnings numeric,
  total_teacher_payouts numeric,
  net_profit numeric,
  sessions_count integer,
  minutes_total integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(s.gross_amount), 0)         AS total_revenue,
    COALESCE(SUM(s.vat_amount), 0)           AS total_vat,
    COALESCE(SUM(s.platform_fee), 0)         AS total_platform_earnings,
    COALESCE(SUM(s.teacher_base_amount), 0)  AS total_teacher_payouts,
    COALESCE(SUM(s.platform_fee), 0)         AS net_profit,
    COUNT(*)::int                            AS sessions_count,
    COALESCE(SUM(s.duration_minutes), 0)::int AS minutes_total
  FROM public.sessions s
  WHERE s.ended_at IS NOT NULL
    AND s.short_session = false
    AND (_month IS NULL OR to_char(s.ended_at, 'YYYY-MM') = _month)
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;