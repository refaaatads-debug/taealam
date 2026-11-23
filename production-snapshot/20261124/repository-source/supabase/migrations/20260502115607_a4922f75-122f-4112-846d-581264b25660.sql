ALTER TABLE public.featured_teachers
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS subject_label TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC,
  ADD COLUMN IF NOT EXISTS hide_price BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS students_count INTEGER,
  ADD COLUMN IF NOT EXISTS sessions_count INTEGER,
  ADD COLUMN IF NOT EXISTS rating_override NUMERIC;

INSERT INTO storage.buckets (id, name, public)
VALUES ('featured-teachers', 'featured-teachers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view featured teacher images"
ON storage.objects FOR SELECT
USING (bucket_id = 'featured-teachers');

CREATE POLICY "Admins can upload featured teacher images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'featured-teachers' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update featured teacher images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'featured-teachers' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete featured teacher images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'featured-teachers' AND public.has_role(auth.uid(), 'admin'::app_role));