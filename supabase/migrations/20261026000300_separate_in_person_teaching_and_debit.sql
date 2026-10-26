BEGIN;

ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS in_person_package_debit_minutes integer NOT NULL DEFAULT 100;

-- New in-person sessions teach for one hour and debit the agreed 100 package minutes.
-- Previously created requests and bookings keep their saved snapshots.
UPDATE public.financial_settings
SET in_person_instruction_duration_minutes = 60,
    in_person_package_debit_minutes = 100,
    updated_at = now();

ALTER TABLE public.financial_settings
  DROP CONSTRAINT IF EXISTS financial_settings_in_person_package_debit_minutes_check,
  ADD CONSTRAINT financial_settings_in_person_package_debit_minutes_check
    CHECK (
      in_person_package_debit_minutes BETWEEN 15 AND 180
      AND in_person_package_debit_minutes >= in_person_instruction_duration_minutes
    );

CREATE OR REPLACE FUNCTION public.get_in_person_package_debit_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT fs.in_person_package_debit_minutes
    FROM public.financial_settings fs
    ORDER BY fs.updated_at DESC
    LIMIT 1
  ), 100)
$$;
REVOKE ALL ON FUNCTION public.get_in_person_package_debit_minutes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_in_person_package_debit_minutes() TO authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.create_in_person_request(uuid,timestamptz,uuid,uuid,uuid[],text)'::regprocedure
  );
  v_updated := replace(v_definition,
    '  v_duration integer;',
    '  v_duration integer;
  v_package_debit_minutes integer;');
  v_updated := replace(v_updated,
    'v_duration := public.get_in_person_instruction_duration();',
    'v_duration := public.get_in_person_instruction_duration();
  v_package_debit_minutes := public.get_in_person_package_debit_minutes();');
  v_updated := replace(v_updated,
    'AND s.remaining_minutes >= v_duration',
    'AND s.remaining_minutes >= v_package_debit_minutes');
  v_updated := replace(v_updated,
    'remaining_minutes = remaining_minutes - v_duration',
    'remaining_minutes = remaining_minutes - v_package_debit_minutes');
  v_updated := replace(v_updated,
    'AND remaining_minutes >= v_duration',
    'AND remaining_minutes >= v_package_debit_minutes');
  v_updated := replace(v_updated,
    'v_subscription_id, v_duration, p_idempotency_key',
    'v_subscription_id, v_package_debit_minutes, p_idempotency_key');
  IF v_updated = v_definition
     OR position('v_package_debit_minutes' IN v_updated) = 0
     OR position('remaining_minutes - v_duration' IN v_updated) > 0
     OR position('v_subscription_id, v_duration, p_idempotency_key' IN v_updated) > 0 THEN
    RAISE EXCEPTION 'Could not separate in-person teaching duration from package debit';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.snapshot_in_person_booking_price()'::regprocedure);
  v_updated := replace(v_definition,
    'NEW.in_person_package_minutes := COALESCE(NEW.in_person_package_minutes, NEW.in_person_teaching_minutes);',
    'NEW.in_person_package_minutes := COALESCE(NEW.in_person_package_minutes, public.get_in_person_package_debit_minutes());');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not set the separate in-person package-debit snapshot';
  END IF;
  EXECUTE v_updated;
END;
$migration$;

COMMIT;
