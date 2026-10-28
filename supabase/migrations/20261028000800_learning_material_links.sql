BEGIN;

CREATE TABLE public.learning_material_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  url text NOT NULL UNIQUE CHECK (
    char_length(url) <= 2048
    AND url ~ '^https://[^[:space:]]+$'
  ),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_material_links_active_order_idx
  ON public.learning_material_links (is_active, sort_order, created_at);

ALTER TABLE public.learning_material_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.learning_material_links FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_material_links TO authenticated;
GRANT ALL ON public.learning_material_links TO service_role;

CREATE POLICY "Teachers and admins can read learning materials"
  ON public.learning_material_links
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      is_active
      AND public.has_role(auth.uid(), 'teacher'::public.app_role)
    )
  );

CREATE POLICY "Admins can manage learning materials"
  ON public.learning_material_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.learning_material_links (name, description, url, sort_order)
VALUES
  ('الكتب المدرسية - منهجي', 'رابط الكتب والمواد الدراسية عبر منصة منهجي.', 'https://www.mnhaji.com/fsl2/', 1),
  ('الكتب المدرسية - سلس', 'رابط الكتب والمواد الدراسية عبر منصة سلس.', 'https://salisedu.com/', 2),
  ('الكتب المدرسية - كتبي', 'رابط الكتب والمواد الدراسية عبر منصة كتبي.', 'https://ktbbysa.com/', 3),
  ('الكتب المدرسية - بداية', 'رابط الكتب والمواد الدراسية عبر منصة بداية.', 'https://beadaya.com/section/124/', 4)
ON CONFLICT (url) DO NOTHING;

COMMIT;
