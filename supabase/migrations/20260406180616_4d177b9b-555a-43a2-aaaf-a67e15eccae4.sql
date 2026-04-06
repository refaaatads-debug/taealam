
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS teacher_notes TEXT,
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT;
