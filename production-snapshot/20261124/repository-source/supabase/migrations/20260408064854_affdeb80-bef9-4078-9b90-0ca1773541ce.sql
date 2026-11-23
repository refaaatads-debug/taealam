
-- Create session_materials table
CREATE TABLE public.session_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE,
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'حصة',
  description TEXT,
  recording_url TEXT,
  whiteboard_data JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX idx_session_materials_teacher ON public.session_materials(teacher_id);
CREATE INDEX idx_session_materials_student ON public.session_materials(student_id);
CREATE INDEX idx_session_materials_expires ON public.session_materials(expires_at);

-- RLS
ALTER TABLE public.session_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own materials"
  ON public.session_materials FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id AND is_deleted = false AND expires_at > now());

CREATE POLICY "Teachers can view own materials"
  ON public.session_materials FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id AND is_deleted = false AND expires_at > now());

CREATE POLICY "Admins can manage all materials"
  ON public.session_materials FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can insert materials"
  ON public.session_materials FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger: auto-create material when session ends
CREATE OR REPLACE FUNCTION public.auto_create_session_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _booking RECORD;
  _teacher_name TEXT;
  _student_name TEXT;
  _dur INTEGER;
BEGIN
  -- Only when session just ended
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    _dur := COALESCE(NEW.duration_minutes, 0);
    -- Skip short sessions (< 5 min)
    IF _dur < 5 THEN
      RETURN NEW;
    END IF;

    -- Get booking info
    SELECT * INTO _booking FROM public.bookings WHERE id = NEW.booking_id;
    IF _booking IS NULL THEN RETURN NEW; END IF;

    -- Get names
    SELECT full_name INTO _teacher_name FROM public.profiles WHERE user_id = _booking.teacher_id;
    SELECT full_name INTO _student_name FROM public.profiles WHERE user_id = _booking.student_id;

    -- Insert material (ignore if already exists)
    INSERT INTO public.session_materials (
      session_id, teacher_id, student_id, title, description,
      recording_url, duration_minutes, expires_at
    ) VALUES (
      NEW.id,
      _booking.teacher_id,
      _booking.student_id,
      'حصة مع ' || COALESCE(_teacher_name, 'معلم'),
      'مدة الحصة: ' || _dur || ' دقيقة',
      NEW.recording_url,
      _dur,
      now() + interval '7 days'
    ) ON CONFLICT (session_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_session_material
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_session_material();
