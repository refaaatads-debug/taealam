
-- =============================================
-- 1. Fix profiles: hide phone from public
-- =============================================
DROP POLICY IF EXISTS "Users can view all profiles basic" ON public.profiles;

-- Public can see name + avatar only
CREATE POLICY "Public can view basic profile info" ON public.profiles
FOR SELECT USING (true);

-- But we use the view for public access, so let's use security_invoker view
-- Actually the view already exists and excludes phone. The issue is the base table policy.
-- We need to restrict the base table but the view needs access.
-- Best approach: keep the policy but use the view in app code.
-- Since the view has security_invoker=on, the calling user's permissions apply.
-- We need a restricted policy that hides phone for non-owners.

-- Actually, RLS can't hide individual columns. We need to:
-- 1. Remove the broad SELECT on base table
-- 2. Add owner-only SELECT on base table  
-- 3. Add admin SELECT on base table
-- 4. Make the public_profiles view security_definer so it can bypass RLS

DROP POLICY IF EXISTS "Public can view basic profile info" ON public.profiles;

-- Only owner and admins can read from base table
CREATE POLICY "Owner can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = user_id);

-- Admin policy already exists via "Admins can manage all profiles"

-- Recreate public_profiles view as security_definer (not invoker) to bypass RLS
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_barrier=true) AS
SELECT id, user_id, full_name, avatar_url, level, created_at, updated_at
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- =============================================
-- 2. Fix teacher_profiles: hide banking data
-- =============================================
DROP POLICY IF EXISTS "Anon can view basic teacher info" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Authenticated users can view basic teacher info" ON public.teacher_profiles;

-- Only owner and admins can read base table (admin policy already exists)
CREATE POLICY "Teacher can view own profile" ON public.teacher_profiles
FOR SELECT USING (auth.uid() = user_id);

-- Recreate public view without sensitive fields
DROP VIEW IF EXISTS public.public_teacher_profiles;
CREATE VIEW public.public_teacher_profiles
WITH (security_barrier=true) AS
SELECT id, user_id, bio, hourly_rate, avg_rating, total_reviews, total_sessions,
       is_approved, is_verified, nationality, years_experience, teaching_stages,
       available_days, available_from, available_to, created_at, updated_at
FROM public.teacher_profiles;

GRANT SELECT ON public.public_teacher_profiles TO anon, authenticated;

-- =============================================
-- 3. Fix chat-files upload: restrict to booking participants
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can upload chat files" ON storage.objects;

CREATE POLICY "Booking participants can upload chat files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'chat-files'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
      AND b.status IN ('confirmed', 'completed')
  )
);

-- =============================================
-- 4. Fix support-files upload: restrict to ticket owners + admins
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can upload support files" ON storage.objects;

CREATE POLICY "Ticket owners can upload support files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'support-files'
  AND auth.role() = 'authenticated'
  AND (
    EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- =============================================
-- 5. Fix student_points and student_badges visibility
-- =============================================
DROP POLICY IF EXISTS "Points are public" ON public.student_points;
CREATE POLICY "Users can view own points" ON public.student_points
FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Student badges are public" ON public.student_badges;
CREATE POLICY "Users can view own badges" ON public.student_badges
FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
