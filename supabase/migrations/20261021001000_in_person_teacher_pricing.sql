-- Price configuration remains separate from the online hourly_rate.
-- Historic bookings and existing ledger rows are intentionally untouched.
ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS in_person_default_teacher_rate_sar numeric(10,2)
    NOT NULL DEFAULT 60
    CHECK (in_person_default_teacher_rate_sar BETWEEN 0 AND 100);

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS in_person_teacher_rate_sar numeric(10,2)
    CHECK (in_person_teacher_rate_sar IS NULL OR in_person_teacher_rate_sar BETWEEN 0 AND 100);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS in_person_student_value_sar numeric(10,2),
  ADD COLUMN IF NOT EXISTS in_person_teacher_rate_sar numeric(10,2),
  ADD COLUMN IF NOT EXISTS in_person_platform_share_sar numeric(10,2),
  ADD COLUMN IF NOT EXISTS in_person_teaching_minutes integer,
  ADD COLUMN IF NOT EXISTS in_person_package_minutes integer,
  ADD COLUMN IF NOT EXISTS in_person_pricing_source text;

ALTER TABLE public.in_person_request_recipients
  ADD COLUMN IF NOT EXISTS offered_teacher_rate_sar numeric(10,2),
  ADD COLUMN IF NOT EXISTS offered_platform_share_sar numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_source text;

ALTER TABLE public.in_person_teacher_earnings
  DROP CONSTRAINT IF EXISTS in_person_teacher_earnings_amount_check;
ALTER TABLE public.in_person_teacher_earnings
  ADD CONSTRAINT in_person_teacher_earnings_amount_check CHECK (amount BETWEEN 0 AND 100);

ALTER TABLE public.in_person_teacher_compensations
  DROP CONSTRAINT IF EXISTS in_person_teacher_compensations_amount_check;
ALTER TABLE public.in_person_teacher_compensations
  ADD CONSTRAINT in_person_teacher_compensations_amount_check CHECK (amount BETWEEN 0 AND 50);

ALTER TABLE public.in_person_platform_revenue
  DROP CONSTRAINT IF EXISTS in_person_platform_revenue_amount_check;
ALTER TABLE public.in_person_platform_revenue
  ADD CONSTRAINT in_person_platform_revenue_amount_check CHECK (amount BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS public.in_person_pricing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('default_updated', 'teacher_override_set', 'teacher_override_cleared', 'unified')),
  teacher_id uuid REFERENCES auth.users(id),
  before_data jsonb NOT NULL,
  after_data jsonb NOT NULL
);
ALTER TABLE public.in_person_pricing_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.in_person_pricing_audit FROM PUBLIC, anon, authenticated;
CREATE POLICY in_person_pricing_audit_admin_read
  ON public.in_person_pricing_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT ON public.in_person_pricing_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_in_person_pricing()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_default numeric(10,2);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT in_person_default_teacher_rate_sar INTO v_default
  FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'default_teacher_rate_sar', COALESCE(v_default, 60),
    'student_value_sar', 100,
    'teaching_minutes', 60,
    'package_minutes', 100,
    'teachers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'teacher_id', tp.user_id,
        'full_name', COALESCE(p.full_name, 'معلم'),
        'override_rate_sar', tp.in_person_teacher_rate_sar,
        'effective_rate_sar', COALESCE(tp.in_person_teacher_rate_sar, v_default, 60),
        'pricing_source', CASE WHEN tp.in_person_teacher_rate_sar IS NULL THEN 'default' ELSE 'custom' END
      ) ORDER BY p.full_name)
      FROM public.teacher_profiles tp
      LEFT JOIN public.profiles p ON p.user_id = tp.user_id
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_in_person_pricing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_in_person_pricing() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_in_person_default_rate(p_rate numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_admin uuid := auth.uid(); v_old numeric(10,2);
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'In-person teacher rate must be between 0 and 100 SAR' USING ERRCODE = '22023';
  END IF;
  SELECT in_person_default_teacher_rate_sar INTO v_old
  FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  UPDATE public.financial_settings
  SET in_person_default_teacher_rate_sar = p_rate, updated_at = now(), updated_by = v_admin;
  INSERT INTO public.in_person_pricing_audit(admin_id, action, before_data, after_data)
  VALUES (v_admin, 'default_updated',
    jsonb_build_object('default_teacher_rate_sar', COALESCE(v_old, 60)),
    jsonb_build_object('default_teacher_rate_sar', p_rate, 'student_value_sar', 100));
  RETURN p_rate;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_in_person_default_rate(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_in_person_default_rate(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_teacher_in_person_rate(p_teacher_id uuid, p_rate numeric)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_admin uuid := auth.uid(); v_old numeric(10,2); v_default numeric(10,2);
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_teacher_id IS NULL OR (p_rate IS NOT NULL AND (p_rate < 0 OR p_rate > 100)) THEN
    RAISE EXCEPTION 'Select a teacher and enter a rate from 0 to 100 SAR' USING ERRCODE = '22023';
  END IF;
  SELECT in_person_teacher_rate_sar INTO v_old FROM public.teacher_profiles
  WHERE user_id = p_teacher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teacher profile not found' USING ERRCODE = 'P0002'; END IF;
  SELECT in_person_default_teacher_rate_sar INTO v_default
  FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1;
  UPDATE public.teacher_profiles SET in_person_teacher_rate_sar = p_rate WHERE user_id = p_teacher_id;
  INSERT INTO public.in_person_pricing_audit(admin_id, action, teacher_id, before_data, after_data)
  VALUES (
    v_admin,
    CASE WHEN p_rate IS NULL THEN 'teacher_override_cleared' ELSE 'teacher_override_set' END,
    p_teacher_id,
    jsonb_build_object('override_rate_sar', v_old, 'effective_rate_sar', COALESCE(v_old, v_default, 60)),
    jsonb_build_object('override_rate_sar', p_rate, 'effective_rate_sar', COALESCE(p_rate, v_default, 60))
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_teacher_in_person_rate(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_teacher_in_person_rate(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unify_in_person_teacher_rates(p_rate numeric, p_expected_count integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_admin uuid := auth.uid(); v_old_default numeric(10,2); v_count integer;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'In-person teacher rate must be between 0 and 100 SAR' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_count FROM public.teacher_profiles;
  IF p_expected_count IS DISTINCT FROM v_count THEN
    RAISE EXCEPTION 'Teacher list changed; refresh and confirm again' USING ERRCODE = '40001';
  END IF;
  SELECT in_person_default_teacher_rate_sar INTO v_old_default
  FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  INSERT INTO public.in_person_pricing_audit(admin_id, action, before_data, after_data)
  VALUES (v_admin, 'unified',
    jsonb_build_object('default_teacher_rate_sar', COALESCE(v_old_default, 60)),
    jsonb_build_object('default_teacher_rate_sar', p_rate, 'teachers_affected', v_count));
  INSERT INTO public.in_person_pricing_audit(admin_id, action, teacher_id, before_data, after_data)
  SELECT v_admin, 'unified', tp.user_id,
    jsonb_build_object('override_rate_sar', tp.in_person_teacher_rate_sar,
      'effective_rate_sar', COALESCE(tp.in_person_teacher_rate_sar, v_old_default, 60)),
    jsonb_build_object('override_rate_sar', NULL, 'effective_rate_sar', p_rate)
  FROM public.teacher_profiles tp;
  UPDATE public.teacher_profiles SET in_person_teacher_rate_sar = NULL
  WHERE in_person_teacher_rate_sar IS NOT NULL;
  UPDATE public.financial_settings
  SET in_person_default_teacher_rate_sar = p_rate, updated_at = now(), updated_by = v_admin;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_unify_in_person_teacher_rates(numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unify_in_person_teacher_rates(numeric, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_in_person_recipient_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_override numeric(10,2); v_default numeric(10,2);
BEGIN
  SELECT tp.in_person_teacher_rate_sar, fs.in_person_default_teacher_rate_sar
  INTO v_override, v_default
  FROM public.teacher_profiles tp
  CROSS JOIN LATERAL (
    SELECT in_person_default_teacher_rate_sar
    FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1
  ) fs
  WHERE tp.user_id = NEW.teacher_id;
  NEW.offered_teacher_rate_sar := COALESCE(NEW.offered_teacher_rate_sar, v_override, v_default, 60);
  NEW.offered_platform_share_sar := COALESCE(NEW.offered_platform_share_sar, 100 - NEW.offered_teacher_rate_sar);
  NEW.pricing_source := COALESCE(NEW.pricing_source,
    CASE WHEN v_override IS NULL THEN 'default' ELSE 'custom' END);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_in_person_recipient_offer() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS snapshot_in_person_recipient_offer_trigger ON public.in_person_request_recipients;
CREATE TRIGGER snapshot_in_person_recipient_offer_trigger
BEFORE INSERT ON public.in_person_request_recipients
FOR EACH ROW EXECUTE FUNCTION public.snapshot_in_person_recipient_offer();

-- Freeze offers for currently pending legacy requests once; never rewrite accepted history.
UPDATE public.in_person_request_recipients r
SET offered_teacher_rate_sar = COALESCE(tp.in_person_teacher_rate_sar, fs.in_person_default_teacher_rate_sar, 60),
    offered_platform_share_sar = 100 - COALESCE(tp.in_person_teacher_rate_sar, fs.in_person_default_teacher_rate_sar, 60),
    pricing_source = CASE WHEN tp.in_person_teacher_rate_sar IS NULL THEN 'default' ELSE 'custom' END
FROM public.in_person_request_groups g, public.teacher_profiles tp,
     LATERAL (SELECT in_person_default_teacher_rate_sar FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1) fs
WHERE g.id = r.request_group_id AND g.status = 'open' AND r.status = 'pending'
  AND tp.user_id = r.teacher_id AND r.offered_teacher_rate_sar IS NULL;

CREATE OR REPLACE FUNCTION public.snapshot_in_person_booking_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_offered numeric(10,2); v_source text; v_override numeric(10,2); v_default numeric(10,2);
BEGIN
  IF NEW.delivery_mode IS DISTINCT FROM 'in_person' THEN RETURN NEW; END IF;
  SELECT recipient.offered_teacher_rate_sar, recipient.pricing_source
    INTO v_offered, v_source
  FROM public.in_person_request_groups g
  JOIN public.in_person_request_recipients recipient ON recipient.request_group_id = g.id
  WHERE g.student_id = NEW.student_id AND g.scheduled_at = NEW.scheduled_at
    AND g.status = 'accepted' AND recipient.teacher_id = NEW.teacher_id
    AND recipient.status = 'accepted'
  ORDER BY g.created_at DESC LIMIT 1;
  SELECT in_person_teacher_rate_sar INTO v_override
  FROM public.teacher_profiles WHERE user_id = NEW.teacher_id;
  SELECT in_person_default_teacher_rate_sar INTO v_default
  FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1;

  NEW.in_person_student_value_sar := COALESCE(NEW.in_person_student_value_sar, 100);
  NEW.in_person_teacher_rate_sar := COALESCE(NEW.in_person_teacher_rate_sar, v_offered, v_override, v_default, 60);
  NEW.in_person_platform_share_sar := NEW.in_person_student_value_sar - NEW.in_person_teacher_rate_sar;
  NEW.in_person_teaching_minutes := COALESCE(NEW.in_person_teaching_minutes, 60);
  NEW.in_person_package_minutes := COALESCE(NEW.in_person_package_minutes, 100);
  NEW.in_person_pricing_source := COALESCE(NEW.in_person_pricing_source, v_source,
    CASE WHEN v_override IS NULL THEN 'default' ELSE 'custom' END);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_in_person_booking_price() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS snapshot_in_person_booking_price_trigger ON public.bookings;
CREATE TRIGGER snapshot_in_person_booking_price_trigger
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.snapshot_in_person_booking_price();

CREATE OR REPLACE FUNCTION public.snapshot_in_person_earning_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  SELECT COALESCE(b.in_person_teacher_rate_sar, NEW.amount, 60) INTO NEW.amount
  FROM public.bookings b WHERE b.id = NEW.booking_id AND b.delivery_mode = 'in_person';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_in_person_earning_amount() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS snapshot_in_person_earning_amount_trigger ON public.in_person_teacher_earnings;
CREATE TRIGGER snapshot_in_person_earning_amount_trigger
BEFORE INSERT ON public.in_person_teacher_earnings
FOR EACH ROW EXECUTE FUNCTION public.snapshot_in_person_earning_amount();

CREATE OR REPLACE FUNCTION public.snapshot_in_person_compensation_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_teacher_rate numeric(10,2);
BEGIN
  SELECT COALESCE(b.in_person_teacher_rate_sar, 60) INTO v_teacher_rate
  FROM public.bookings b WHERE b.id = NEW.booking_id AND b.delivery_mode = 'in_person';
  NEW.amount := ROUND(COALESCE(v_teacher_rate, 60) / 2, 2);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_in_person_compensation_amount() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS snapshot_in_person_compensation_amount_trigger ON public.in_person_teacher_compensations;
CREATE TRIGGER snapshot_in_person_compensation_amount_trigger
BEFORE INSERT ON public.in_person_teacher_compensations
FOR EACH ROW EXECUTE FUNCTION public.snapshot_in_person_compensation_amount();

CREATE OR REPLACE FUNCTION public.record_in_person_platform_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_share numeric(10,2);
BEGIN
  SELECT COALESCE(b.in_person_platform_share_sar, 40) INTO v_share
  FROM public.bookings b WHERE b.id = NEW.booking_id;
  IF OLD.status = 'reserved' AND NEW.status = 'consumed' AND NEW.consumed_minutes = 100 THEN
    INSERT INTO public.in_person_platform_revenue(booking_id, event_type, amount)
    VALUES (NEW.booking_id, 'completed_lesson', COALESCE(v_share, 40))
    ON CONFLICT (booking_id, event_type) DO NOTHING;
  ELSIF OLD.status = 'reserved' AND NEW.status = 'partially_settled'
        AND NEW.consumed_minutes = 50 AND NEW.released_minutes = 50 THEN
    INSERT INTO public.in_person_platform_revenue(booking_id, event_type, amount)
    VALUES (NEW.booking_id, 'late_student_cancellation', ROUND(COALESCE(v_share, 40) / 2, 2))
    ON CONFLICT (booking_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_in_person_platform_revenue() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_teacher_in_person_requests_priced()
RETURNS TABLE(
  request_group_id uuid, student_name text, subject_name text, city_name text,
  scheduled_at timestamptz, acceptance_deadline timestamptz,
  offered_teacher_rate_sar numeric, offered_platform_share_sar numeric, pricing_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_teacher_id uuid := auth.uid();
BEGIN
  IF v_teacher_id IS NULL OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT g.id, COALESCE(pp.full_name, 'طالب')::text, COALESCE(s.name, 'مادة')::text,
    c.name_ar, g.scheduled_at, g.acceptance_deadline,
    COALESCE(r.offered_teacher_rate_sar, 60), COALESCE(r.offered_platform_share_sar, 40),
    COALESCE(r.pricing_source, 'default')
  FROM public.in_person_request_recipients r
  JOIN public.in_person_request_groups g ON g.id = r.request_group_id
  JOIN public.cities c ON c.id = g.city_id
  LEFT JOIN public.public_profiles pp ON pp.user_id = g.student_id
  LEFT JOIN public.subjects s ON s.id = g.subject_id
  WHERE r.teacher_id = v_teacher_id AND r.status = 'pending'
    AND g.status = 'open' AND now() < g.acceptance_deadline
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.teacher_id = v_teacher_id AND b.status::text IN ('pending', 'confirmed')
        AND tstzrange(b.scheduled_at - interval '30 minutes',
          b.scheduled_at + make_interval(mins => COALESCE(b.instruction_duration_minutes, b.duration_minutes, 60))
            + interval '30 minutes', '[)')
          && tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests q
      WHERE q.accepted_by = v_teacher_id AND q.status = 'accepted'
        AND tstzrange(q.scheduled_at - interval '30 minutes',
          q.scheduled_at + make_interval(mins => COALESCE(q.duration_minutes, 60))
            + interval '30 minutes', '[)')
          && tstzrange(g.scheduled_at, g.scheduled_at + interval '60 minutes', '[)')
    )
  ORDER BY g.scheduled_at;
END;
$$;
REVOKE ALL ON FUNCTION public.list_teacher_in_person_requests_priced() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teacher_in_person_requests_priced() TO authenticated;
