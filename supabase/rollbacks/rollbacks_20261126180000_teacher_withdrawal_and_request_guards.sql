-- Rollback for 20261126180000_teacher_withdrawal_and_request_guards.sql
DROP TRIGGER IF EXISTS aa_guard_withdrawal_client_insert ON public.withdrawal_requests;
DROP FUNCTION IF EXISTS public.guard_withdrawal_client_insert();
DROP FUNCTION IF EXISTS public.get_request_student_active_subscription(uuid);
CREATE OR REPLACE FUNCTION public.teacher_monthly_cancellations(_teacher_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::int
  FROM public.bookings
  WHERE teacher_id = _teacher_id
    AND status = 'cancelled'
    AND cancelled_by = _teacher_id
    AND cancelled_at >= date_trunc('month', now())
    AND cancelled_at < date_trunc('month', now()) + interval '1 month';
$$;
