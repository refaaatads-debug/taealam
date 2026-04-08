
ALTER TABLE public.teacher_earnings 
ADD COLUMN status text NOT NULL DEFAULT 'confirmed' 
CHECK (status IN ('confirmed', 'unconfirmed', 'in_progress'));
