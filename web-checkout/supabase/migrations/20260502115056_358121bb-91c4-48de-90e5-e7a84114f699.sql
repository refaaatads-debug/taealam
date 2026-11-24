CREATE TABLE IF NOT EXISTS public.featured_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_label TEXT DEFAULT 'مدرس مميز',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id)
);

ALTER TABLE public.featured_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active featured teachers"
ON public.featured_teachers FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage featured teachers"
ON public.featured_teachers FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_featured_teachers_updated_at
BEFORE UPDATE ON public.featured_teachers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_featured_teachers_order ON public.featured_teachers(is_active, display_order);