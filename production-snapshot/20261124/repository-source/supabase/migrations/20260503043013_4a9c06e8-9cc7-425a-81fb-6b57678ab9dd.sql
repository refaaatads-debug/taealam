
REVOKE EXECUTE ON FUNCTION public.get_teacher_earnings_breakdown(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_teacher_earnings_breakdown(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.auto_close_old_financial_months() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_financial_reconciliation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.validate_withdrawal_minimum() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_teacher_earnings_audit() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_withdrawal_changes() FROM anon, public;
