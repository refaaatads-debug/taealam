
-- Add payment details to teacher_profiles
ALTER TABLE public.teacher_profiles
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS iban text,
ADD COLUMN IF NOT EXISTS account_holder_name text;

-- Create teacher_certificates table
CREATE TABLE public.teacher_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own certificates"
ON public.teacher_certificates FOR SELECT
USING (
  teacher_id IN (SELECT user_id FROM public.teacher_profiles WHERE user_id = auth.uid())
  OR teacher_id = auth.uid()
);

CREATE POLICY "Teachers can insert own certificates"
ON public.teacher_certificates FOR INSERT
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own certificates"
ON public.teacher_certificates FOR DELETE
USING (teacher_id = auth.uid());

CREATE POLICY "Admins can manage certificates"
ON public.teacher_certificates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));
