-- =============================================================
-- Migration: cleanup active_sessions cron job + sequence fix
-- Date: 2026-05-13
-- Fixes:
--   1. Create cleanup_stale_active_sessions() function
--   2. Register cleanup-active-sessions cron job (every hour)
--   3. Fix pg_cron jobid_seq to prevent duplicate key errors
--   4. Initial cleanup of stale sessions older than 2 hours
-- =============================================================

-- 1. Create the cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_stale_active_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.active_sessions
  WHERE is_connected = false
    AND disconnected_at < NOW() - INTERVAL '2 hours';
END;
$$;

-- Grant execute to postgres and service_role
GRANT EXECUTE ON FUNCTION public.cleanup_stale_active_sessions() TO postgres, service_role;

-- 2. Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Fix sequence: set it to max(jobid) to avoid duplicate key errors
SELECT setval('cron.jobid_seq', COALESCE((SELECT MAX(jobid) FROM cron.job), 0), true);

-- 4. Add cleanup-active-sessions cron job if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-active-sessions') THEN
    PERFORM cron.schedule(
      'cleanup-active-sessions',
      '0 * * * *',
      'SELECT public.cleanup_stale_active_sessions();'
    );
  END IF;
END;
$$;

-- 5. Run initial cleanup of stale sessions
SELECT public.cleanup_stale_active_sessions();
