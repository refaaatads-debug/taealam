-- Separate educational content into homework and quizzes.
-- Existing records remain homework for backwards compatibility.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'assignment';

UPDATE public.assignments
SET content_type = 'assignment'
WHERE content_type IS NULL OR content_type NOT IN ('assignment', 'quiz');

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_content_type_check;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_content_type_check
  CHECK (content_type IN ('assignment', 'quiz'));

CREATE INDEX IF NOT EXISTS idx_assignments_content_type
  ON public.assignments(teacher_id, content_type, created_at DESC);