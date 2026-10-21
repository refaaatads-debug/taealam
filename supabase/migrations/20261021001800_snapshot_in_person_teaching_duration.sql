-- Keep the booked teaching duration (45/60) separate from the 100-minute
-- subscription reservation. Existing bookings and financial rows are untouched.
CREATE OR REPLACE FUNCTION public.snapshot_in_person_booking_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_offered numeric(10,2);
  v_source text;
  v_override numeric(10,2);
  v_default numeric(10,2);
BEGIN
  IF NEW.delivery_mode IS DISTINCT FROM 'in_person' THEN
    RETURN NEW;
  END IF;

  SELECT recipient.offered_teacher_rate_sar, recipient.pricing_source
    INTO v_offered, v_source
  FROM public.in_person_request_groups g
  JOIN public.in_person_request_recipients recipient
    ON recipient.request_group_id = g.id
  WHERE g.student_id = NEW.student_id
    AND g.scheduled_at = NEW.scheduled_at
    AND g.status = 'accepted'
    AND recipient.teacher_id = NEW.teacher_id
    AND recipient.status = 'accepted'
  ORDER BY g.created_at DESC
  LIMIT 1;

  SELECT in_person_teacher_rate_sar INTO v_override
  FROM public.teacher_profiles WHERE user_id = NEW.teacher_id;
  SELECT in_person_default_teacher_rate_sar INTO v_default
  FROM public.financial_settings ORDER BY updated_at DESC LIMIT 1;

  NEW.in_person_student_value_sar := COALESCE(NEW.in_person_student_value_sar, 100);
  NEW.in_person_teacher_rate_sar := COALESCE(
    NEW.in_person_teacher_rate_sar, v_offered, v_override, v_default, 60
  );
  NEW.in_person_platform_share_sar :=
    NEW.in_person_student_value_sar - NEW.in_person_teacher_rate_sar;
  NEW.in_person_teaching_minutes := COALESCE(
    NEW.in_person_teaching_minutes,
    NEW.instruction_duration_minutes,
    NEW.duration_minutes,
    60
  );
  IF NEW.in_person_teaching_minutes NOT IN (45, 60) THEN
    RAISE EXCEPTION 'Saved in-person teaching duration must be 45 or 60 minutes'
      USING ERRCODE = '22023';
  END IF;
  NEW.in_person_package_minutes := COALESCE(NEW.in_person_package_minutes, 100);
  NEW.in_person_pricing_source := COALESCE(
    NEW.in_person_pricing_source,
    v_source,
    CASE WHEN v_override IS NULL THEN 'default' ELSE 'custom' END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_in_person_booking_price()
  FROM PUBLIC, anon, authenticated;
