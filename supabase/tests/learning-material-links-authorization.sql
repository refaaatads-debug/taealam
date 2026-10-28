BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
  ('ba280000-0000-4000-8000-000000000051', 'authenticated', 'authenticated', 'materials-teacher@example.invalid', now(), now()),
  ('ba280000-0000-4000-8000-000000000052', 'authenticated', 'authenticated', 'materials-admin@example.invalid', now(), now()),
  ('ba280000-0000-4000-8000-000000000053', 'authenticated', 'authenticated', 'materials-student@example.invalid', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('ba280000-0000-4000-8000-000000000051', 'teacher'),
  ('ba280000-0000-4000-8000-000000000052', 'admin'),
  ('ba280000-0000-4000-8000-000000000053', 'student')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.learning_material_links (id, name, description, url, is_active, sort_order)
VALUES
  ('ba280000-0000-4000-8000-000000000054', 'اختبار نشط', 'رابط اختبار ظاهر للمعلم.', 'https://active.example.invalid/', true, 100),
  ('ba280000-0000-4000-8000-000000000055', 'اختبار مخفي', 'رابط اختبار مخفي عن المعلم.', 'https://inactive.example.invalid/', false, 101)
ON CONFLICT (id) DO NOTHING;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_material_links TO authenticated;
REVOKE ALL ON public.learning_material_links FROM anon, PUBLIC;

SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.learning_material_links', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous users must not read learning materials';
  END IF;
END
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'ba280000-0000-4000-8000-000000000051', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  affected integer;
  denied boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.learning_material_links WHERE id = 'ba280000-0000-4000-8000-000000000054') THEN
    RAISE EXCEPTION 'Teacher cannot read active learning material';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_material_links WHERE id = 'ba280000-0000-4000-8000-000000000055') THEN
    RAISE EXCEPTION 'Teacher can read an inactive learning material';
  END IF;

  BEGIN
    INSERT INTO public.learning_material_links (name, description, url)
    VALUES ('غير مصرح', 'يجب رفض هذا الإدخال.', 'https://denied.example.invalid/');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Teacher can insert learning materials'; END IF;

  UPDATE public.learning_material_links SET description = 'تعديل غير مصرح'
  WHERE id = 'ba280000-0000-4000-8000-000000000054';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Teacher can update learning materials'; END IF;

  DELETE FROM public.learning_material_links WHERE id = 'ba280000-0000-4000-8000-000000000054';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Teacher can delete learning materials'; END IF;
END
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'ba280000-0000-4000-8000-000000000053', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.learning_material_links) THEN
    RAISE EXCEPTION 'Non-teacher user can read learning materials';
  END IF;
END
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'ba280000-0000-4000-8000-000000000052', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.learning_material_links WHERE id = 'ba280000-0000-4000-8000-000000000055') THEN
    RAISE EXCEPTION 'Admin cannot read inactive learning material';
  END IF;

  UPDATE public.learning_material_links SET description = 'تعديل إداري مصرح'
  WHERE id = 'ba280000-0000-4000-8000-000000000054';
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin cannot update learning materials'; END IF;

  INSERT INTO public.learning_material_links (name, description, url)
  VALUES ('إضافة إدارية', 'إضافة اختبارية.', 'https://admin-add.example.invalid/')
  RETURNING id INTO new_id;
  DELETE FROM public.learning_material_links WHERE id = new_id;
END
$$;
RESET ROLE;

ROLLBACK;
