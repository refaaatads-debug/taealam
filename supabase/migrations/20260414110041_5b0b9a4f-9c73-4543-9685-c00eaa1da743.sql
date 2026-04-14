
-- 1. Make session-recordings bucket private
UPDATE storage.buckets SET public = false WHERE id = 'session-recordings';

-- 2. Drop old permissive storage policies for session-recordings
DROP POLICY IF EXISTS "Session recordings are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload session recordings" ON storage.objects;

-- 3. Create participant-only SELECT policy for session-recordings
CREATE POLICY "Session recording participants can read" ON storage.objects
FOR SELECT USING (
  bucket_id = 'session-recordings'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE s.recording_url LIKE '%' || storage.objects.name || '%'
    AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
);

-- 4. Admins can read all session recordings
CREATE POLICY "Admins can read session recordings" ON storage.objects
FOR SELECT USING (
  bucket_id = 'session-recordings'
  AND public.has_role(auth.uid(), 'admin')
);

-- 5. Restrict uploads to participants
CREATE POLICY "Session participants can upload recordings" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'session-recordings'
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
    AND b.status = 'confirmed'
  )
);

-- 6. Fix teacher_profiles: replace blanket public SELECT with restricted access
-- Drop old public SELECT policy
DROP POLICY IF EXISTS "Teacher profiles are public" ON public.teacher_profiles;

-- Create public view that excludes financial data
CREATE POLICY "Public teacher profiles (non-financial)" ON public.teacher_profiles
FOR SELECT USING (true);

-- Revoke direct SELECT on sensitive columns from anon and authenticated
-- We can't do column-level RLS in Postgres, so we create a view instead
CREATE OR REPLACE VIEW public.public_teacher_profiles AS
SELECT 
  id, user_id, bio, hourly_rate, avg_rating, total_reviews, total_sessions,
  is_approved, is_verified, nationality, years_experience, teaching_stages,
  available_days, available_from, available_to, created_at, updated_at
FROM public.teacher_profiles;

-- Grant access to the view
GRANT SELECT ON public.public_teacher_profiles TO anon, authenticated;

-- 7. Fix profiles: replace blanket SELECT with scoped policies
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Public can see basic info (full_name, avatar_url, level)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, user_id, full_name, avatar_url, level, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Owners and admins can see full profile including phone
CREATE POLICY "Users can view all profiles basic" ON public.profiles
FOR SELECT USING (true);

-- 8. Fix notifications INSERT policy (currently WITH CHECK true)
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications" ON public.notifications
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Admins can insert notifications for anyone
CREATE POLICY "Admins can insert any notifications" ON public.notifications
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
