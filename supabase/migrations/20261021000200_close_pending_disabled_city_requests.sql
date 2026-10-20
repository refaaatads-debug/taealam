-- The new availability flag defaults to off for existing cities as well as
-- new ones. Close any already-open requests in those cities and release
-- their reserved minutes exactly once; confirmed bookings remain untouched.
DO $$
DECLARE
  v_city_id uuid;
  v_group public.in_person_request_groups%ROWTYPE;
  v_reservation public.in_person_credit_reservations%ROWTYPE;
BEGIN
  FOR v_city_id IN
    SELECT id FROM public.cities
    WHERE country_iso2 = 'SA' AND NOT in_person_enabled
    ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('in-person-city:' || v_city_id::text, 0));
    FOR v_group IN
      SELECT * FROM public.in_person_request_groups
      WHERE city_id = v_city_id AND status = 'open'
      ORDER BY id FOR UPDATE
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
        WHERE id = v_reservation.id AND status = 'reserved';
      END IF;
      UPDATE public.in_person_request_groups
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_group.id AND status = 'open';
      UPDATE public.in_person_request_recipients
      SET status = 'closed', responded_at = COALESCE(responded_at, now())
      WHERE request_group_id = v_group.id AND status = 'pending';
    END LOOP;
  END LOOP;
END;
$$;
