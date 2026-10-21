-- In-person requests remain open for one hour after submission, but never
-- beyond the existing cutoff one hour before the scheduled lesson.
ALTER TABLE public.in_person_request_groups
  DROP CONSTRAINT IF EXISTS in_person_request_groups_approved_acceptance_cutoff_check;

UPDATE public.in_person_request_groups
SET acceptance_deadline = LEAST(
      acceptance_deadline,
      created_at + interval '60 minutes',
      scheduled_at - interval '60 minutes'
    ),
    updated_at = now()
WHERE status = 'open';

-- Apply the shorter window to existing open requests. Expire only requests
-- whose reservation is still reserved; this makes credit release idempotent.
DO $$
DECLARE
  v_group record;
  v_reservation record;
BEGIN
  FOR v_group IN
    SELECT id
    FROM public.in_person_request_groups
    WHERE status = 'open'
      AND acceptance_deadline <= now()
    ORDER BY id
    FOR UPDATE
  LOOP
    UPDATE public.in_person_request_groups
    SET status = 'expired', updated_at = now()
    WHERE id = v_group.id
      AND status = 'open'
      AND acceptance_deadline <= now();

    IF FOUND THEN
      SELECT id, subscription_id, reserved_minutes
      INTO v_reservation
      FROM public.in_person_credit_reservations
      WHERE request_group_id = v_group.id
        AND status = 'reserved'
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.user_subscriptions
        SET remaining_minutes = remaining_minutes + v_reservation.reserved_minutes
        WHERE id = v_reservation.subscription_id;

        UPDATE public.in_person_credit_reservations
        SET status = 'released',
            released_minutes = reserved_minutes,
            settled_at = now()
        WHERE id = v_reservation.id
          AND status = 'reserved';
      END IF;

      UPDATE public.in_person_request_recipients
      SET status = 'closed', responded_at = COALESCE(responded_at, now())
      WHERE request_group_id = v_group.id
        AND status = 'pending';
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.in_person_request_groups
  ADD CONSTRAINT in_person_request_groups_acceptance_before_lesson_check
  CHECK (acceptance_deadline <= scheduled_at - interval '60 minutes');

CREATE OR REPLACE FUNCTION public.set_in_person_request_acceptance_deadline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.acceptance_deadline := LEAST(
    NEW.created_at + interval '60 minutes',
    NEW.scheduled_at - interval '60 minutes'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_in_person_request_acceptance_deadline()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_in_person_request_acceptance_deadline_trigger
  ON public.in_person_request_groups;
CREATE TRIGGER set_in_person_request_acceptance_deadline_trigger
  BEFORE INSERT OR UPDATE OF created_at, scheduled_at
  ON public.in_person_request_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_in_person_request_acceptance_deadline();
