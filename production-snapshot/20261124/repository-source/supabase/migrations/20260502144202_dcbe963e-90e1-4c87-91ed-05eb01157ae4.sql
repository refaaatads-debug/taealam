REVOKE EXECUTE ON FUNCTION public.auto_expire_stale_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_expire_stale_bookings() TO service_role;