CREATE OR REPLACE FUNCTION public.accept_booking_request(
  _request_id uuid,
  _teacher_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.booking_requests
  SET status = 'accepted',
      accepted_by = _teacher_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = _request_id
    AND status = 'open';

  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN _updated > 0;
END;
$$;