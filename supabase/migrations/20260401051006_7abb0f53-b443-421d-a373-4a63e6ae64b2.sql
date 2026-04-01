
-- ============================================
-- 1. INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_bookings_student_id ON public.bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_teacher_id ON public.bookings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON public.bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_subject_id ON public.bookings(subject_id);

CREATE INDEX IF NOT EXISTS idx_sessions_booking_id ON public.sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON public.sessions(started_at);

CREATE INDEX IF NOT EXISTS idx_reviews_teacher_id ON public.reviews(teacher_id);
CREATE INDEX IF NOT EXISTS idx_reviews_student_id ON public.reviews(student_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON public.reviews(booking_id);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_user_id ON public.teacher_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_avg_rating ON public.teacher_profiles(avg_rating DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_chat_messages_booking_id ON public.chat_messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_points_user_id ON public.student_points(user_id);
CREATE INDEX IF NOT EXISTS idx_student_badges_user_id ON public.student_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher_id ON public.teacher_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject_id ON public.teacher_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active ON public.user_subscriptions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_warnings_user_id ON public.user_warnings(user_id);

-- ============================================
-- 2. AI conversations table
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  tokens_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON public.ai_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON public.ai_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON public.ai_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);

-- ============================================
-- 3. Error/audit log table
-- ============================================
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  source text,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view logs" ON public.system_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);

-- ============================================
-- 4. Session lifecycle: auto-create session on booking confirm
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_create_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    INSERT INTO public.sessions (booking_id, room_id)
    VALUES (NEW.id, 'room_' || replace(NEW.id::text, '-', ''))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_session ON public.bookings;
CREATE TRIGGER trg_auto_create_session
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_session();

-- ============================================
-- 5. Auto-complete session after duration
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_complete_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    NEW.duration_minutes := (SELECT duration_minutes FROM public.bookings WHERE id = NEW.booking_id);
  END IF;
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::integer / 60;
    UPDATE public.bookings SET session_status = 'completed', status = 'completed' WHERE id = NEW.booking_id;
    -- Award points
    INSERT INTO public.student_points (user_id, total_points, streak_days)
    SELECT b.student_id, 10, 1 FROM public.bookings b WHERE b.id = NEW.booking_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_complete_session ON public.sessions;
CREATE TRIGGER trg_auto_complete_session
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.auto_complete_session();

-- ============================================
-- 6. Updated_at triggers for new tables
-- ============================================
DROP TRIGGER IF EXISTS trg_ai_conversations_updated ON public.ai_conversations;
CREATE TRIGGER trg_ai_conversations_updated
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
