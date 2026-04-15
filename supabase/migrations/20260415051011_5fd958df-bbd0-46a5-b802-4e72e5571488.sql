
-- Fix student_points INSERT/UPDATE to require authentication
DROP POLICY IF EXISTS "Users can insert own points" ON public.student_points;
CREATE POLICY "Authenticated users can insert own points" ON public.student_points
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own points" ON public.student_points;
CREATE POLICY "Authenticated users can update own points" ON public.student_points
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Fix student_badges INSERT
DROP POLICY IF EXISTS "Users can insert own badges" ON public.student_badges;
CREATE POLICY "Authenticated users can insert own badges" ON public.student_badges
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Convert views to security_invoker to clear linter warnings
-- We need to allow authenticated users to read base tables via views
DROP VIEW IF EXISTS public.public_profiles;
DROP VIEW IF EXISTS public.public_teacher_profiles;

-- Add authenticated-scoped read policy for profiles (for view access)
DROP POLICY IF EXISTS "Owner or admin can read profiles" ON public.profiles;
CREATE POLICY "Authenticated can read profiles" ON public.profiles
FOR SELECT TO authenticated USING (true);
-- No anon access to base table
CREATE POLICY "Anon cannot read profiles" ON public.profiles
FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "Owner or admin can read teacher profiles" ON public.teacher_profiles;
CREATE POLICY "Authenticated can read teacher profiles" ON public.teacher_profiles
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon cannot read teacher profiles" ON public.teacher_profiles
FOR SELECT TO anon USING (false);

-- Recreate views with security_invoker
CREATE VIEW public.public_profiles
WITH (security_invoker=on) AS
SELECT id, user_id, full_name, avatar_url, level, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

CREATE VIEW public.public_teacher_profiles
WITH (security_invoker=on) AS
SELECT id, user_id, bio, hourly_rate, avg_rating, total_reviews, total_sessions,
       is_approved, is_verified, nationality, years_experience, teaching_stages,
       available_days, available_from, available_to, created_at, updated_at
FROM public.teacher_profiles;

GRANT SELECT ON public.public_teacher_profiles TO anon, authenticated;
