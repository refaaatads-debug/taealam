REVOKE ALL ON FUNCTION public.validate_booking_request_against_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_booking_request_against_balance() FROM anon;
REVOKE ALL ON FUNCTION public.validate_booking_request_against_balance() FROM authenticated;