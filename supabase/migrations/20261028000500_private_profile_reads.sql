BEGIN;

-- Explicit, read-only projections are the public API. Their owner performs the
-- underlying read; callers never need a permissive policy on the private tables.
ALTER VIEW public.public_profiles OWNER TO postgres;
ALTER VIEW public.public_teacher_profiles OWNER TO postgres;
ALTER VIEW public.public_profiles SET (security_invoker=false, security_barrier=true);
ALTER VIEW public.public_teacher_profiles SET (security_invoker=false, security_barrier=true);
REVOKE ALL ON public.public_profiles, public.public_teacher_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_profiles, public.public_teacher_profiles TO anon, authenticated, service_role;

-- The restrictive table policies are a separate, intentionally held migration:
-- mobile clients must receive these compatible read adapters before cutover.

CREATE OR REPLACE FUNCTION public.get_booking_contact(
  p_user_id uuid,
  p_booking_id uuid DEFAULT NULL
) RETURNS TABLE (user_id uuid, phone text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF caller <> p_user_id AND NOT public.has_role(caller, 'admin'::public.app_role)
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.teacher_id=caller AND b.student_id=p_user_id
        AND b.status IN ('confirmed', 'completed')
        AND (p_booking_id IS NULL OR b.id=p_booking_id)
    )
  THEN
    RAISE EXCEPTION 'Contact access denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT p.user_id, p.phone FROM public.profiles p WHERE p.user_id=p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_booking_contact(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_contact(uuid,uuid) TO authenticated;

COMMIT;
