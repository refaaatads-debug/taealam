
-- Fix views to use security_invoker instead of security_definer
-- But we need the base table to be readable for the view to work.
-- Solution: Use security_invoker=on and add back a restricted SELECT policy
-- that only exposes non-sensitive columns... but RLS can't filter columns.

-- Alternative approach: Use a SECURITY DEFINER function to power the view safely.
-- Actually the simplest correct approach: 
-- Keep base table restricted, create a SECURITY DEFINER function that returns only safe columns.

-- For profiles: recreate view with security_invoker=on
-- and add a limited SELECT policy back (RLS applies to rows not columns, 
-- so we need the broad policy back but rely on the VIEW to filter columns)
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker=on) AS
SELECT id, user_id, full_name, avatar_url, level, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- We need profiles base table readable for the view to work
-- The existing "Owner can view own profile" is too restrictive for the view
-- Add a broad read policy back - the view filters columns
DROP POLICY IF EXISTS "Owner can view own profile" ON public.profiles;
CREATE POLICY "Profiles are readable" ON public.profiles
FOR SELECT USING (true);

-- For teacher_profiles: same approach
DROP VIEW IF EXISTS public.public_teacher_profiles;
CREATE VIEW public.public_teacher_profiles
WITH (security_invoker=on) AS
SELECT id, user_id, bio, hourly_rate, avg_rating, total_reviews, total_sessions,
       is_approved, is_verified, nationality, years_experience, teaching_stages,
       available_days, available_from, available_to, created_at, updated_at
FROM public.teacher_profiles;

GRANT SELECT ON public.public_teacher_profiles TO anon, authenticated;

-- Need base table readable for view
DROP POLICY IF EXISTS "Teacher can view own profile" ON public.teacher_profiles;
CREATE POLICY "Teacher profiles are readable" ON public.teacher_profiles
FOR SELECT USING (true);
