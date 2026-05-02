CREATE OR REPLACE FUNCTION public.auto_expire_stale_bookings()
 RETURNS TABLE(expired_count integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _count integer := 0;
  _details jsonb;
  _row RECORD;
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

  -- Send notifications to both student and teacher for each expired booking
  IF _count > 0 THEN
    FOR _row IN SELECT * FROM jsonb_to_recordset(_details) AS x(booking_id uuid, student_id uuid, teacher_id uuid, scheduled_at timestamptz)
    LOOP
      -- Student notification
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _row.student_id,
        'تم إلغاء الحصة تلقائياً',
        'تم إلغاء حصتك المجدولة في ' || to_char(_row.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' بسبب: عدم بدء الحصة في الوقت المحدد (expired_no_show). تم إعادة الدقائق إلى رصيدك.',
        'booking_cancelled',
        '/dashboard'
      );

      -- Teacher notification
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _row.teacher_id,
        'تم إلغاء الحصة تلقائياً',
        'تم إلغاء الحصة المجدولة في ' || to_char(_row.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' بسبب: عدم بدء الحصة في الوقت المحدد (expired_no_show).',
        'booking_cancelled',
        '/teacher-dashboard'
      );
    END LOOP;

    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES ('info', 'auto_expire_stale_bookings',
      'Cancelled ' || _count || ' stale bookings (no-show / never started) and notified users',
      jsonb_build_object('count', _count, 'bookings', _details));
  END IF;

  RETURN QUERY SELECT _count, _details;
END;
$function$;