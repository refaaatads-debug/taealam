-- Migration: Make auto_complete_session trigger use teacher hourly_rate dynamically
-- Instead of hardcoded (teacher=20, gross=60, platform=40 per 45min),
-- reads teacher_profiles.hourly_rate so admin pricing changes take effect.
-- Formula: teacher_base = (duration/45) * hourly_rate
--          gross         = teacher_base * 3
--          platform_fee  = teacher_base * 2
--          net_amount    = teacher_base

CREATE OR REPLACE FUNCTION auto_complete_session()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _booking RECORD; _booked_minutes integer; _duration_minutes integer;
  _wall_seconds numeric; _vat_rate numeric := 15;
  _gross numeric := 0; _vat_amount numeric := 0;
  _teacher_base numeric := 0; _platform_fee numeric := 0;
  _net numeric := 0; _sub_id uuid;
  _hourly_rate numeric := 20;
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
    ELSE RETURN NEW;
    END IF;
    SELECT * INTO _booking FROM bookings WHERE id = NEW.booking_id;
    SELECT COALESCE(vat_rate, 15) INTO _vat_rate FROM financial_settings LIMIT 1;
    -- Dynamic: read teacher rate from teacher_profiles (default 20 if not set)
    SELECT COALESCE(hourly_rate, 20) INTO _hourly_rate
      FROM teacher_profiles WHERE user_id = _booking.teacher_id;
    IF _duration_minutes < 5 THEN
      NEW.short_session := true; NEW.deducted_minutes := 0; NEW.teacher_earning := 0;
      NEW.gross_amount := 0; NEW.platform_fee := 0; NEW.teacher_base_amount := 0;
      NEW.vat_amount := 0; NEW.net_amount := 0;
      UPDATE bookings SET status = completed WHERE id = NEW.booking_id;
    ELSE
      _teacher_base := ROUND((_duration_minutes::numeric / 45.0) * _hourly_rate, 2);
      _gross        := ROUND(_teacher_base * 3.0, 2);
      _vat_amount   := ROUND(_gross * _vat_rate / (100.0 + _vat_rate), 2);
      _platform_fee := ROUND(_teacher_base * 2.0, 2);
      _net          := _teacher_base;
      NEW.short_session := false; NEW.deducted_minutes := _duration_minutes;
      NEW.gross_amount := _gross; NEW.vat_amount := _vat_amount;
      NEW.vat_rate_snapshot := _vat_rate; NEW.teacher_base_amount := _teacher_base;
      NEW.teacher_earning := _net; NEW.platform_fee := _platform_fee;
      NEW.platform_fee_rate_snapshot := ROUND(2.0 / 3.0, 6); NEW.net_amount := _net;
      _sub_id := _booking.subscription_id;
      IF _sub_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_subscriptions
        WHERE id = _sub_id AND is_active = true AND remaining_minutes >= _duration_minutes
      ) THEN
        SELECT id INTO _sub_id FROM user_subscriptions
        WHERE user_id = _booking.student_id AND is_active = true
          AND remaining_minutes >= _duration_minutes
        ORDER BY ends_at ASC, created_at ASC LIMIT 1;
      END IF;
      IF _sub_id IS NOT NULL THEN
        UPDATE user_subscriptions
          SET remaining_minutes = GREATEST(0, remaining_minutes - _duration_minutes)
          WHERE id = _sub_id;
      END IF;
      UPDATE bookings SET status = completed WHERE id = NEW.booking_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
