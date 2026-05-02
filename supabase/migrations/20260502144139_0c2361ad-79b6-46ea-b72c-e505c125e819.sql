-- Function to auto-cancel stale bookings (no-show / never started)
-- Marks pending/confirmed bookings as cancelled when scheduled_at + duration + 30min grace has passed
-- and no session was ever started.
CREATE OR REPLACE FUNCTION public.auto_expire_stale_bookings()
RETURNS TABLE(expired_count integer, details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _details jsonb;
BEGIN
  WITH stale AS (
    SELECT b.id, b.status, b.student_id, b.teacher_id, b.scheduled_at, b.duration_minutes
    FROM public.bookings b
    WHERE b.status IN ('pending','confirmed')
      AND b.scheduled_at + (b.duration_minutes || ' minutes')::interval + interval '30 minutes' < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.booking_id = b.id AND s.started_at IS NOT NULL
      )
  ),
  upd AS (
    UPDATE public.bookings b
    SET status = 'cancelled',
        session_status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = COALESCE(b.cancellation_reason, 'expired_no_show'),
        updated_at = now()
    FROM stale
    WHERE b.id = stale.id
    RETURNING b.id, b.student_id, b.teacher_id, b.scheduled_at
  )
  SELECT COUNT(*)::int, COALESCE(jsonb_agg(jsonb_build_object(
    'booking_id', upd.id,
    'student_id', upd.student_id,
    'teacher_id', upd.teacher_id,
    'scheduled_at', upd.scheduled_at
  )), '[]'::jsonb)
  INTO _count, _details
  FROM upd;

  IF _count > 0 THEN
    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES ('info', 'auto_expire_stale_bookings',
      'Cancelled ' || _count || ' stale bookings (no-show / never started)',
      jsonb_build_object('count', _count, 'bookings', _details));
  END IF;

  RETURN QUERY SELECT _count, _details;
END;
$$;