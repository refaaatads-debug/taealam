
-- Add hours column to teacher_earnings
ALTER TABLE public.teacher_earnings ADD COLUMN IF NOT EXISTS hours numeric DEFAULT 0;

-- Prevent duplicate earnings for same teacher+month
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_earnings_unique_period 
ON public.teacher_earnings (teacher_id, month);

-- Prevent double payment for same withdrawal request
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_payments_unique_withdrawal 
ON public.teacher_payments (withdrawal_request_id) 
WHERE withdrawal_request_id IS NOT NULL;
