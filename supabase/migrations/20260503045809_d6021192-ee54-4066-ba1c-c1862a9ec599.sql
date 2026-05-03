CREATE OR REPLACE FUNCTION public.auto_complete_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _booking RECORD;
  _duration_minutes integer;
  _hourly_rate numeric := 0;
  _vat_rate numeric := 0;
  _platform_fee_rate numeric := 0.60;
  _vat_enabled boolean := true;
  _gross numeric := 0;
  _vat_amount numeric := 0;
  _net_revenue numeric := 0;
  _platform_fee numeric := 0;
  _teacher_base numeric := 0;
  _net numeric := 0;
  _is_short boolean := false;
  _sub_id uuid;
BEGIN
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    NEW.duration_minutes := (SELECT duration_minutes FROM public.bookings WHERE id = NEW.booking_id);
  END IF;

  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    IF NEW.duration_minutes IS NOT NULL
       AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       AND NEW.duration_minutes > 0 THEN
      _duration_minutes := NEW.duration_minutes;
    ELSE
      _duration_minutes := CEIL(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0)::integer;
      NEW.duration_minutes := _duration_minutes;
    END IF;

    SELECT * INTO _booking FROM public.bookings WHERE id = NEW.booking_id;

    SELECT COALESCE(vat_rate, 0), COALESCE(platform_fee_rate, 0.60)
      INTO _vat_rate, _platform_fee_rate
      FROM public.financial_settings LIMIT 1;
    IF _vat_rate > 1 THEN _vat_rate := _vat_rate / 100.0; END IF;
    IF _platform_fee_rate > 1 THEN _platform_fee_rate := _platform_fee_rate / 100.0; END IF;

    SELECT COALESCE(hourly_rate, 0), COALESCE(vat_enabled, true)
      INTO _hourly_rate, _vat_enabled
      FROM public.teacher_profiles WHERE user_id = _booking.teacher_id;

    IF _duration_minutes < 5 THEN
      _is_short := true;
      NEW.short_session := true;
      NEW.deducted_minutes := 0;
      NEW.teacher_earning := 0;
      NEW.gross_amount := 0;
      NEW.platform_fee := 0;
      NEW.teacher_base_amount := 0;
      NEW.vat_amount := 0;
      NEW.net_amount := 0;
    ELSE
      _is_short := false;
      NEW.short_session := false;
      NEW.deducted_minutes := _duration_minutes;

      -- New order: VAT taken from total gross first, then split between platform and teacher
      _gross := ROUND((_duration_minutes::numeric / 60.0) * _hourly_rate, 2);
      IF _vat_enabled THEN
        _vat_amount := ROUND(_gross * _vat_rate, 2);
      ELSE
        _vat_amount := 0;
      END IF;
      _net_revenue := ROUND(_gross - _vat_amount, 2);
      _platform_fee := ROUND(_net_revenue * _platform_fee_rate, 2);
      _teacher_base := ROUND(_net_revenue - _platform_fee, 2);
      _net := _teacher_base;

      NEW.gross_amount := _gross;
      NEW.vat_amount := _vat_amount;
      NEW.platform_fee := _platform_fee;
      NEW.teacher_base_amount := _teacher_base;
      NEW.net_amount := _net;
      NEW.platform_fee_rate_snapshot := _platform_fee_rate;
      NEW.vat_rate_snapshot := _vat_rate;
      NEW.teacher_earning := _net;

      _sub_id := _booking.subscription_id;
      IF _sub_id IS NULL THEN
        SELECT id INTO _sub_id
        FROM public.user_subscriptions
        WHERE user_id = _booking.student_id
          AND is_active = true
          AND remaining_minutes >= _duration_minutes
        ORDER BY created_at DESC
        LIMIT 1;
      END IF;

      IF _sub_id IS NOT NULL THEN
        UPDATE public.user_subscriptions
        SET remaining_minutes = GREATEST(0, remaining_minutes - _duration_minutes)
        WHERE id = _sub_id;
      END IF;
    END IF;

    NEW.status := 'completed';
  END IF;

  RETURN NEW;
END;
$function$;