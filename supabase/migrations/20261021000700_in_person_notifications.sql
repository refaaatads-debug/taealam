-- Keep in-person notifications transactional and idempotent across UI refreshes,
-- RPC retries, and scheduled processing.
CREATE TABLE IF NOT EXISTS public.in_person_notification_events (
  event_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.in_person_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.in_person_notification_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.emit_in_person_notification(
  p_event_key text,
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_link text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.in_person_notification_events(event_key)
  VALUES (p_event_key)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.notifications(user_id, title, body, type, link)
  VALUES (p_user_id, p_title, p_body, p_type, p_link);
END;
$$;
REVOKE ALL ON FUNCTION public.emit_in_person_notification(text, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_in_person_notification(text, uuid, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.notify_in_person_group_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid;
  v_teacher_name text;
  v_subject text;
  v_has_waiting_teachers boolean;
  v_link text;
BEGIN
  v_link := '/dashboard?in_person_request=' || NEW.id::text;
  SELECT COALESCE(s.name, 'الحصة الحضورية') INTO v_subject
  FROM public.subjects s WHERE s.id = NEW.subject_id;
  v_subject := COALESCE(v_subject, 'الحصة الحضورية');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_in_person_notification(
      'in-person-request-sent:' || NEW.id || ':student', NEW.student_id,
      'تم إرسال طلب الحصة الحضورية',
      'أُرسل طلبك إلى المعلمين المختارين. ستصلك النتيجة عند القبول أو انتهاء المهلة.',
      'in_person_request_sent', v_link
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'accepted' THEN
    SELECT r.teacher_id, COALESCE(pp.full_name, 'المعلم')
    INTO v_teacher_id, v_teacher_name
    FROM public.in_person_request_recipients r
    LEFT JOIN public.public_profiles pp ON pp.user_id = r.teacher_id
    WHERE r.request_group_id = NEW.id AND r.status = 'accepted'
    LIMIT 1;

    PERFORM public.emit_in_person_notification(
      'in-person-accepted:' || NEW.id || ':student', NEW.student_id,
      'تم قبول الحصة الحضورية',
      'قبل ' || COALESCE(v_teacher_name, 'المعلم') || ' طلب ' || v_subject || '. راجع مواعيدك.',
      'in_person_booking_confirmed', v_link
    );
    IF v_teacher_id IS NOT NULL THEN
      PERFORM public.emit_in_person_notification(
        'in-person-accepted:' || NEW.id || ':teacher:' || v_teacher_id,
        v_teacher_id, 'تم تأكيد الحصة الحضورية',
        'تم قبول طلب ' || v_subject || ' وإضافته إلى مواعيدك.',
        'in_person_booking_confirmed', '/teacher-dashboard?in_person_request=' || NEW.id
      );
    END IF;

    FOR v_teacher_id IN
      SELECT teacher_id FROM public.in_person_request_recipients
      WHERE request_group_id = NEW.id AND status = 'closed'
    LOOP
      PERFORM public.emit_in_person_notification(
        'in-person-filled:' || NEW.id || ':' || v_teacher_id, v_teacher_id,
        'أُسند الطلب إلى معلم آخر',
        'قبل معلم آخر طلب الحصة الحضورية، ولم يعد الطلب متاحًا.',
        'in_person_request_closed', '/teacher-dashboard'
      );
    END LOOP;
  ELSIF NEW.status = 'expired' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.in_person_request_recipients
      WHERE request_group_id = NEW.id AND status IN ('pending', 'closed')
    ) INTO v_has_waiting_teachers;
    -- If every teacher explicitly declined, that outcome is notified by the
    -- recipient trigger; avoid sending a second, misleading timeout message.
    IF v_has_waiting_teachers THEN
      PERFORM public.emit_in_person_notification(
        'in-person-expired:' || NEW.id || ':student', NEW.student_id,
        'انتهى طلب الحصة الحضورية',
        'لم يُقبل الطلب قبل إغلاقه، وتمت إعادة الرصيد المحجوز إلى باقتك.',
        'in_person_request_expired', v_link
      );
      FOR v_teacher_id IN
        SELECT teacher_id FROM public.in_person_request_recipients
        WHERE request_group_id = NEW.id AND status = 'pending'
      LOOP
        PERFORM public.emit_in_person_notification(
          'in-person-expired:' || NEW.id || ':teacher:' || v_teacher_id,
          v_teacher_id, 'انتهى طلب الحصة الحضورية',
          'أُغلق طلب الحصة ولم يعد متاحًا للقبول.',
          'in_person_request_expired', '/teacher-dashboard'
        );
      END LOOP;
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    FOR v_teacher_id IN
      SELECT teacher_id FROM public.in_person_request_recipients
      WHERE request_group_id = NEW.id AND status = 'pending'
    LOOP
      PERFORM public.emit_in_person_notification(
        'in-person-cancelled:' || NEW.id || ':teacher:' || v_teacher_id,
        v_teacher_id, 'ألغى الطالب طلب الحصة الحضورية',
        'ألغى الطالب طلب ' || v_subject || '؛ لم يعد مطلوبًا قبول هذا الطلب.',
        'in_person_request_cancelled', '/teacher-dashboard'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_in_person_group_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_in_person_group_insert ON public.in_person_request_groups;
CREATE TRIGGER notify_in_person_group_insert
  AFTER INSERT ON public.in_person_request_groups
  FOR EACH ROW EXECUTE FUNCTION public.notify_in_person_group_event();
DROP TRIGGER IF EXISTS notify_in_person_group_status ON public.in_person_request_groups;
CREATE TRIGGER notify_in_person_group_status
  AFTER UPDATE OF status ON public.in_person_request_groups
  FOR EACH ROW EXECUTE FUNCTION public.notify_in_person_group_event();

CREATE OR REPLACE FUNCTION public.notify_in_person_recipient_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_group public.in_person_request_groups%ROWTYPE;
  v_subject text;
  v_pending_count integer;
BEGIN
  SELECT * INTO v_group FROM public.in_person_request_groups WHERE id = NEW.request_group_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(name, 'الحصة الحضورية') INTO v_subject
  FROM public.subjects WHERE id = v_group.subject_id;
  v_subject := COALESCE(v_subject, 'الحصة الحضورية');

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.emit_in_person_notification(
      'in-person-request:' || NEW.request_group_id || ':' || NEW.teacher_id,
      NEW.teacher_id, 'طلب حصة حضورية جديد',
      'لديك طلب ' || v_subject || ' بانتظار قبولك. مهلة القبول ساعة من وقت إرسال الطلب.',
      'in_person_request', '/teacher-dashboard?in_person_request=' || NEW.request_group_id
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'declined' THEN
    SELECT count(*) INTO v_pending_count
    FROM public.in_person_request_recipients
    WHERE request_group_id = NEW.request_group_id AND status = 'pending';
    PERFORM public.emit_in_person_notification(
      'in-person-declined:' || NEW.request_group_id || ':' || NEW.teacher_id,
      v_group.student_id,
      CASE WHEN v_pending_count > 0 THEN 'اعتذر أحد معلمي الحصة الحضورية'
           ELSE 'اعتذر جميع المعلمين عن الحصة الحضورية' END,
      CASE WHEN v_pending_count > 0
           THEN 'اعتذر أحد المعلمين عن الطلب، وما زال لدى بقية المعلمين وقت لقبوله.'
           ELSE 'اعتذر جميع المعلمين عن الطلب؛ تم إغلاقه وإعادة الرصيد المحجوز.' END,
      'in_person_request_declined',
      '/dashboard?in_person_request=' || NEW.request_group_id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_in_person_recipient_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_in_person_recipient_insert ON public.in_person_request_recipients;
CREATE TRIGGER notify_in_person_recipient_insert
  AFTER INSERT ON public.in_person_request_recipients
  FOR EACH ROW EXECUTE FUNCTION public.notify_in_person_recipient_event();
DROP TRIGGER IF EXISTS notify_in_person_recipient_decline ON public.in_person_request_recipients;
CREATE TRIGGER notify_in_person_recipient_decline
  AFTER UPDATE OF status ON public.in_person_request_recipients
  FOR EACH ROW EXECUTE FUNCTION public.notify_in_person_recipient_event();

CREATE OR REPLACE FUNCTION public.notify_in_person_booking_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_teacher_name text;
  v_subject text;
  v_link text;
BEGIN
  IF NEW.delivery_mode <> 'in_person' THEN RETURN NEW; END IF;
  v_link := '/dashboard?booking=' || NEW.id::text;
  SELECT COALESCE(pp.full_name, 'المعلم'), COALESCE(s.name, 'الحصة الحضورية')
  INTO v_teacher_name, v_subject
  FROM public.bookings b
  LEFT JOIN public.public_profiles pp ON pp.user_id = b.teacher_id
  LEFT JOIN public.subjects s ON s.id = b.subject_id
  WHERE b.id = NEW.id;

  IF TG_OP = 'UPDATE' AND OLD.attendance_confirmed_at IS NULL
     AND NEW.attendance_confirmed_at IS NOT NULL THEN
    PERFORM public.emit_in_person_notification(
      'in-person-attendance:' || NEW.id || ':teacher', NEW.teacher_id,
      'تم تأكيد حضور الحصة الحضورية',
      'أكد الطالب حضوره لحصة ' || v_subject || '.',
      'in_person_attendance_confirmed', '/teacher-dashboard?booking=' || NEW.id
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status::text IN ('pending', 'confirmed')
     AND NEW.status::text = 'cancelled' THEN
    IF v_actor = NEW.teacher_id THEN
      PERFORM public.emit_in_person_notification(
        'in-person-booking-cancelled:' || NEW.id || ':student', NEW.student_id,
        'ألغى المعلم الحصة الحضورية',
        'ألغى ' || v_teacher_name || ' حصة ' || v_subject || '. راجع مواعيدك ورصيدك.',
        'booking_cancelled', v_link
      );
    ELSIF v_actor = NEW.student_id THEN
      PERFORM public.emit_in_person_notification(
        'in-person-booking-cancelled:' || NEW.id || ':teacher', NEW.teacher_id,
        'ألغى الطالب الحصة الحضورية',
        'ألغى الطالب حصة ' || v_subject || ' المقررة في موعدها.',
        'booking_cancelled', '/teacher-dashboard?booking=' || NEW.id
      );
    ELSE
      PERFORM public.emit_in_person_notification(
        'in-person-booking-cancelled:' || NEW.id || ':student', NEW.student_id,
        'انتهت الحصة الحضورية دون تأكيد الحضور',
        'أُغلقت الحصة تلقائيًا بعد انتهاء نافذة تأكيد الحضور، وتم تحديث رصيدك.',
        'booking_cancelled', v_link
      );
      PERFORM public.emit_in_person_notification(
        'in-person-booking-cancelled:' || NEW.id || ':teacher', NEW.teacher_id,
        'انتهت نافذة تأكيد الحصة الحضورية',
        'أُغلقت الحصة تلقائيًا لعدم تأكيد الحضور.',
        'booking_cancelled', '/teacher-dashboard?booking=' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_in_person_booking_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_in_person_booking_status ON public.bookings;
CREATE TRIGGER notify_in_person_booking_status
  AFTER UPDATE OF attendance_confirmed_at, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_in_person_booking_event();

CREATE OR REPLACE FUNCTION public.process_in_person_session_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_booking record;
  v_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only the service role or an administrator can process reminders'
      USING ERRCODE = '42501';
  END IF;

  FOR v_booking IN
    SELECT b.id, b.student_id, b.teacher_id, b.scheduled_at, COALESCE(s.name, 'الحصة الحضورية') AS subject
    FROM public.bookings b
    LEFT JOIN public.subjects s ON s.id = b.subject_id
    WHERE b.delivery_mode = 'in_person'
      AND b.status::text = 'confirmed'
      AND b.scheduled_at > now() + interval '29 minutes'
      AND b.scheduled_at <= now() + interval '31 minutes'
    ORDER BY b.scheduled_at
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    PERFORM public.emit_in_person_notification(
      'in-person-reminder:' || v_booking.id || ':student', v_booking.student_id,
      'تذكير بحصتك الحضورية بعد 30 دقيقة',
      'لديك حصة ' || v_booking.subject || ' بعد نحو 30 دقيقة.',
      'pre_session', '/dashboard?booking=' || v_booking.id
    );
    PERFORM public.emit_in_person_notification(
      'in-person-reminder:' || v_booking.id || ':teacher', v_booking.teacher_id,
      'تذكير بحصتك الحضورية بعد 30 دقيقة',
      'لديك حصة ' || v_booking.subject || ' بعد نحو 30 دقيقة.',
      'pre_session', '/teacher-dashboard?booking=' || v_booking.id
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.process_in_person_session_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_in_person_session_reminders() TO service_role;

DO $$
DECLARE
  v_pg_cron_available boolean;
  v_job_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
  INTO v_pg_cron_available;
  IF NOT v_pg_cron_available OR to_regnamespace('cron') IS NULL OR to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron unavailable; schedule public.process_in_person_session_reminders() in deployment';
    RETURN;
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
  INTO v_job_exists USING 'process-in-person-session-reminders';
  IF NOT v_job_exists THEN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
    USING 'process-in-person-session-reminders', '* * * * *',
      'SET request.jwt.claim.role = ''service_role''; SELECT public.process_in_person_session_reminders();';
  END IF;
END;
$$;
