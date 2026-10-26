-- Admin-selected in-person teaching duration is also the exact package debit.
-- Values are snapshotted on request and booking; existing rows are untouched.
ALTER TABLE public.financial_settings
  DROP CONSTRAINT IF EXISTS financial_settings_in_person_instruction_duration_minutes_check,
  ADD CONSTRAINT financial_settings_in_person_instruction_duration_minutes_check
    CHECK (in_person_instruction_duration_minutes BETWEEN 15 AND 180);

ALTER TABLE public.in_person_request_groups
  DROP CONSTRAINT IF EXISTS in_person_request_groups_instruction_duration_minutes_check,
  ADD CONSTRAINT in_person_request_groups_instruction_duration_minutes_check
    CHECK (instruction_duration_minutes BETWEEN 15 AND 180);

ALTER TABLE public.in_person_credit_reservations
  DROP CONSTRAINT IF EXISTS in_person_credit_reservations_reserved_minutes_check,
  DROP CONSTRAINT IF EXISTS in_person_credit_reservations_consumed_minutes_check,
  DROP CONSTRAINT IF EXISTS in_person_credit_reservations_released_minutes_check,
  ADD CONSTRAINT in_person_credit_reservations_reserved_minutes_check CHECK (reserved_minutes BETWEEN 0 AND 180),
  ADD CONSTRAINT in_person_credit_reservations_consumed_minutes_check CHECK (consumed_minutes BETWEEN 0 AND 180),
  ADD CONSTRAINT in_person_credit_reservations_released_minutes_check CHECK (released_minutes BETWEEN 0 AND 180);

DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  -- Preserve an explicit request snapshot; otherwise use current admin policy.
  v_definition := pg_get_functiondef('public.snapshot_in_person_request_duration()'::regprocedure);
  v_updated := replace(v_definition,
    'NEW.instruction_duration_minutes := public.get_in_person_instruction_duration();',
    'NEW.instruction_duration_minutes := COALESCE(NEW.instruction_duration_minutes, public.get_in_person_instruction_duration());');
  v_updated := replace(v_updated, 'NEW.instruction_duration_minutes NOT IN (45, 60)',
    'NEW.instruction_duration_minutes NOT BETWEEN 15 AND 180');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update in-person request duration snapshot';
  END IF;
  EXECUTE v_updated;

  -- New requests reserve exactly the duration captured by their request row.
  v_definition := pg_get_functiondef(
    'public.create_in_person_request(uuid,timestamptz,uuid,uuid,uuid[],text)'::regprocedure
  );
  v_updated := replace(v_definition,
    '  v_teacher_count integer;',
    '  v_teacher_count integer;
  v_duration integer;');
  v_updated := replace(v_updated,
    '  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 16 THEN',
    '  v_duration := public.get_in_person_instruction_duration();

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 16 THEN');
  v_updated := replace(v_updated, 'AND s.remaining_minutes >= 100', 'AND s.remaining_minutes >= v_duration');
  v_updated := replace(v_updated, 'p_scheduled_at + interval ''60 minutes'', ''[)'')',
    'p_scheduled_at + make_interval(mins => v_duration), ''[)'')');
  v_updated := replace(v_updated,
    'visit_address_snapshot, acceptance_deadline
  )
  VALUES (',
    'visit_address_snapshot, acceptance_deadline, instruction_duration_minutes
  )
  VALUES (');
  v_updated := replace(v_updated,
    '    p_scheduled_at - interval ''60 minutes''
  )',
    '    p_scheduled_at - interval ''60 minutes'', v_duration
  )');
  v_updated := replace(v_updated, 'remaining_minutes = remaining_minutes - 100',
    'remaining_minutes = remaining_minutes - v_duration');
  v_updated := replace(v_updated, 'AND remaining_minutes >= 100', 'AND remaining_minutes >= v_duration');
  v_updated := replace(v_updated, 'v_subscription_id, 100, p_idempotency_key',
    'v_subscription_id, v_duration, p_idempotency_key');
  IF v_updated = v_definition OR position('remaining_minutes - 100' IN v_updated) > 0
     OR position('v_subscription_id, 100, p_idempotency_key' IN v_updated) > 0 THEN
    RAISE EXCEPTION 'Could not bind new in-person reservation amount to duration';
  END IF;
  EXECUTE v_updated;

  -- Acceptance locks to the request/reservation snapshots, not later settings.
  v_definition := pg_get_functiondef('public.accept_in_person_request(uuid)'::regprocedure);
  v_updated := replace(v_definition, '  v_booking_id uuid;',
    '  v_booking_id uuid;
  v_duration integer;');
  v_updated := replace(v_updated,
    '  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE id = v_city_id AND in_person_enabled) THEN',
    '  v_duration := v_group.instruction_duration_minutes;
  IF v_duration NOT BETWEEN 15 AND 180 THEN
    RAISE EXCEPTION ''Saved in-person duration is invalid'' USING ERRCODE = ''22023'';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE id = v_city_id AND in_person_enabled) THEN');
  v_updated := replace(v_updated,
    'v_group.scheduled_at + interval ''60 minutes'', ''[)'')',
    'v_group.scheduled_at + make_interval(mins => v_duration), ''[)'')');
  v_updated := replace(v_updated,
    'v_group.student_id, v_teacher_id, v_group.subject_id, v_group.scheduled_at, 60,
     ''confirmed'', 0, true, v_reservation.subscription_id, ''in_person'', 60, 100,',
    'v_group.student_id, v_teacher_id, v_group.subject_id, v_group.scheduled_at, v_duration,
     ''confirmed'', 0, true, v_reservation.subscription_id, ''in_person'', v_duration, v_reservation.reserved_minutes,');
  v_updated := replace(v_updated, 'v_group.scheduled_at + interval ''60 minutes'');',
    'v_group.scheduled_at + make_interval(mins => v_duration));');
  IF v_updated = v_definition OR position('''in_person'', 60, 100' IN v_updated) > 0 THEN
    RAISE EXCEPTION 'Could not update in-person acceptance snapshots';
  END IF;
  EXECUTE v_updated;

  -- The same teaching duration applies in matching the teacher availability.
  v_definition := pg_get_functiondef('public.guard_in_person_recipient_availability()'::regprocedure);
  v_updated := replace(v_definition,
    'g.scheduled_at + interval ''60 minutes''',
    'g.scheduled_at + make_interval(mins => g.instruction_duration_minutes)');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update in-person availability duration';
  END IF;
  EXECUTE v_updated;

  -- Allow configured duration values in the saved booking and attendance flow.
  v_definition := pg_get_functiondef('public.snapshot_booking_financial_inputs()'::regprocedure);
  v_updated := replace(v_definition, 'NEW.instruction_duration_minutes NOT IN (45, 60)',
    'NEW.instruction_duration_minutes NOT BETWEEN 15 AND 180');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update booking duration validation';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.snapshot_in_person_booking_price()'::regprocedure);
  v_updated := replace(v_definition, 'NEW.in_person_teaching_minutes NOT IN (45, 60)',
    'NEW.in_person_teaching_minutes NOT BETWEEN 15 AND 180');
  v_updated := replace(v_updated,
    'NEW.in_person_package_minutes := COALESCE(NEW.in_person_package_minutes, 100);',
    'NEW.in_person_package_minutes := COALESCE(NEW.in_person_package_minutes, NEW.in_person_teaching_minutes);');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update booking snapshot duration validation';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.confirm_in_person_attendance_code(uuid,text)'::regprocedure);
  v_updated := replace(v_definition, 'v_reservation.reserved_minutes <> 100',
    'v_reservation.reserved_minutes <> v_booking.in_person_package_minutes');
  v_updated := replace(v_updated, 'v_duration NOT IN (45, 60)', 'v_duration NOT BETWEEN 15 AND 180');
  v_updated := replace(v_updated, 'consumed_minutes = 100',
    'consumed_minutes = v_reservation.reserved_minutes');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update attendance settlement amount';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.process_in_person_session_completions()'::regprocedure);
  v_updated := replace(v_definition,
    'COALESCE(b.instruction_duration_minutes, b.duration_minutes) IN (45, 60)',
    'COALESCE(b.instruction_duration_minutes, b.duration_minutes) BETWEEN 15 AND 180');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update completion duration validation';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.guard_in_person_teacher_earning_release()'::regprocedure);
  v_updated := replace(v_definition,
    'COALESCE(b.instruction_duration_minutes, b.duration_minutes) IN (45, 60)',
    'COALESCE(b.instruction_duration_minutes, b.duration_minutes) BETWEEN 15 AND 180');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update earning release duration validation';
  END IF;
  EXECUTE v_updated;

  v_definition := pg_get_functiondef('public.record_in_person_platform_revenue()'::regprocedure);
  v_updated := replace(v_definition, 'NEW.consumed_minutes = 100',
    'NEW.consumed_minutes = NEW.reserved_minutes');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not update completion revenue gate';
  END IF;
  EXECUTE v_updated;
END;
$migration$;
