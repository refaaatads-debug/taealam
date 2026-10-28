-- RELEASE GATE: apply only AFTER the compatible mobile build has been released
-- and supported clients no longer depend on cross-user private-table reads.
-- Intentionally absent from scripts/security-migrations.list until that gate.
BEGIN;
DROP POLICY IF EXISTS "Anon can read profiles via view" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anon can read teacher profiles via view" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Authenticated can read teacher profiles via view" ON public.teacher_profiles;
CREATE POLICY "Owners can read private profiles" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- Preserve administrator and authorized teacher-management policies.
COMMIT;
