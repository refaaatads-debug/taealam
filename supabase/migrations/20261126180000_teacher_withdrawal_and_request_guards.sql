-- PREVIEW ONLY. Not applied. Apply manually in one transaction after a backup.
-- Three small guards, no table or column changes. Rollback: rollbacks_20261126180000_teacher_withdrawal_and_request_guards.sql

-- 1) Withdrawals: a teacher inserting directly through the API can no longer pick the status.
--    Non-admin client inserts are forced to 'pending' with all approval/payment fields cleared.
CREATE OR REPLACE FUNCTION public.guard_withdrawal_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_permission(auth.uid(), 'manage_withdrawals'::public.app_permission)
     ) THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
  NEW.approved_at := NULL;
  NEW.approved_by := NULL;
  NEW.processing_at := NULL;
  NEW.paid_at := NULL;
  NEW.paid_by := NULL;
  NEW.admin_notes := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_guard_withdrawal_client_insert ON public.withdrawal_requests;
CREATE TRIGGER aa_guard_withdrawal_client_insert
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_client_insert();

-- 2) Monthly cancellation count: only the teacher themself or an admin can read it.
CREATE OR REPLACE FUNCTION public.teacher_monthly_cancellations(_teacher_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR (auth.uid() IS DISTINCT FROM _teacher_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role))
    THEN 0
    ELSE (
      SELECT COUNT(*)::int
      FROM public.bookings
      WHERE teacher_id = _teacher_id
        AND status = 'cancelled'
        AND cancelled_by = _teacher_id
        AND cancelled_at >= date_trunc('month', now())
        AND cancelled_at < date_trunc('month', now()) + interval '1 month'
    )
  END;
$$;

-- 3) A teacher cannot read a first-time student's subscription (RLS needs an earlier booking),
--    so the accept-request balance check could not work for new students.
--    This function returns only the id and minutes of the student's active plan, and only to a
--    teacher who has an open request from that student, or accepted one.
CREATE OR REPLACE FUNCTION public.get_request_student_active_subscription(_student_id uuid)
RETURNS TABLE (id uuid, remaining_minutes integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.booking_requests r
       WHERE r.student_id = _student_id
         AND (r.status = 'open' OR r.accepted_by = auth.uid())
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT s.id, s.remaining_minutes::integer
    FROM public.user_subscriptions s
    WHERE s.user_id = _student_id AND s.is_active = true AND s.remaining_minutes >= 15
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_request_student_active_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_request_student_active_subscription(uuid) TO authenticated;
