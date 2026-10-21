-- The generic no-show processor belongs to online bookings only.
-- In-person bookings use attendance_confirmed_at and their dedicated
-- process_in_person_deadlines() flow; never expire them for lacking an
-- online sessions.started_at row.
CREATE OR REPLACE FUNCTION public.auto_expire_stale_bookings()
RETURNS TABLE(expired_count integer, details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _details jsonb;
  _row RECORD;
BEGIN
  WITH stale AS (
    SELECT b.id, b.status, b.student_id, b.teacher_id, b.scheduled_at, b.duration_minutes
    FROM public.bookings b
    WHERE b.delivery_mode = 'online'
      AND b.attendance_confirmed_at IS NULL
      AND b.status IN ('pending','confirmed')
      AND b.scheduled_at + (b.duration_minutes || ' minutes')::interval + interval '30 minutes' < now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.sessions s
        WHERE s.booking_id = b.id
          AND s.started_at IS NOT NULL
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
      AND b.delivery_mode = 'online'
      AND b.attendance_confirmed_at IS NULL
      AND b.status IN ('pending','confirmed')
      AND NOT EXISTS (
        SELECT 1
        FROM public.sessions s
        WHERE s.booking_id = b.id
          AND s.started_at IS NOT NULL
      )
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
    FOR _row IN
      SELECT *
      FROM jsonb_to_recordset(_details)
        AS x(booking_id uuid, student_id uuid, teacher_id uuid, scheduled_at timestamptz)
    LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _row.student_id,
        'تم إلغاء الحصة تلقائياً',
        'تم إلغاء حصتك الأونلاين المجدولة في '
          || to_char(_row.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
          || ' لعدم بدء الجلسة خلال المهلة المحددة. أُعيدت دقائق الحصة إلى رصيدك.',
        'booking_cancelled',
        '/dashboard'
      );

      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _row.teacher_id,
        'تم إلغاء الحصة تلقائياً',
        'تم إلغاء حصتك الأونلاين المجدولة في '
          || to_char(_row.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
          || ' لعدم بدء الجلسة خلال المهلة المحددة.',
        'booking_cancelled',
        '/teacher-dashboard'
      );
    END LOOP;

    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES (
      'info',
      'auto_expire_stale_bookings',
      'Cancelled ' || _count || ' stale online bookings (no-show) and notified users',
      jsonb_build_object('count', _count, 'bookings', _details)
    );
  END IF;

  RETURN QUERY SELECT _count, _details;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_expire_stale_bookings()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_expire_stale_bookings()
  TO service_role;

-- Give in-person attendance-window cancellations their own Arabic notices.
-- This fires only on the dedicated no-attendance cancellation transition;
-- confirmed attendance is excluded by the processor and checked again here.
CREATE OR REPLACE FUNCTION public.notify_in_person_attendance_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_when text := to_char(
    NEW.scheduled_at AT TIME ZONE 'Asia/Riyadh',
    'YYYY-MM-DD HH24:MI'
  );
BEGIN
  IF OLD.status::text = 'cancelled'
     OR NEW.status::text <> 'cancelled'
     OR NEW.delivery_mode <> 'in_person'
     OR NEW.cancellation_reason <> 'attendance_window_expired'
     OR NEW.attendance_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (
    NEW.student_id,
    'انتهت مهلة تأكيد الحضور',
    'أُلغيت حصتك الحضورية المجدولة في ' || v_when
      || ' لعدم تأكيد رمز الحضور خلال المهلة المحددة. أُعيدت دقائق الحصة إلى رصيدك.',
    'booking_cancelled',
    '/dashboard'
  );

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (
    NEW.teacher_id,
    'انتهت مهلة تأكيد الحضور',
    'أُلغيت الحصة الحضورية المجدولة في ' || v_when
      || ' لعدم تأكيد رمز الحضور خلال المهلة المحددة.',
    'booking_cancelled',
    '/teacher-dashboard'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_in_person_attendance_expired()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_in_person_attendance_expired
  ON public.bookings;
CREATE TRIGGER notify_in_person_attendance_expired
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (
    NEW.status::text = 'cancelled'
    AND NEW.delivery_mode = 'in_person'
    AND NEW.cancellation_reason = 'attendance_window_expired'
  )
  EXECUTE FUNCTION public.notify_in_person_attendance_expired();
