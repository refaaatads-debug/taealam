GRANT EXECUTE ON FUNCTION public.run_financial_reconciliation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_old_financial_months() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_earnings_breakdown(uuid) TO authenticated;