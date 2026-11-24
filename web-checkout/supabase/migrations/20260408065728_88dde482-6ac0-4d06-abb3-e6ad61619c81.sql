
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
  _start_time TIMESTAMPTZ;
  _elapsed_ms INTEGER;
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    _start_time := clock_timestamp();
    _dur := COALESCE(NEW.duration_minutes, 0);

    -- Skip short sessions
    IF _dur < 5 THEN
      INSERT INTO public.system_logs (level, source, message, metadata)
      VALUES ('info', 'session_materials', 'Skipped short session', 
        jsonb_build_object('session_id', NEW.id, 'duration', _dur, 'reason', 'less_than_5_min'));
      RETURN NEW;
    END IF;

    -- Get booking info
    SELECT * INTO _booking FROM public.bookings WHERE id = NEW.booking_id;
    IF _booking IS NULL THEN
      INSERT INTO public.system_logs (level, source, message, metadata)
      VALUES ('error', 'session_materials', 'Booking not found', 
        jsonb_build_object('session_id', NEW.id, 'booking_id', NEW.booking_id));
      RETURN NEW;
    END IF;

    -- Consistency check
    SELECT full_name INTO _teacher_name FROM public.profiles WHERE user_id = _booking.teacher_id;
    SELECT full_name INTO _student_name FROM public.profiles WHERE user_id = _booking.student_id;

    BEGIN
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

      _elapsed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - _start_time))::integer * 1000;

      INSERT INTO public.system_logs (level, source, message, metadata)
      VALUES ('info', 'session_materials', 'Material created successfully',
        jsonb_build_object(
          'session_id', NEW.id,
          'teacher_id', _booking.teacher_id,
          'student_id', _booking.student_id,
          'duration_minutes', _dur,
          'elapsed_ms', _elapsed_ms
        ));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (level, source, message, metadata)
      VALUES ('error', 'session_materials', 'Failed to create material: ' || SQLERRM,
        jsonb_build_object(
          'session_id', NEW.id,
          'booking_id', NEW.booking_id,
          'error', SQLERRM
        ));
    END;
  END IF;
  RETURN NEW;
END;
$$;
