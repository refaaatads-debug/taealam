
-- Restrict base tables to owner + admin only
DROP POLICY IF EXISTS "Profiles are readable" ON public.profiles;
CREATE POLICY "Owner or admin can read profiles" ON public.profiles
FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Teacher profiles are readable" ON public.teacher_profiles;
CREATE POLICY "Owner or admin can read teacher profiles" ON public.teacher_profiles
FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Recreate views as security_definer with security_barrier
-- security_barrier=true prevents predicate pushdown attacks
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_barrier=true) AS
SELECT id, user_id, full_name, avatar_url, level, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

DROP VIEW IF EXISTS public.public_teacher_profiles;
CREATE VIEW public.public_teacher_profiles
WITH (security_barrier=true) AS
SELECT id, user_id, bio, hourly_rate, avg_rating, total_reviews, total_sessions,
       is_approved, is_verified, nationality, years_experience, teaching_stages,
       available_days, available_from, available_to, created_at, updated_at
FROM public.teacher_profiles;

GRANT SELECT ON public.public_teacher_profiles TO anon, authenticated;
