-- ROLLBACK for 20261127130000_session_counted_seconds.sql. Run in one transaction.
-- Restores the exact previous definitions (captured from production before the change).
SET lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.heartbeat_session(uuid, integer);

CREATE OR REPLACE FUNCTION public.close_stale_sessions(p_stale_after interval DEFAULT '00:10:00'::interval)
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
      SELECT COALESCE(SUM(sub.remaining_minutes), 0)::integer AS remaining_minutes
      FROM public.user_subscriptions sub
      WHERE sub.user_id = b.student_id
        AND sub.is_active
        AND sub.remaining_minutes > 0
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
        duration_seconds = LEAST(14400, limits.elapsed_seconds, limits.remaining_minutes * 60)
    FROM limits
    WHERE s.id = limits.id
      AND s.ended_at IS NULL
    RETURNING s.id
  )
  SELECT count(*) INTO v_limited FROM closed;

  RETURN v_count + v_limited;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_sessions_client_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Only direct client writes (PostgREST roles). RPCs/triggers run as owner, service_role is exempt.
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN NEW; END IF;

  IF OLD.ended_at IS NOT NULL THEN
    -- already settled: billing and timing fields are frozen
    NEW.started_at := OLD.started_at;
    NEW.ended_at := OLD.ended_at;
    NEW.duration_seconds := OLD.duration_seconds;
    NEW.duration_minutes := OLD.duration_minutes;
  ELSE
    IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      IF OLD.started_at IS NOT NULL THEN
        NEW.started_at := OLD.started_at;
      ELSIF NEW.started_at IS NOT NULL THEN
        NEW.started_at := LEAST(GREATEST(NEW.started_at, now() - interval '10 minutes'), now());
      END IF;
    END IF;
    IF NEW.ended_at IS NOT NULL THEN
      -- client is ending the session: server clock decides the end and the duration
      NEW.ended_at := now();
      NEW.duration_seconds := GREATEST(0, floor(extract(epoch FROM (now() - COALESCE(NEW.started_at, now()))))::integer);
    ELSE
      NEW.duration_seconds := OLD.duration_seconds;
      NEW.duration_minutes := OLD.duration_minutes;
    END IF;
  END IF;
  NEW.deducted_minutes := OLD.deducted_minutes;
  NEW.teacher_earning := OLD.teacher_earning;
  NEW.short_session := OLD.short_session;
  NEW.gross_amount := OLD.gross_amount;
  NEW.platform_fee := OLD.platform_fee;
  NEW.teacher_base_amount := OLD.teacher_base_amount;
  NEW.vat_amount := OLD.vat_amount;
  NEW.net_amount := OLD.net_amount;
  NEW.platform_fee_rate_snapshot := OLD.platform_fee_rate_snapshot;
  NEW.vat_rate_snapshot := OLD.vat_rate_snapshot;
  RETURN NEW;
END;
$function$
;

ALTER TABLE public.sessions DROP COLUMN IF EXISTS counted_seconds;
