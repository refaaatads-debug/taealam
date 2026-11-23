
-- Restrict full breakdown to admins only
CREATE OR REPLACE FUNCTION public.get_teacher_financial_breakdown(_teacher_id uuid, _month text DEFAULT NULL)
 RETURNS TABLE(
   gross_total numeric,
   platform_fee_total numeric,
   teacher_base_total numeric,
   vat_total numeric,
   net_total numeric,
   sessions_count integer,
   minutes_total integer
 )
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(s.gross_amount),0),
    COALESCE(SUM(s.platform_fee),0),
    COALESCE(SUM(s.teacher_base_amount),0),
    COALESCE(SUM(s.vat_amount),0),
    COALESCE(SUM(s.net_amount),0),
    COUNT(*)::int,
    COALESCE(SUM(s.duration_minutes),0)::int
  FROM public.sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.teacher_id = _teacher_id
    AND s.ended_at IS NOT NULL
    AND s.short_session = false
    AND (_month IS NULL OR to_char(s.ended_at, 'YYYY-MM') = _month)
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;

-- Teacher-safe net-only summary (no gross/fee/vat exposed)
CREATE OR REPLACE FUNCTION public.get_teacher_net_summary(_teacher_id uuid, _month text DEFAULT NULL)
 RETURNS TABLE(
   net_total numeric,
   sessions_count integer,
   minutes_total integer
 )
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(s.net_amount),0),
    COUNT(*)::int,
    COALESCE(SUM(s.duration_minutes),0)::int
  FROM public.sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.teacher_id = _teacher_id
    AND s.ended_at IS NOT NULL
    AND s.short_session = false
    AND (_month IS NULL OR to_char(s.ended_at, 'YYYY-MM') = _month)
    AND (auth.uid() = _teacher_id OR public.has_role(auth.uid(), 'admin'::app_role));
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_financial_breakdown(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_net_summary(uuid, text) TO authenticated;
