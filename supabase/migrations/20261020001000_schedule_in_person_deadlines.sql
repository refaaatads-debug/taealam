DO $$
DECLARE
  v_pg_cron_available boolean;
  v_job_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) INTO v_pg_cron_available;

  IF NOT v_pg_cron_available OR to_regnamespace('cron') IS NULL
     OR to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is unavailable; in-person deadline processing must be scheduled by the deployment';
    RETURN;
  END IF;

  EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
    INTO v_job_exists
    USING 'process-in-person-deadlines';
  IF NOT v_job_exists THEN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING 'process-in-person-deadlines', '* * * * *',
        'SET request.jwt.claim.role = ''service_role''; SELECT public.process_in_person_deadlines();';
  END IF;
END;
$$;
