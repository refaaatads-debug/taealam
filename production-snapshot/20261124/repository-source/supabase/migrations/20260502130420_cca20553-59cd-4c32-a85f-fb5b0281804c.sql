-- Revoke EXECUTE from anon on all SECURITY DEFINER functions in public.
-- These all use auth.uid() internally and should not be callable without a signed-in user.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, public',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Make sure authenticated users can still call the functions the app actually needs.
-- (auth.uid()-based checks inside each function enforce row ownership.)
GRANT EXECUTE ON FUNCTION public.get_profile_phone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_financials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, app_permission) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_new_user_role(app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_all_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_booking_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_booking_group(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_wallet_balance(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_balance(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_monthly_cancellations(uuid) TO authenticated;