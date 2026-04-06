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
    
    -- Deduct 1 session from student's subscription after session completion
    UPDATE public.user_subscriptions
    SET sessions_remaining = GREATEST(sessions_remaining - 1, 0),
        updated_at = now()
    WHERE id = (
      SELECT subscription_id FROM public.bookings WHERE id = NEW.booking_id AND used_subscription = true
    )
    AND sessions_remaining > 0;
    
    -- Award points
    INSERT INTO public.student_points (user_id, total_points, streak_days)
    SELECT b.student_id, 10, 1 FROM public.bookings b WHERE b.id = NEW.booking_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;