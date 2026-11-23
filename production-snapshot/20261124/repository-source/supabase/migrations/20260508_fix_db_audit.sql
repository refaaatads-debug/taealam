-- Fix 1: Missing trigger on teacher_payments
DROP TRIGGER IF EXISTS trg_deduct_balance_on_payment ON public.teacher_payments;
CREATE TRIGGER trg_deduct_balance_on_payment
AFTER INSERT ON public.teacher_payments
FOR EACH ROW EXECUTE FUNCTION public.deduct_balance_on_payment();

-- Fix 2: Remove spurious tables created by bad migrations
DROP TABLE IF EXISTS public._min;
DROP TABLE IF EXISTS public._platform_fee_rate;

-- Fix 3: Add missing profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS country text;

-- Fix 4: Add missing teacher cv_url
ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS cv_url text;

-- Fix 5: Add UPDATE trigger on reviews
DROP TRIGGER IF EXISTS on_review_updated ON public.reviews;
CREATE TRIGGER on_review_updated
AFTER UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.update_teacher_rating();
