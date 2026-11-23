
-- 1) Settings: add platform fee rate
ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS platform_fee_rate numeric NOT NULL DEFAULT 0.60;

-- 2) Sessions: financial breakdown columns
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS gross_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teacher_base_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_rate_snapshot numeric,
  ADD COLUMN IF NOT EXISTS vat_rate_snapshot numeric;

-- 3) Teacher earnings: add gross & fee breakdown
ALTER TABLE public.teacher_earnings
  ADD COLUMN IF NOT EXISTS gross_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teacher_base_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_rate_snapshot numeric;

-- 4) Update auto_complete_session to compute the full breakdown
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
  _teacher_base numeric := 0;
  _platform_fee numeric := 0;
  _vat_amount numeric := 0;
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

    -- Read financial settings (rates)
    SELECT COALESCE(vat_rate, 0), COALESCE(platform_fee_rate, 0.60)
      INTO _vat_rate, _platform_fee_rate
      FROM public.financial_settings LIMIT 1;
    -- Normalize VAT: stored as percent (e.g. 15) — convert to fraction
    IF _vat_rate > 1 THEN _vat_rate := _vat_rate / 100.0; END IF;
    IF _platform_fee_rate > 1 THEN _platform_fee_rate := _platform_fee_rate / 100.0; END IF;

    -- Teacher hourly rate (gross/hour)
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

      -- Financial breakdown
      _gross := ROUND((_duration_minutes::numeric / 60.0) * _hourly_rate, 2);
      _platform_fee := ROUND(_gross * _platform_fee_rate, 2);
      _teacher_base := ROUND(_gross - _platform_fee, 2);
      IF _vat_enabled THEN
        _vat_amount := ROUND(_teacher_base * _vat_rate, 2);
      ELSE
        _vat_amount := 0;
      END IF;
      _net := ROUND(_teacher_base - _vat_amount, 2);

      NEW.gross_amount := _gross;
      NEW.platform_fee := _platform_fee;
      NEW.teacher_base_amount := _teacher_base;
      NEW.vat_amount := _vat_amount;
      NEW.net_amount := _net;
      NEW.platform_fee_rate_snapshot := _platform_fee_rate;
      NEW.vat_rate_snapshot := _vat_rate;
      NEW.teacher_earning := _net;

      -- Subscription deduction (unchanged)
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
        WHERE id = _sub_id AND remaining_minutes > 0;

        IF _booking.subscription_id IS NULL THEN
          UPDATE public.bookings SET used_subscription = true, subscription_id = _sub_id WHERE id = NEW.booking_id;
        END IF;
      END IF;

      -- Credit teacher net amount
      UPDATE public.teacher_profiles
      SET balance = balance + _net,
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

-- 5) Helper: get monthly financial breakdown for a teacher (for invoices/reports)
CREATE OR REPLACE FUNCTION public.get_teacher_financial_breakdown(_teacher_id uuid, _month text DEFAULT NULL)
 RETURNS TABLE(
   gross_total numeric,
   platform_fee_total numeric,
   teacher_base_total numeric,
   vat_total numeric,
   net_total numeric,
   sessions_count integer,
   minutes_total integer
 )
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(s.gross_amount),0),
    COALESCE(SUM(s.platform_fee),0),
    COALESCE(SUM(s.teacher_base_amount),0),
    COALESCE(SUM(s.vat_amount),0),
    COALESCE(SUM(s.net_amount),0),
    COUNT(*)::int,
    COALESCE(SUM(s.duration_minutes),0)::int
  FROM public.sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.teacher_id = _teacher_id
    AND s.ended_at IS NOT NULL
    AND s.short_session = false
    AND (_month IS NULL OR to_char(s.ended_at, 'YYYY-MM') = _month)
    AND (auth.uid() = _teacher_id OR public.has_role(auth.uid(),'admin'::app_role));
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_financial_breakdown(uuid, text) TO authenticated;
