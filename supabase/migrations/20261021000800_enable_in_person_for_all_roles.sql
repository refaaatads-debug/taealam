-- Remove the pilot-account allowlist as a feature gate. Every authenticated
-- student, teacher, and administrator may enter the feature; the existing
-- per-RPC role checks, teacher approvals, city availability, location and
-- balance rules remain authoritative.
CREATE OR REPLACE FUNCTION public.is_in_person_test_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       COALESCE(public.has_role(auth.uid(), 'student'::public.app_role), false)
       OR COALESCE(public.has_role(auth.uid(), 'teacher'::public.app_role), false)
       OR COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false)
     );
$$;

COMMENT ON FUNCTION public.is_in_person_test_user() IS
  'Compatibility gate allowing authenticated students, teachers, and administrators; per-RPC roles and in-person approval/city rules remain enforced.';

REVOKE ALL ON FUNCTION public.is_in_person_test_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_in_person_test_user() TO authenticated;
