CREATE INDEX IF NOT EXISTS idx_assignments_student_status ON public.assignments(student_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON public.assignments(teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_status_null_student ON public.assignments(status) WHERE student_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON public.assignment_submissions(student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON public.assignment_submissions(assignment_id);