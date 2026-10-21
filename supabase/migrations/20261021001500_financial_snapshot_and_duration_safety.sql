-- Preserve historical records and capture configuration for future work only.

ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS in_person_instruction_duration_minutes integer
  NOT NULL DEFAULT 60
  CHECK (in_person_instruction_duration_minutes IN (45, 60));

ALTER TABLE public.in_person_request_groups
  ADD COLUMN IF NOT EXISTS instruction_duration_minutes integer
  NOT NULL DEFAULT 60
  CHECK (instruction_duration_minutes IN (45, 60));

CREATE OR REPLACE FUNCTION public.get_in_person_instruction_duration()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT fs.in_person_instruction_duration_minutes
    FROM public.financial_settings fs
    ORDER BY fs.updated_at DESC
    LIMIT 1
  ), 60)
$$;
REVOKE ALL ON FUNCTION public.get_in_person_instruction_duration() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_in_person_instruction_duration() TO authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_in_person_request_duration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.instruction_duration_minutes := public.get_in_person_instruction_duration();
  IF NEW.instruction_duration_minutes NOT IN (45, 60) THEN
    RAISE EXCEPTION 'In-person duration must be 45 or 60 minutes' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS snapshot_in_person_request_duration ON public.in_person_request_groups;
CREATE TRIGGER snapshot_in_person_request_duration
  BEFORE INSERT ON public.in_person_request_groups
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_in_person_request_duration();
REVOKE ALL ON FUNCTION public.snapshot_in_person_request_duration() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS teacher_hourly_rate_snapshot numeric;
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS accepted_teacher_hourly_rate_snapshot numeric;

CREATE OR REPLACE FUNCTION public.snapshot_accepted_booking_request_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'accepted'
     AND NEW.accepted_teacher_hourly_rate_snapshot IS NULL THEN
    SELECT tp.hourly_rate INTO v_rate
    FROM public.teacher_profiles tp
    WHERE tp.user_id = NEW.accepted_by;
    IF v_rate IS NULL OR v_rate <= 0 OR v_rate > 1000 THEN
      RAISE EXCEPTION 'Teacher hourly rate is missing or outside the allowed range'
        USING ERRCODE = '22023';
    END IF;
    NEW.accepted_teacher_hourly_rate_snapshot := v_rate;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS snapshot_accepted_booking_request_rate ON public.booking_requests;
CREATE TRIGGER snapshot_accepted_booking_request_rate
  BEFORE UPDATE OF status ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_accepted_booking_request_rate();
REVOKE ALL ON FUNCTION public.snapshot_accepted_booking_request_rate() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_booking_financial_inputs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rate numeric;
  v_duration integer;
BEGIN
  IF NEW.delivery_mode = 'in_person' THEN
    SELECT g.instruction_duration_minutes
    INTO v_duration
    FROM public.in_person_credit_reservations r
    JOIN public.in_person_request_groups g ON g.id = r.request_group_id
    WHERE r.student_id = NEW.student_id
      AND r.status = 'reserved'
      AND r.booking_id IS NULL
      AND g.scheduled_at = NEW.scheduled_at
    ORDER BY r.created_at
    LIMIT 1
    FOR UPDATE OF r;
    NEW.instruction_duration_minutes := COALESCE(
      v_duration, NEW.instruction_duration_minutes,
      public.get_in_person_instruction_duration()
    );
    NEW.duration_minutes := NEW.instruction_duration_minutes;
    IF NEW.instruction_duration_minutes NOT IN (45, 60) THEN
      RAISE EXCEPTION 'Saved in-person duration must be 45 or 60 minutes'
        USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.teacher_hourly_rate_snapshot IS NULL THEN
    SELECT tp.hourly_rate INTO v_rate
    FROM public.teacher_profiles tp
    WHERE tp.user_id = NEW.teacher_id;
    IF v_rate IS NULL OR v_rate <= 0 OR v_rate > 1000 THEN
      RAISE EXCEPTION 'Teacher hourly rate is missing or outside the allowed range'
        USING ERRCODE = '22023';
    END IF;
    NEW.teacher_hourly_rate_snapshot := v_rate;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS snapshot_booking_financial_inputs ON public.bookings;
CREATE TRIGGER snapshot_booking_financial_inputs
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_booking_financial_inputs();
REVOKE ALL ON FUNCTION public.snapshot_booking_financial_inputs() FROM PUBLIC, anon, authenticated;

-- Keep the established 20260510200000 pricing formula, but settle from actual
-- duration and saved booking inputs. A missing balance aborts the whole update.
CREATE OR REPLACE FUNCTION public.auto_complete_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_duration_minutes integer;
  v_actual_seconds numeric;
  v_vat_rate numeric := 15;
  v_hourly_rate numeric;
  v_gross numeric := 0;
  v_vat_amount numeric := 0;
  v_teacher_base numeric := 0;
  v_platform_fee numeric := 0;
  v_sub_id uuid;
  v_updated integer;
BEGIN
  IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = NEW.booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session has no booking' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.delivery_mode = 'in_person' THEN
    RETURN NEW;
  END IF;

  IF NEW.started_at IS NULL OR NEW.ended_at <= NEW.started_at THEN
    RAISE EXCEPTION 'Session start and end times are invalid' USING ERRCODE = '22023';
  END IF;
  v_actual_seconds := CASE
    WHEN NEW.duration_seconds > 0 THEN NEW.duration_seconds
    ELSE EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))
  END;
  IF v_actual_seconds <= 0 OR v_actual_seconds > 14400 THEN
    RAISE EXCEPTION 'Actual session duration is outside the allowed range'
      USING ERRCODE = '22023';
  END IF;
  v_duration_minutes := CEIL(v_actual_seconds / 60.0)::integer;
  NEW.duration_minutes := v_duration_minutes;

  IF v_duration_minutes < 5 THEN
    NEW.short_session := true;
    NEW.deducted_minutes := 0;
    NEW.teacher_earning := 0;
    NEW.gross_amount := 0;
    NEW.platform_fee := 0;
    NEW.teacher_base_amount := 0;
    NEW.vat_amount := 0;
    NEW.net_amount := 0;
    UPDATE public.bookings SET status = 'completed' WHERE id = NEW.booking_id;
    RETURN NEW;
  END IF;

  v_hourly_rate := COALESCE(
    v_booking.teacher_hourly_rate_snapshot,
    (SELECT tp.hourly_rate FROM public.teacher_profiles tp WHERE tp.user_id = v_booking.teacher_id)
  );
  IF v_hourly_rate IS NULL OR v_hourly_rate <= 0 OR v_hourly_rate > 1000 THEN
    RAISE EXCEPTION 'Saved teacher hourly rate is missing or outside the allowed range'
      USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(fs.vat_rate, 15) INTO v_vat_rate
  FROM public.financial_settings fs
  ORDER BY fs.updated_at DESC
  LIMIT 1;

  -- Preserve the 60-SAR gross base and net teacher hourly-rate formula.
  v_gross := ROUND((v_duration_minutes::numeric / 60.0) * 60.0, 2);
  v_vat_amount := ROUND(v_gross * v_vat_rate / (100.0 + v_vat_rate), 2);
  v_teacher_base := ROUND((v_duration_minutes::numeric / 60.0) * v_hourly_rate, 2);
  v_platform_fee := ROUND(v_gross - v_teacher_base, 2);
  NEW.short_session := false;
  NEW.deducted_minutes := v_duration_minutes;
  NEW.gross_amount := v_gross;
  NEW.vat_amount := v_vat_amount;
  NEW.vat_rate_snapshot := v_vat_rate;
  NEW.teacher_base_amount := v_teacher_base;
  NEW.teacher_earning := v_teacher_base;
  NEW.platform_fee := v_platform_fee;
  NEW.platform_fee_rate_snapshot := ROUND((v_gross - v_teacher_base) / NULLIF(v_gross, 0), 6);
  NEW.net_amount := v_teacher_base;

  SELECT s.id INTO v_sub_id
  FROM public.user_subscriptions s
  WHERE s.id = v_booking.subscription_id
    AND s.user_id = v_booking.student_id
    AND s.is_active
    AND s.remaining_minutes >= v_duration_minutes
  FOR UPDATE;
  IF v_sub_id IS NULL THEN
    SELECT s.id INTO v_sub_id
    FROM public.user_subscriptions s
    WHERE s.user_id = v_booking.student_id
      AND s.is_active
      AND s.remaining_minutes >= v_duration_minutes
    ORDER BY s.ends_at, s.created_at
    LIMIT 1
    FOR UPDATE;
  END IF;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'Insufficient active package balance for actual session duration'
      USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.user_subscriptions
  SET remaining_minutes = remaining_minutes - v_duration_minutes
  WHERE id = v_sub_id
    AND remaining_minutes >= v_duration_minutes;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Package balance changed before session settlement'
      USING ERRCODE = '40001';
  END IF;
  UPDATE public.bookings SET status = 'completed' WHERE id = NEW.booking_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_complete_session() FROM PUBLIC, anon, authenticated;

-- Private registry for deployed SQL fingerprints. 011/012 were already
-- applied to production; record their exact source hashes so the deploy runner
-- can skip them instead of executing them again.
CREATE TABLE IF NOT EXISTS public.deployed_migration_fingerprints (
  migration_name text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL
);
ALTER TABLE public.deployed_migration_fingerprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deployed_migration_fingerprints
  FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.deployed_migration_fingerprints(migration_name, sha256, source)
VALUES
  ('20261021001100_in_person_session_lifecycle.sql', '4f30245ae45bcf4da440307526346f701542d504b1187f0692c683e20092a647', 'verified production application'),
  ('20261021001200_mode_aware_booking_expiry.sql', '18d3e3961b2813b6e40e98770214dc49c40e16bf09f82b876e27d8037cb8a822', 'verified production application')
ON CONFLICT (migration_name) DO UPDATE
SET sha256 = EXCLUDED.sha256, source = EXCLUDED.source;
