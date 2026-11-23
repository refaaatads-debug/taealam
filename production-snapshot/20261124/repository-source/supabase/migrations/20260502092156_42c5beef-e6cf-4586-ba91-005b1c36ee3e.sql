-- 1. Assignments table
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  student_id UUID,
  booking_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  subject_id UUID,
  teaching_stage TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_points NUMERIC NOT NULL DEFAULT 100,
  due_date TIMESTAMPTZ,
  allow_text BOOLEAN DEFAULT true,
  allow_image BOOLEAN DEFAULT true,
  allow_audio BOOLEAN DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own assignments" ON public.assignments
  FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Students view assigned assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR student_id IS NULL);

CREATE POLICY "Admins manage all assignments" ON public.assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_assignments_teacher ON public.assignments(teacher_id);
CREATE INDEX idx_assignments_student ON public.assignments(student_id);

-- 2. Assignment submissions
CREATE TABLE public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  text_answer TEXT,
  image_urls JSONB DEFAULT '[]'::jsonb,
  audio_url TEXT,
  answers JSONB DEFAULT '[]'::jsonb,
  ai_score NUMERIC,
  ai_feedback TEXT,
  ai_breakdown JSONB,
  teacher_score NUMERIC,
  teacher_feedback TEXT,
  final_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own submissions" ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Teachers view+update submissions for their assignments" ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND a.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND a.teacher_id = auth.uid()));

CREATE POLICY "Admins manage all submissions" ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_submissions_updated_at
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_submissions_assignment ON public.assignment_submissions(assignment_id);
CREATE INDEX idx_submissions_student ON public.assignment_submissions(student_id);

-- 3. Question bank
CREATE TABLE public.question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  subject_id UUID,
  teaching_stage TEXT,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  options JSONB DEFAULT '[]'::jsonb,
  correct_answer TEXT,
  explanation TEXT,
  difficulty TEXT DEFAULT 'medium',
  points NUMERIC DEFAULT 10,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own questions" ON public.question_bank
  FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers view public questions" ON public.question_bank
  FOR SELECT TO authenticated
  USING (is_public = true OR auth.uid() = teacher_id);

CREATE POLICY "Admins manage all questions" ON public.question_bank
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_question_bank_updated_at
  BEFORE UPDATE ON public.question_bank
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_qb_teacher ON public.question_bank(teacher_id);
CREATE INDEX idx_qb_stage_subject ON public.question_bank(teaching_stage, subject_id);

-- 4. Storage bucket for assignment files
INSERT INTO storage.buckets (id, name, public)
VALUES ('assignment-files', 'assignment-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload assignment files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assignment-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users view own assignment files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'assignment-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Teachers view student submission files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-files' AND
    EXISTS (
      SELECT 1 FROM public.assignment_submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE a.teacher_id = auth.uid()
        AND (storage.foldername(name))[1] = s.student_id::text
    )
  );

CREATE POLICY "Admins manage assignment files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'assignment-files' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'assignment-files' AND has_role(auth.uid(), 'admin'::app_role));