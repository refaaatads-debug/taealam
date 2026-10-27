BEGIN;

-- Keep the priced teacher request list aligned with each request's saved teaching duration.
DO $migration$
DECLARE
  v_definition text;
  v_updated text;
  v_old text := 'g.scheduled_at + interval ''60 minutes''';
  v_new text := 'g.scheduled_at + make_interval(mins => COALESCE(g.instruction_duration_minutes, 60))';
  v_matches integer;
BEGIN
  v_definition := pg_get_functiondef('public.list_teacher_in_person_requests_priced()'::regprocedure);
  v_matches := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  IF v_matches <> 2 THEN
    RAISE EXCEPTION 'Expected two fixed-duration conflict windows, found %', v_matches;
  END IF;
  v_updated := replace(v_definition, v_old, v_new);
  EXECUTE v_updated;
END;
$migration$;

COMMIT;
