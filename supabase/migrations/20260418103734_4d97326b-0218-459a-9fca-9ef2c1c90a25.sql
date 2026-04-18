CREATE OR REPLACE FUNCTION public.auto_complete_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _booking RECORD;
  _duration_minutes integer;
  _teacher_earning numeric;
  _is_short boolean := false;
  _sub_id uuid;
BEGIN
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    NEW.duration_minutes := (SELECT duration_minutes FROM public.bookings WHERE id = NEW.booking_id);
  END IF;
  
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    -- Prefer client-provided duration (actual timer time, respects pauses on disconnect)
    -- Fall back to wall-clock difference only if client didn't pass it
    IF NEW.duration_minutes IS NOT NULL
       AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       AND NEW.duration_minutes > 0 THEN
      _duration_minutes := NEW.duration_minutes;
    ELSE
      _duration_minutes := CEIL(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0)::integer;
      NEW.duration_minutes := _duration_minutes;
    END IF;
    
    SELECT * INTO _booking FROM public.bookings WHERE id = NEW.booking_id;
    
    IF _duration_minutes < 5 THEN
      _is_short := true;
      NEW.short_session := true;
      NEW.deducted_minutes := 0;
      NEW.teacher_earning := 0;
    ELSE
      _is_short := false;
      NEW.short_session := false;
      NEW.deducted_minutes := _duration_minutes;
      
      _teacher_earning := _duration_minutes * 0.3;
      NEW.teacher_earning := _teacher_earning;
      
      _sub_id := _booking.subscription_id;
      IF _sub_id IS NULL THEN
        SELECT id INTO _sub_id
        FROM public.user_subscriptions
        WHERE user_id = _booking.student_id
          AND is_active = true
          AND remaining_minutes > 0
        ORDER BY created_at DESC
        LIMIT 1;
      END IF;
      
      IF _sub_id IS NOT NULL THEN
        UPDATE public.user_subscriptions
        SET remaining_minutes = GREATEST(remaining_minutes - _duration_minutes, 0),
            sessions_remaining = GREATEST(sessions_remaining - 1, 0),
            updated_at = now()
        WHERE id = _sub_id
        AND remaining_minutes > 0;
        
        IF _booking.subscription_id IS NULL THEN
          UPDATE public.bookings
          SET used_subscription = true, subscription_id = _sub_id
          WHERE id = NEW.booking_id;
        END IF;
      END IF;
      
      UPDATE public.teacher_profiles
      SET balance = balance + _teacher_earning,
          total_sessions = COALESCE(total_sessions, 0) + 1,
          updated_at = now()
      WHERE user_id = _booking.teacher_id;
    END IF;
    
    UPDATE public.bookings 
    SET session_status = 'completed', status = 'completed' 
    WHERE id = NEW.booking_id;
    
    IF NOT _is_short THEN
      INSERT INTO public.student_points (user_id, total_points, streak_days)
      SELECT _booking.student_id, GREATEST(10, _duration_minutes / 5), 1
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;