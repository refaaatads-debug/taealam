CREATE OR REPLACE FUNCTION public.cancel_in_person_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(refunded_minutes integer, consumed_minutes integer, teacher_compensation_sar numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
  v_refund integer;
  v_consume integer;
  v_compensation numeric(10,2) := 0;
  v_actor_is_teacher boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this account'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND delivery_mode = 'in_person'
  FOR UPDATE;
  IF NOT FOUND OR v_booking.status::text <> 'confirmed' THEN
    RAISE EXCEPTION 'In-person booking is no longer cancellable' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.attendance_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'A confirmed attendance cannot be cancelled' USING ERRCODE = '42501';
  END IF;

  v_actor_is_teacher := v_actor = v_booking.teacher_id
    AND public.has_role(v_actor, 'teacher'::public.app_role);
  IF NOT v_actor_is_teacher
     AND NOT (v_actor = v_booking.student_id
       AND public.has_role(v_actor, 'student'::public.app_role)) THEN
    RAISE EXCEPTION 'Only the student or assigned teacher can cancel'
      USING ERRCODE = '42501';
  END IF;

  IF now() >= v_booking.scheduled_at + interval '15 minutes' THEN
    RAISE EXCEPTION 'The attendance window has ended; automatic settlement applies'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation
  FROM public.in_person_credit_reservations
  WHERE booking_id = p_booking_id AND status = 'reserved'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The credit reservation is already settled'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_actor_is_teacher THEN
    v_refund := 100;
    v_consume := 0;
  ELSIF v_booking.scheduled_at - now() >= interval '60 minutes' THEN
    v_refund := 100;
    v_consume := 0;
  ELSE
    v_refund := 50;
    v_consume := 50;
    v_compensation := 30;
  END IF;

  UPDATE public.user_subscriptions
  SET remaining_minutes = remaining_minutes + v_refund
  WHERE id = v_reservation.subscription_id;

  UPDATE public.in_person_credit_reservations
  SET status = CASE WHEN v_refund = 100 THEN 'released' ELSE 'partially_settled' END,
      released_minutes = v_refund,
      consumed_minutes = v_consume,
      settled_at = now()
  WHERE id = v_reservation.id;

  UPDATE public.bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = COALESCE(NULLIF(trim(p_reason), ''), 'in_person_cancelled')
  WHERE id = p_booking_id;

  UPDATE public.in_person_request_groups g
  SET status = 'cancelled', updated_at = now()
  FROM public.in_person_credit_reservations r
  WHERE r.id = v_reservation.id
    AND g.id = r.request_group_id;

  UPDATE public.in_person_attendance_codes
  SET invalidated_at = now()
  WHERE booking_id = p_booking_id
    AND confirmed_at IS NULL;

  UPDATE public.in_person_teacher_earnings
  SET status = 'adjusted', amount = 0
  WHERE booking_id = p_booking_id
    AND status = 'pending';

  IF v_compensation > 0 THEN
    INSERT INTO public.in_person_teacher_compensations(
      booking_id, teacher_id, amount, available_at
    )
    VALUES (
      p_booking_id, v_booking.teacher_id, v_compensation,
      v_booking.scheduled_at + interval '60 minutes'
    );
  END IF;

  RETURN QUERY SELECT v_refund, v_consume, v_compensation;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_in_person_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_in_person_booking(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_in_person_deadlines()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_group public.in_person_request_groups%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
  v_processed integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only the service role or an administrator can process deadlines'
      USING ERRCODE = '42501';
  END IF;

  FOR v_group IN
    SELECT * FROM public.in_person_request_groups
    WHERE status = 'open' AND now() >= acceptance_deadline
    ORDER BY acceptance_deadline
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_reservation
    FROM public.in_person_credit_reservations
    WHERE request_group_id = v_group.id AND status = 'reserved'
    FOR UPDATE;
    IF FOUND THEN
      UPDATE public.user_subscriptions
      SET remaining_minutes = remaining_minutes + v_reservation.reserved_minutes
      WHERE id = v_reservation.subscription_id;
      UPDATE public.in_person_credit_reservations
      SET status = 'released', released_minutes = reserved_minutes, settled_at = now()
      WHERE id = v_reservation.id;
    END IF;
    UPDATE public.in_person_request_groups
    SET status = 'expired', updated_at = now()
    WHERE id = v_group.id;
    UPDATE public.in_person_request_recipients
    SET status = 'closed', responded_at = COALESCE(responded_at, now())
    WHERE request_group_id = v_group.id AND status = 'pending';
    v_processed := v_processed + 1;
  END LOOP;

  FOR v_booking IN
    SELECT * FROM public.bookings b
    WHERE b.delivery_mode = 'in_person'
      AND b.status::text = 'confirmed'
      AND b.attendance_confirmed_at IS NULL
      AND now() >= b.scheduled_at + interval '15 minutes'
    ORDER BY b.scheduled_at
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_reservation
    FROM public.in_person_credit_reservations
    WHERE booking_id = v_booking.id AND status = 'reserved'
    FOR UPDATE;
    IF FOUND THEN
      UPDATE public.user_subscriptions
      SET remaining_minutes = remaining_minutes + v_reservation.reserved_minutes
      WHERE id = v_reservation.subscription_id;
      UPDATE public.in_person_credit_reservations
      SET status = 'released', released_minutes = reserved_minutes, settled_at = now()
      WHERE id = v_reservation.id;
    END IF;
    UPDATE public.bookings
    SET status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = 'attendance_window_expired'
    WHERE id = v_booking.id;
    UPDATE public.in_person_request_groups g
    SET status = 'cancelled', updated_at = now()
    FROM public.in_person_credit_reservations r
    WHERE r.booking_id = v_booking.id AND g.id = r.request_group_id;
    UPDATE public.in_person_attendance_codes
    SET invalidated_at = now()
    WHERE booking_id = v_booking.id AND confirmed_at IS NULL;
    UPDATE public.in_person_teacher_earnings
    SET status = 'adjusted', amount = 0
    WHERE booking_id = v_booking.id AND status = 'pending';
    v_processed := v_processed + 1;
  END LOOP;

  UPDATE public.in_person_teacher_earnings
  SET status = 'available'
  WHERE status = 'pending' AND available_at <= now();

  UPDATE public.in_person_teacher_compensations
  SET status = 'available'
  WHERE status = 'pending' AND available_at <= now();

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.process_in_person_deadlines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_in_person_deadlines() TO service_role;
