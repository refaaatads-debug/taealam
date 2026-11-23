
-- Find and move any remaining extensions in public schema
DO $$
DECLARE
  ext_name text;
BEGIN
  FOR ext_name IN
    SELECT e.extname FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', ext_name);
      RAISE NOTICE 'Moved extension % to extensions schema', ext_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not move %: %', ext_name, SQLERRM;
    END;
  END LOOP;
END $$;
