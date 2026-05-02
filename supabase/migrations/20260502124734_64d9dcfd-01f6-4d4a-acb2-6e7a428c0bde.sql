
DROP TABLE IF EXISTS public.subscription_plans_backup_20260423;

DROP POLICY IF EXISTS "Users insert own warnings" ON public.user_warnings;
CREATE POLICY "Admins insert warnings"
  ON public.user_warnings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- profiles: revoke broad SELECT, re-grant non-sensitive columns
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, user_id, full_name, avatar_url, level, created_at, updated_at,
  teaching_stage, free_trial_used, referral_code,
  notify_before_session, notify_after_session, notify_subscription_expiry
) ON public.profiles TO anon, authenticated;

CREATE OR REPLACE VIEW public.my_profile
  WITH (security_invoker = on)
AS
  SELECT * FROM public.profiles WHERE user_id = auth.uid();
GRANT SELECT ON public.my_profile TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_phone(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT phone FROM public.profiles
  WHERE user_id = _user_id
    AND (auth.uid() = _user_id OR public.has_role(auth.uid(), 'admin'::app_role))
$$;
REVOKE ALL ON FUNCTION public.get_profile_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_phone(uuid) TO authenticated;

-- teacher_profiles: revoke broad SELECT, re-grant non-financial columns
REVOKE SELECT ON public.teacher_profiles FROM anon, authenticated;
GRANT SELECT (
  id, user_id, bio, hourly_rate, years_experience, is_verified,
  avg_rating, total_reviews, total_sessions, available_from, available_to,
  created_at, updated_at, is_approved, available_days, nationality, teaching_stages
) ON public.teacher_profiles TO anon, authenticated;

CREATE OR REPLACE VIEW public.my_teacher_profile
  WITH (security_invoker = on)
AS
  SELECT * FROM public.teacher_profiles WHERE user_id = auth.uid();
GRANT SELECT ON public.my_teacher_profile TO authenticated;

CREATE OR REPLACE FUNCTION public.get_teacher_financials(_teacher_id uuid)
RETURNS TABLE(iban text, bank_name text, account_holder_name text, balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT iban, bank_name, account_holder_name, balance
  FROM public.teacher_profiles
  WHERE user_id = _teacher_id
    AND (auth.uid() = _teacher_id OR public.has_role(auth.uid(), 'admin'::app_role));
$$;
REVOKE ALL ON FUNCTION public.get_teacher_financials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_financials(uuid) TO authenticated;
