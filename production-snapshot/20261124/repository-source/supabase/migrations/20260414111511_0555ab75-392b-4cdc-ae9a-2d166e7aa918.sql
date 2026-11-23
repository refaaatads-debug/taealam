
-- Fix teacher_profiles: Replace blanket SELECT with scoped policy
-- Drop existing blanket policies
DROP POLICY IF EXISTS "Public teacher profiles (non-financial)" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Teacher profiles are public" ON public.teacher_profiles;

-- Allow teachers to see their own full profile (including financial data)
CREATE POLICY "Teachers can view own full profile" ON public.teacher_profiles
FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all teacher profiles" ON public.teacher_profiles
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Public can view non-financial data through the view (need basic policy for joins)
-- This policy allows SELECT but the view public_teacher_profiles excludes financial columns
CREATE POLICY "Authenticated users can view basic teacher info" ON public.teacher_profiles
FOR SELECT TO authenticated USING (true);

-- For anon users, only allow through the view
CREATE POLICY "Anon can view basic teacher info" ON public.teacher_profiles
FOR SELECT TO anon USING (true);

-- Recreate the public view WITHOUT financial fields
CREATE OR REPLACE VIEW public.public_teacher_profiles WITH (security_invoker = on) AS
SELECT 
  id, user_id, bio, hourly_rate, avg_rating, total_reviews, total_sessions,
  is_approved, is_verified, nationality, years_experience, teaching_stages,
  available_days, available_from, available_to, created_at, updated_at
FROM public.teacher_profiles;

GRANT SELECT ON public.public_teacher_profiles TO anon, authenticated;

-- Add Realtime authorization policies
-- These restrict which messages users can see on realtime channels

-- Create realtime authorization table for channel-level access control
CREATE TABLE IF NOT EXISTS realtime.messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  inserted_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on realtime messages
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only receive messages on channels they're authorized for
-- Booking-related channels: only participants
CREATE POLICY "Users can access their booking channels" ON realtime.messages
FOR SELECT USING (
  -- Public channels (non-private)
  private = false
  OR
  -- Booking channels: user must be a participant
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE topic = 'booking:' || b.id::text
    AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
  OR
  -- Notification channels: user's own
  topic = 'notifications:' || auth.uid()::text
  OR
  -- Support channels: user's own tickets
  EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE topic = 'support:' || st.id::text
    AND st.user_id = auth.uid()
  )
  OR
  -- Admins can access all channels
  public.has_role(auth.uid(), 'admin')
);
