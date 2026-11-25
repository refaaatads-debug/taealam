-- Session reliability pack (3/4): sweeper for dead sessions + minute-limit enforcement.
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

-- Pass 2 (limit enforcement): remaining_minutes is only decremented at
-- settlement, so during a session it still reads as the balance the session
-- started with. When elapsed reaches that balance the server ends the session
-- itself: ended_at is set to the moment the balance ran out, duration_seconds
-- keeps the true elapsed time, and the settlement trigger deducts exactly the
-- balance (clamped) and records the overrun in unbilled_minutes. Both clients
-- already close themselves when ended_at appears (web: realtime postgres_changes
-- on the sessions row; mobile: 5s lifecycle poll), so no client change is
-- needed for the end signal.
CREATE OR REPLACE FUNCTION public.close_stale_sessions(p_stale_after interval DEFAULT interval '10 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_limited integer := 0;
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
    SET ended_at = LEAST(stale.last_heartbeat_at, stale.started_at + interval '4 hours'),
        duration_seconds = LEAST(14400, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (stale.last_heartbeat_at - stale.started_at)))::integer))
    FROM stale
    WHERE s.id = stale.id
      AND s.ended_at IS NULL
    RETURNING s.id
  )
  SELECT count(*) INTO v_count FROM closed;

  -- Auto-close when the student's minutes run out (server-side backstop; the
  -- teacher's client already ends at the limit, this covers its absence).
  WITH limits AS (
    SELECT s.id,
           s.started_at,
           FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer AS elapsed_seconds,
           sub.remaining_minutes
    FROM public.sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    JOIN LATERAL (
      SELECT sub.id, sub.remaining_minutes,
             CASE WHEN sub.id = b.subscription_id THEN 0 ELSE 1 END AS pref
      FROM public.user_subscriptions sub
      WHERE sub.user_id = b.student_id
        AND sub.is_active
      ORDER BY pref, sub.ends_at, sub.created_at
      LIMIT 1
    ) sub ON true
    WHERE s.ended_at IS NULL
      AND s.started_at IS NOT NULL
      -- heartbeat-capable sessions only: without a live heartbeat we cannot
      -- trust elapsed, and ending an old row would bill days of wall-clock
      AND s.last_heartbeat_at IS NOT NULL
      AND sub.remaining_minutes > 0
      AND EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)) >= sub.remaining_minutes * 60
  ), closed AS (
    UPDATE public.sessions s
    SET ended_at = limits.started_at + make_interval(secs => limits.remaining_minutes * 60),
        duration_seconds = LEAST(14400, limits.elapsed_seconds)
    FROM limits
    WHERE s.id = limits.id
      AND s.ended_at IS NULL
    RETURNING s.id
  )
  SELECT count(*) INTO v_limited FROM closed;

  RETURN v_count + v_limited;
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
