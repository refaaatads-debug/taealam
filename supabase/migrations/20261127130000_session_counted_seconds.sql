-- PREVIEW ONLY. NOT APPLIED. Apply manually in one transaction after a backup, with no open session.
-- Session clock: the server keeps the COUNTED seconds (the teacher's pause-aware counter), so
-- outage/pause time is never billed and a returning teacher (any device, any delay) continues
-- from the same second.
--   1) sessions.counted_seconds (default 0 = "unknown", old behaviour = wall clock).
--   2) heartbeat_session(uuid, integer): NEW overload, stores GREATEST(old, new), capped by real
--      elapsed since started_at (+5s). The old 1-arg heartbeat_session(uuid) is untouched.
--   3) guard_sessions_client_writes: clients cannot write counted_seconds directly.
--   4) close_stale_sessions: uses counted_seconds when > 0, else the old wall-clock value.
-- Rollback: rollbacks_20261127130000_session_counted_seconds.sql

SET lock_timeout = '5s';

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS counted_seconds integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.heartbeat_session(p_booking_id uuid, p_counted_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
  v_counted integer := 0;
BEGIN
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'booking id required' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role)
       AND NOT EXISTS (
         SELECT 1 FROM public.bookings bk
         WHERE bk.id = p_booking_id
           AND (bk.student_id = auth.uid() OR bk.teacher_id = auth.uid())
       ) THEN
      RAISE EXCEPTION 'Not allowed to heartbeat this session' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.sessions s
  SET last_heartbeat_at = v_now,
      counted_seconds = CASE
        WHEN s.started_at IS NOT NULL AND COALESCE(p_counted_seconds, 0) > 0
          THEN GREATEST(
                 s.counted_seconds,
                 LEAST(p_counted_seconds,
                       14400,
                       GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - s.started_at)))::integer) + 5))
        ELSE s.counted_seconds
      END
  WHERE s.booking_id = p_booking_id
    AND s.ended_at IS NULL
  RETURNING s.counted_seconds INTO v_counted;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'beat_at', v_now, 'sessions_touched', v_updated, 'counted_seconds', COALESCE(v_counted, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.heartbeat_session(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_session(uuid, integer) TO authenticated;

-- Clients cannot write the counted clock directly (only the heartbeat function can).
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
  NEW.counted_seconds := OLD.counted_seconds;
  RETURN NEW;
END;
$function$
;

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
    SELECT s.id, s.started_at, s.last_heartbeat_at,
           CASE WHEN s.counted_seconds > 0
                THEN LEAST(s.counted_seconds, FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer)
                ELSE FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer
           END AS counted
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
        duration_seconds = LEAST(14400, GREATEST(0, stale.counted))
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
           s.last_heartbeat_at,
           CASE WHEN s.counted_seconds > 0
                THEN LEAST(s.counted_seconds, FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer)
                ELSE FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer
           END AS elapsed_seconds,
           (s.counted_seconds > 0) AS has_counted,
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
      AND (CASE WHEN s.counted_seconds > 0
                THEN LEAST(s.counted_seconds, FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer)
                ELSE FLOOR(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at)))::integer
           END) >= sub.remaining_minutes * 60
  ), closed AS (
    UPDATE public.sessions s
    SET ended_at = CASE WHEN limits.has_counted
                        THEN limits.last_heartbeat_at - make_interval(secs => GREATEST(0, limits.elapsed_seconds - limits.remaining_minutes * 60))
                        ELSE limits.started_at + make_interval(secs => limits.remaining_minutes * 60) END,
        duration_seconds = LEAST(14400, limits.elapsed_seconds, limits.remaining_minutes * 60)
    FROM limits
    WHERE s.id = limits.id
      AND s.ended_at IS NULL
    RETURNING s.id
  )
  SELECT count(*) INTO v_limited FROM closed;

  RETURN v_count + v_limited;
END;
$function$;
