-- Session reliability pack (1/4): heartbeat column + participant-checked RPC.
-- NOT YET APPLIED to production. Prepared 2026-11-25 as part of the session
-- reliability review; apply only with the owner's approval.
--
-- Purpose: give the server a liveness signal for open sessions so the sweeper
-- (migration 20261125120100) can close sessions whose clients both died without
-- ever writing ended_at (today such rows stay open forever and billing never
-- settles).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- Sweeper lookup: open sessions by heartbeat age.
CREATE INDEX IF NOT EXISTS idx_sessions_open_heartbeat
  ON public.sessions (last_heartbeat_at)
  WHERE ended_at IS NULL;

-- Both participants heartbeat every ~30s while in the session. Security definer
-- so it is not subject to guard_sessions_client_writes; it only ever touches
-- last_heartbeat_at on a session that is still open, and only for a caller who
-- is the booking's student or teacher (or an admin / the service role).
CREATE OR REPLACE FUNCTION public.heartbeat_session(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
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
  SET last_heartbeat_at = v_now
  WHERE s.booking_id = p_booking_id
    AND s.ended_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'beat_at', v_now, 'sessions_touched', v_updated);
END;
$function$;

REVOKE ALL ON FUNCTION public.heartbeat_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_session(uuid) TO service_role;
