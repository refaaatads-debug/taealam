CREATE TABLE IF NOT EXISTS public.in_person_platform_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  event_type text NOT NULL CHECK (event_type IN ('completed_lesson', 'late_student_cancellation')),
  amount numeric(10,2) NOT NULL CHECK (amount IN (20, 40)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, event_type)
);
ALTER TABLE public.in_person_platform_revenue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.in_person_platform_revenue FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_in_person_platform_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'reserved' AND NEW.status = 'consumed' AND NEW.consumed_minutes = 100 THEN
    INSERT INTO public.in_person_platform_revenue(booking_id, event_type, amount)
    VALUES (NEW.booking_id, 'completed_lesson', 40)
    ON CONFLICT (booking_id, event_type) DO NOTHING;
  ELSIF OLD.status = 'reserved' AND NEW.status = 'partially_settled'
        AND NEW.consumed_minutes = 50 AND NEW.released_minutes = 50 THEN
    INSERT INTO public.in_person_platform_revenue(booking_id, event_type, amount)
    VALUES (NEW.booking_id, 'late_student_cancellation', 20)
    ON CONFLICT (booking_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_in_person_platform_revenue_trigger
  ON public.in_person_credit_reservations;
CREATE TRIGGER record_in_person_platform_revenue_trigger
  AFTER UPDATE OF status ON public.in_person_credit_reservations
  FOR EACH ROW EXECUTE FUNCTION public.record_in_person_platform_revenue();

CREATE OR REPLACE FUNCTION public.list_my_in_person_teacher_earnings()
RETURNS TABLE(booking_id uuid, amount numeric, status text, available_at timestamptz, scheduled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT earnings.booking_id, earnings.amount, earnings.status,
         earnings.available_at, earnings.scheduled_at
  FROM (
    SELECT e.booking_id, e.amount, e.status, e.available_at, b.scheduled_at
    FROM public.in_person_teacher_earnings e
    JOIN public.bookings b ON b.id = e.booking_id
    WHERE e.teacher_id = auth.uid() AND e.amount > 0
    UNION ALL
    SELECT c.booking_id, c.amount, c.status, c.available_at, b.scheduled_at
    FROM public.in_person_teacher_compensations c
    JOIN public.bookings b ON b.id = c.booking_id
    WHERE c.teacher_id = auth.uid()
  ) earnings
  ORDER BY earnings.scheduled_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_in_person_teacher_earnings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_in_person_teacher_earnings() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_in_person_financials();
CREATE FUNCTION public.admin_list_in_person_financials()
RETURNS TABLE(
  booking_id uuid,
  teacher_id uuid,
  scheduled_at timestamptz,
  teacher_earning numeric,
  teacher_earning_status text,
  teacher_compensation numeric,
  compensation_status text,
  platform_revenue numeric,
  revenue_events integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.id, b.teacher_id, b.scheduled_at,
         COALESCE(e.amount, 0), e.status,
         COALESCE(c.amount, 0), c.status,
         COALESCE(r.amount, 0), COALESCE(r.event_count, 0)
  FROM public.bookings b
  LEFT JOIN public.in_person_teacher_earnings e ON e.booking_id = b.id
  LEFT JOIN (
    SELECT revenue.booking_id, sum(revenue.amount)::numeric AS amount, count(*)::integer AS event_count
    FROM public.in_person_platform_revenue revenue GROUP BY revenue.booking_id
  ) r ON r.booking_id = b.id
  LEFT JOIN (
    SELECT compensation.booking_id, sum(compensation.amount)::numeric AS amount, max(compensation.status::text) AS status
    FROM public.in_person_teacher_compensations compensation GROUP BY compensation.booking_id
  ) c ON c.booking_id = b.id
  WHERE b.delivery_mode = 'in_person'
  ORDER BY b.scheduled_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_in_person_financials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_in_person_financials() TO authenticated;
