
-- Add gamification levels table
CREATE TABLE public.student_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text NOT NULL,
  min_points integer NOT NULL DEFAULT 0,
  max_points integer NOT NULL,
  icon text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Levels are public" ON public.student_levels FOR SELECT USING (true);

-- Add session_status to bookings for tracking
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS session_status text DEFAULT 'not_started';

-- Add AI report to sessions
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ai_report text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- Add free trial tracking to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_trial_used boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level text DEFAULT 'bronze';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;

-- Add notification preferences
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_before_session boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_after_session boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_subscription_expiry boolean DEFAULT true;

-- Add security warnings for chat
CREATE TABLE public.user_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  warning_type text NOT NULL DEFAULT 'chat_violation',
  description text,
  warning_count integer NOT NULL DEFAULT 1,
  is_banned boolean DEFAULT false,
  banned_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own warnings" ON public.user_warnings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage warnings" ON public.user_warnings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default levels
INSERT INTO public.student_levels (name, name_ar, min_points, max_points, icon, color) VALUES
  ('bronze', 'برونزي', 0, 499, '🥉', 'text-orange-600'),
  ('silver', 'فضي', 500, 999, '🥈', 'text-gray-400'),
  ('gold', 'ذهبي', 1000, 1999, '🥇', 'text-gold'),
  ('platinum', 'بلاتيني', 2000, 4999, '💎', 'text-blue-400'),
  ('diamond', 'ماسي', 5000, 99999, '👑', 'text-purple-500');

-- Update chat filter function to track violations
CREATE OR REPLACE FUNCTION public.filter_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.content ~ '\d{7,}' OR NEW.content ~ 'https?://' OR NEW.content ~ 'www\.' OR NEW.content ~ '@[a-zA-Z0-9]' OR NEW.content ~ '\+\d{8,}' THEN
    NEW.is_filtered = true;
    NEW.content = '⚠️ تم حجب هذه الرسالة - لا يُسمح بمشاركة أرقام أو روابط أو بريد إلكتروني';
    
    -- Track violations
    INSERT INTO public.user_warnings (user_id, warning_type, description, warning_count)
    VALUES (NEW.sender_id, 'chat_violation', 'محاولة مشاركة معلومات اتصال', 1)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- Create trigger for chat filter
DROP TRIGGER IF EXISTS filter_chat_before_insert ON public.chat_messages;
CREATE TRIGGER filter_chat_before_insert
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION filter_chat_message();

-- Create trigger for updated_at on sessions
DROP TRIGGER IF EXISTS update_sessions_updated ON public.sessions;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
