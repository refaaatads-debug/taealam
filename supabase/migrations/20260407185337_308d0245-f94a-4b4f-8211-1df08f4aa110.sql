
-- Add minutes tracking to user_subscriptions
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS remaining_minutes integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_hours numeric NOT NULL DEFAULT 0;

-- Add session accounting fields
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS deducted_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS teacher_earning numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS short_session boolean DEFAULT false;

-- Add teacher balance
ALTER TABLE public.teacher_profiles 
ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;

-- Update auto_complete_session trigger to use minutes-based deduction
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
BEGIN
  -- When session starts
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    NEW.duration_minutes := (SELECT duration_minutes FROM public.bookings WHERE id = NEW.booking_id);
  END IF;
  
  -- When session ends
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    -- Calculate actual duration in minutes (ceiling)
    _duration_minutes := CEIL(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0)::integer;
    NEW.duration_minutes := _duration_minutes;
    
    -- Get booking info
    SELECT * INTO _booking FROM public.bookings WHERE id = NEW.booking_id;
    
    -- Check if short session (< 5 minutes)
    IF _duration_minutes < 5 THEN
      _is_short := true;
      NEW.short_session := true;
      NEW.deducted_minutes := 0;
      NEW.teacher_earning := 0;
    ELSE
      _is_short := false;
      NEW.short_session := false;
      NEW.deducted_minutes := _duration_minutes;
      
      -- Teacher earning: 0.3 SAR per minute
      _teacher_earning := _duration_minutes * 0.3;
      NEW.teacher_earning := _teacher_earning;
      
      -- Deduct minutes from student subscription
      IF _booking.used_subscription = true AND _booking.subscription_id IS NOT NULL THEN
        UPDATE public.user_subscriptions
        SET remaining_minutes = GREATEST(remaining_minutes - _duration_minutes, 0),
            sessions_remaining = GREATEST(sessions_remaining - 1, 0),
            updated_at = now()
        WHERE id = _booking.subscription_id
        AND remaining_minutes > 0;
      END IF;
      
      -- Add earning to teacher balance
      UPDATE public.teacher_profiles
      SET balance = balance + _teacher_earning,
          total_sessions = COALESCE(total_sessions, 0) + 1,
          updated_at = now()
      WHERE user_id = _booking.teacher_id;
    END IF;
    
    -- Update booking status
    UPDATE public.bookings 
    SET session_status = 'completed', status = 'completed' 
    WHERE id = NEW.booking_id;
    
    -- Award points (only for non-short sessions)
    IF NOT _is_short THEN
      INSERT INTO public.student_points (user_id, total_points, streak_days)
      SELECT _booking.student_id, GREATEST(10, _duration_minutes / 5), 1
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
