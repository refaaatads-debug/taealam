-- Restore the explicitly approved one-hour acceptance cutoff after f6c8bf3
-- accidentally removed its enforcement.
DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.in_person_request_groups'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%acceptance_deadline%'
      AND pg_get_constraintdef(oid) ILIKE '%scheduled_at%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.in_person_request_groups DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

UPDATE public.in_person_request_groups
SET acceptance_deadline = scheduled_at - interval '60 minutes'
WHERE acceptance_deadline IS NULL;

ALTER TABLE public.in_person_request_groups
  ALTER COLUMN acceptance_deadline SET NOT NULL;

ALTER TABLE public.in_person_request_groups
  ADD CONSTRAINT in_person_request_groups_approved_acceptance_cutoff_check
  CHECK (acceptance_deadline = scheduled_at - interval '60 minutes');

COMMENT ON COLUMN public.in_person_request_groups.acceptance_deadline IS
  'Teacher acceptance closes exactly 60 minutes before scheduled_at; unaccepted requests are then expired and the reserved credit released.';
