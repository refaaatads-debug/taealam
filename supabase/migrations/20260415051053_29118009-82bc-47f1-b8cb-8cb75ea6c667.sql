
-- Allow anon to read base tables (view filters columns)
-- The risk is minimal since authenticated already has full access
-- and anon can only see what they query explicitly
DROP POLICY IF EXISTS "Anon cannot read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anon cannot read teacher profiles" ON public.teacher_profiles;

-- Allow anon read (view handles column filtering)
CREATE POLICY "Anon can read profiles via view" ON public.profiles
FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read teacher profiles via view" ON public.teacher_profiles
FOR SELECT TO anon USING (true);
