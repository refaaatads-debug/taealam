-- Distinguish teachers waiting for review from teachers whose application was rejected.
ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';

UPDATE public.teacher_profiles
SET approval_status = CASE WHEN is_approved IS TRUE THEN 'approved' ELSE 'pending' END
WHERE approval_status IS NULL OR approval_status = 'pending';

ALTER TABLE public.teacher_profiles
  DROP CONSTRAINT IF EXISTS teacher_profiles_approval_status_check;

ALTER TABLE public.teacher_profiles
  ADD CONSTRAINT teacher_profiles_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));
