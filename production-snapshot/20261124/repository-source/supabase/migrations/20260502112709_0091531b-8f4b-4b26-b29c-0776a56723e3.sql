CREATE OR REPLACE FUNCTION public.validate_booking_request_against_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_remaining integer := 0;
  reserved_request_minutes integer := 0;
  reserved_booking_minutes integer := 0;
  requested_minutes integer := 0;
BEGIN
  IF NEW.student_id IS NULL THEN
    RAISE EXCEPTION 'student_id is required';
  END IF;

  requested_minutes := GREATEST(COALESCE(NEW.duration_minutes, 0), 0);

  SELECT COALESCE(SUM(GREATEST(COALESCE(us.remaining_minutes, 0), 0)), 0)
    INTO total_remaining
  FROM public.user_subscriptions us
  WHERE us.user_id = NEW.student_id
    AND us.is_active = true
    AND (us.ends_at IS NULL OR us.ends_at >= now());

  SELECT COALESCE(SUM(GREATEST(COALESCE(br.duration_minutes, 0), 0)), 0)
    INTO reserved_request_minutes
  FROM public.booking_requests br
  WHERE br.student_id = NEW.student_id
    AND br.status IN ('open', 'accepted')
    AND br.scheduled_at >= now()
    AND (br.expires_at IS NULL OR br.expires_at >= now());

  SELECT COALESCE(SUM(GREATEST(COALESCE(b.duration_minutes, 0), 0)), 0)
    INTO reserved_booking_minutes
  FROM public.bookings b
  WHERE b.student_id = NEW.student_id
    AND b.scheduled_at >= now()
    AND b.status IN ('pending', 'confirmed');

  IF requested_minutes <= 0 THEN
    RAISE EXCEPTION 'Booking duration must be greater than zero';
  END IF;

  IF reserved_request_minutes + reserved_booking_minutes + requested_minutes > total_remaining THEN
    RAISE EXCEPTION 'Insufficient remaining minutes for this booking request';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_booking_request_against_balance_trigger ON public.booking_requests;

CREATE TRIGGER validate_booking_request_against_balance_trigger
BEFORE INSERT ON public.booking_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_booking_request_against_balance();