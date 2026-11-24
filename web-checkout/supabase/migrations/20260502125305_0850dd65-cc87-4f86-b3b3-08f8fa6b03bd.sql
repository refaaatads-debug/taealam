
-- Restore INSERT/UPDATE/DELETE/REFERENCES/TRIGGER on profiles for both roles
-- (RLS policies still control which rows each role may touch)
GRANT INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.profiles TO anon;

GRANT INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.teacher_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.teacher_profiles TO anon;

-- Make sure column-level SELECT grants are in place (idempotent)
GRANT SELECT (
  id, user_id, full_name, avatar_url, level, created_at, updated_at,
  teaching_stage, free_trial_used, referral_code,
  notify_before_session, notify_after_session, notify_subscription_expiry
) ON public.profiles TO anon, authenticated;

GRANT SELECT (
  id, user_id, bio, hourly_rate, years_experience, is_verified,
  avg_rating, total_reviews, total_sessions, available_from, available_to,
  created_at, updated_at, is_approved, available_days, nationality, teaching_stages
) ON public.teacher_profiles TO anon, authenticated;
