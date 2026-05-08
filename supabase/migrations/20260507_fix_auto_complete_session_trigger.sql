-- Fix auto_complete_session: remove IS DISTINCT FROM restriction, add wall-clock fallback
CREATE OR REPLACE FUNCTION public.auto_complete_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _booking RECORD; _booked_minutes integer; _duration_minutes integer; _wall_seconds numeric;
  _platform_fee_rate numeric := 0.60; _gross numeric := 0; _platform_fee numeric := 0;
  _teacher_base numeric := 0; _net numeric := 0; _hourly_rate numeric := 0; _sub_id uuid;
BEGIN
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    NEW.duration_minutes := (SELECT duration_minutes FROM bookings WHERE id = NEW.booking_id);
  END IF;
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    SELECT duration_minutes INTO _booked_minutes FROM bookings WHERE id = NEW.booking_id;
    IF NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > 0 THEN
      _duration_minutes := CEIL(NEW.duration_seconds::numeric / 60.0)::integer;
      NEW.duration_minutes := _duration_minutes;
    ELSIF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 0 THEN
      _duration_minutes := NEW.duration_minutes;
    ELSIF NEW.started_at IS NOT NULL THEN
      _wall_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at));
      _duration_minutes := GREATEST(0, CEIL(_wall_seconds / 60.0))::integer;
      NEW.duration_minutes := _duration_minutes;
    ELSE RETURN NEW; END IF;
    SELECT * INTO _booking FROM bookings WHERE id = NEW.booking_id;
    SELECT COALESCE(platform_fee_rate, 0.60) INTO _platform_fee_rate FROM financial_settings LIMIT 1;
    IF _platform_fee_rate > 1 THEN _platform_fee_rate := _platform_fee_rate / 100.0; END IF;
    SELECT COALESCE(hourly_rate, 0) INTO _hourly_rate FROM teacher_profiles WHERE user_id = _booking.teacher_id;
    IF _duration_minutes < 5 THEN
      NEW.short_session := true; NEW.deducted_minutes := 0; NEW.teacher_earning := 0;
      NEW.gross_amount := 0; NEW.platform_fee := 0; NEW.teacher_base_amount := 0; NEW.vat_amount := 0; NEW.net_amount := 0;
      UPDATE bookings SET status = 'completed' WHERE id = NEW.booking_id;
    ELSE
      NEW.short_session := false; NEW.deducted_minutes := _duration_minutes;
      _gross := ROUND((_duration_minutes::numeric / 60.0) * _hourly_rate, 2);
      _platform_fee := ROUND(_gross * _platform_fee_rate, 2);
      _teacher_base := ROUND(_gross - _platform_fee, 2); _net := _teacher_base;
      NEW.gross_amount := _gross; NEW.vat_amount := 0; NEW.platform_fee := _platform_fee;
      NEW.teacher_base_amount := _teacher_base; NEW.net_amount := _net;
      NEW.platform_fee_rate_snapshot := _platform_fee_rate; NEW.vat_rate_snapshot := 0; NEW.teacher_earning := _net;
      _sub_id := _booking.subscription_id;
      IF _sub_id IS NULL OR NOT EXISTS(SELECT 1 FROM user_subscriptions WHERE id = _sub_id AND is_active = true AND remaining_minutes >= _duration_minutes) THEN
        SELECT id INTO _sub_id FROM user_subscriptions WHERE user_id = _booking.student_id AND is_active = true AND remaining_minutes >= _duration_minutes ORDER BY ends_at ASC, created_at ASC LIMIT 1;
      END IF;
      IF _sub_id IS NOT NULL THEN UPDATE user_subscriptions SET remaining_minutes = GREATEST(0, remaining_minutes - _duration_minutes) WHERE id = _sub_id; END IF;
      UPDATE bookings SET status = 'completed' WHERE id = NEW.booking_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
