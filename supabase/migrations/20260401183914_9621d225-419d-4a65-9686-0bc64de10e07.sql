ALTER TABLE public.teacher_profiles 
ADD COLUMN available_days text[] DEFAULT '{}'::text[];