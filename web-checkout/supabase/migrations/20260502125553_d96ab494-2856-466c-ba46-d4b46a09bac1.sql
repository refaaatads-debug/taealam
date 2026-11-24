-- Restore SELECT access on profiles and teacher_profiles at column level
-- Sensitive columns (phone, iban, bank_name, account_holder_name, balance) remain restricted
-- and accessible only via security-definer functions get_profile_phone() / get_teacher_financials().

-- profiles: grant SELECT on all non-sensitive columns
GRANT SELECT (id, user_id, full_name, avatar_url, teaching_stage, level, free_trial_used,
              referral_code, notify_before_session, notify_after_session, notify_subscription_expiry,
              created_at, updated_at)
ON public.profiles TO anon, authenticated;

-- teacher_profiles: grant SELECT on all non-financial columns
GRANT SELECT (id, user_id, bio, hourly_rate, years_experience, is_verified, avg_rating,
              total_reviews, total_sessions, available_from, available_to, available_days,
              is_approved, nationality, teaching_stages, created_at, updated_at)
ON public.teacher_profiles TO anon, authenticated;