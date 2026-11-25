-- Ops alerts for admins + server-side session reminders.
-- Purely additive: new table, new functions, new cron jobs. Does NOT touch
-- close_stale_sessions, heartbeat_session or any session/billing function.
-- Rollback: SELECT cron.unschedule('ops-alerts-check'); SELECT cron.unschedule('online-session-reminders');
--           DROP FUNCTION public.check_ops_alerts(); DROP FUNCTION public.process_online_session_reminders();
--           DROP FUNCTION public.raise_admin_alert(text,text,text,text); DROP TABLE public.ops_event_keys;

CREATE TABLE IF NOT EXISTS public.ops_event_keys (
  event_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ops_event_keys ENABLE ROW LEVEL SECURITY;

-- Send one notification to every admin, once per event key.
CREATE OR REPLACE FUNCTION public.raise_admin_alert(p_key text, p_title text, p_body text, p_link text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_n integer := 0;
BEGIN
  INSERT INTO public.ops_event_keys(event_key) VALUES (p_key) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO public.notifications(user_id, title, body, type, link)
  SELECT DISTINCT ur.user_id, p_title, p_body, 'admin_alert', p_link
  FROM public.user_roles ur
  WHERE ur.role = 'admin'::public.app_role;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- Alerts: (1) reconciliation not ok, (2) session closed by the stale sweeper.
-- Only looks at recent rows so enabling it never floods admins with history.
CREATE OR REPLACE FUNCTION public.check_ops_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  r record;
  v_total integer := 0;
BEGIN
  FOR r IN
    SELECT id, status, run_date, expected_total, actual_total, difference
    FROM public.financial_reconciliation
    WHERE status <> 'ok' AND created_at > now() - interval '2 days'
  LOOP
    v_total := v_total + public.raise_admin_alert(
      'recon:' || r.id,
      CASE WHEN r.status = 'mismatch' THEN '⚠️ عدم تطابق مالي في التسوية اليومية' ELSE 'تنبيه: فرق بسيط في التسوية اليومية' END,
      'تاريخ ' || r.run_date || ' | المتوقع ' || r.expected_total || ' | الفعلي ' || r.actual_total || ' | الفرق ' || r.difference,
      '/admin'
    );
  END LOOP;

  -- Sweeper-closed: the sweeper sets ended_at exactly to the last heartbeat;
  -- a normal end always lands later than the last heartbeat.
  FOR r IN
    SELECT s.id, s.booking_id, s.started_at, s.ended_at, s.duration_seconds
    FROM public.sessions s
    WHERE s.ended_at IS NOT NULL
      AND s.last_heartbeat_at IS NOT NULL
      AND s.ended_at = s.last_heartbeat_at
      AND s.ended_at > now() - interval '2 hours'
  LOOP
    v_total := v_total + public.raise_admin_alert(
      'sweeper:' || r.id,
      '⚠️ جلسة أُغلقت تلقائياً من السيرفر (انقطع الاتصال)',
      'جلسة ' || r.id || ' بدأت ' || to_char(r.started_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') ||
        ' وانتهت عند آخر نبضة، المدة ' || COALESCE(r.duration_seconds / 60, 0) || ' دقيقة. راجع الفوترة والطرفين.',
      '/admin'
    );
  END LOOP;
  RETURN v_total;
END;
$function$;

-- Server-side reminder 15 minutes before an online session (student + teacher).
-- Idempotent per booking and person. The notification insert already triggers
-- the push for users who have a device token.
CREATE OR REPLACE FUNCTION public.process_online_session_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  b record;
  v_count integer := 0;
  v_subject text;
BEGIN
  FOR b IN
    SELECT bk.id, bk.student_id, bk.teacher_id, bk.scheduled_at, COALESCE(sub.name, 'الحصة') AS subject
    FROM public.bookings bk
    LEFT JOIN public.subjects sub ON sub.id = bk.subject_id
    WHERE bk.delivery_mode = 'online'
      AND bk.status::text = 'confirmed'
      AND bk.scheduled_at > now() + interval '13 minutes'
      AND bk.scheduled_at <= now() + interval '16 minutes'
  LOOP
    v_subject := b.subject;
    INSERT INTO public.ops_event_keys(event_key) VALUES ('reminder15:' || b.id || ':student') ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.notifications(user_id, title, body, type, link)
      VALUES (b.student_id, '⏰ حصتك تبدأ بعد 15 دقيقة', 'حصة ' || v_subject || ' بعد نحو 15 دقيقة. جهّز الكاميرا والمايك.', 'session_reminder', '/dashboard?booking=' || b.id);
      v_count := v_count + 1;
    END IF;
    INSERT INTO public.ops_event_keys(event_key) VALUES ('reminder15:' || b.id || ':teacher') ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.notifications(user_id, title, body, type, link)
      VALUES (b.teacher_id, '⏰ حصتك تبدأ بعد 15 دقيقة', 'حصة ' || v_subject || ' بعد نحو 15 دقيقة.', 'session_reminder', '/teacher?booking=' || b.id);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.raise_admin_alert(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_ops_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_online_session_reminders() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('ops-alerts-check', '*/5 * * * *', $$SELECT public.check_ops_alerts()$$);
SELECT cron.schedule('online-session-reminders', '* * * * *', $$SELECT public.process_online_session_reminders()$$);
