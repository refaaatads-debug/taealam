-- Notification spoofing fix (can_notify + checked INSERT policy). DB-only; no client change needed.
-- Notification spoofing fix: only allow client inserts that pass can_notify().
-- DB-only. Same rules a "notify RPC" would enforce, applied to direct inserts via RLS,
-- so existing web/app clients keep working with no change.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_notify(p_caller uuid, p_target uuid, p_type text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_type text := coalesce(p_type, '');
BEGIN
  IF p_caller IS NULL OR p_target IS NULL THEN RETURN false; END IF;
  IF public.has_role(p_caller, 'admin'::public.app_role) THEN RETURN true; END IF;
  IF p_target = p_caller THEN RETURN true; END IF;
  -- users may always write to admins (withdrawal requests, support, violations)
  IF public.has_role(p_target, 'admin'::public.app_role) THEN RETURN true; END IF;
  -- admin/system-only message kinds can never be sent to other users by clients
  IF v_type IN ('warning','violation_warning','account_status','admin_broadcast','broadcast','system_alert',
                'payment','subscription','subscription_warning','subscription_expired','support_reply',
                'monthly_transfer','bonus','ai_quality_alert','ai_error','withdrawal','session_report','general')
  THEN RETURN false; END IF;
  -- existing relationship: booking either direction
  IF EXISTS (SELECT 1 FROM public.bookings b
             WHERE (b.student_id = p_caller AND b.teacher_id = p_target)
                OR (b.teacher_id = p_caller AND b.student_id = p_target)) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.assignments a
             WHERE (a.teacher_id = p_caller AND a.student_id = p_target)
                OR (a.student_id = p_caller AND a.teacher_id = p_target)) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.parent_students ps
             WHERE (ps.parent_id = p_caller AND ps.student_id = p_target)
                OR (ps.student_id = p_caller AND ps.parent_id = p_target)) THEN RETURN true; END IF;
  -- student with a booking request notifying teachers (matching/broadcast, before any booking exists)
  IF public.has_role(p_caller, 'student'::public.app_role)
     AND public.has_role(p_target, 'teacher'::public.app_role)
     AND v_type ~ '^(booking_request|session_request|instant_session|first_impression|in_person_request)'
     AND EXISTS (SELECT 1 FROM public.booking_requests r WHERE r.student_id = p_caller
                 AND r.created_at > now() - interval '1 day')
  THEN RETURN true; END IF;
  RETURN false;
END
$fn$;
REVOKE ALL ON FUNCTION public.can_notify(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_notify(uuid,uuid,text) TO authenticated, service_role;

DROP POLICY IF EXISTS notifications_insert_own_or_admin ON public.notifications;
CREATE POLICY notifications_insert_checked ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.can_notify(auth.uid(), user_id, type));
COMMIT;
