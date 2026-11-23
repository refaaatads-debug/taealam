
-- Auto-deduct balance when a teacher_payment is inserted
CREATE OR REPLACE FUNCTION public.deduct_balance_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.teacher_profiles
  SET balance = GREATEST(balance - NEW.amount, 0),
      updated_at = now()
  WHERE user_id = NEW.teacher_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_balance_on_payment
AFTER INSERT ON public.teacher_payments
FOR EACH ROW
EXECUTE FUNCTION public.deduct_balance_on_payment();
