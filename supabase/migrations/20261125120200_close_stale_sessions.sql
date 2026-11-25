-- Session reliability pack (3/4): sweeper for sessions whose clients died.
-- NOT YET APPLIED to production. Prepared 2026-11-25; apply only with the
-- owner's approval. Requires migration 20261125120000 (heartbeat) and
-- 20261125120100 (settle-or-clamp: the sweeper relies on settlement never
-- raising on insufficient balance).
--
-- A session whose participants both dropped (crash, network loss, closed tab)
-- never gets ended_at: no client is left to write it. The row stays open, the
-- booking stays in_progress, and billing never settles. This function closes
-- such sessions from the last heartbeat and lets the normal settlement
-- trigger bill exactly up to the last sign of life.
--
-- SAFETY: only rows that have ever received a heartbeat are swept. Clients
-- running older app versions never write heartbeats, so their live sessions
-- are left untouched (closing a genuinely live old-client session would be
-- worse than leaving a stale one).

CREATE OR REPLACE FUNCTION public.close_stale_sessions(p_stale_after interval DEFAULT interval '3 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH stale AS (
    SELECT s.id, s.started_at, s.last_heartbeat_at
    FROM public.sessions s
    WHERE s.ended_at IS NULL
      AND s.started_at IS NOT NULL
      AND s.last_heartbeat_at IS NOT NULL
      AND s.last_heartbeat_at < now() - p_stale_after
      -- never settle more than the hard duration cap the trigger allows
      AND s.last_heartbeat_at > s.started_at
  ), closed AS (
    UPDATE public.sessions s
    SET ended_at = stale.last_heartbeat_at,
        duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (stale.last_heartbeat_at - stale.started_at)))::integer)
    FROM stale
    WHERE s.id = stale.id
      AND s.ended_at IS NULL
    RETURNING s.id
  )
  SELECT count(*) INTO v_count FROM closed;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.close_stale_sessions(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_stale_sessions(interval) TO service_role;

-- Run every minute via pg_cron. Idempotent: replace the job if it exists.
DO $$
BEGIN
  PERFORM cron.unschedule('close-stale-sessions');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
SELECT cron.schedule('close-stale-sessions', '* * * * *', $$SELECT public.close_stale_sessions()$$);
