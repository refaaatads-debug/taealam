
-- Add snapshot columns to teacher_earnings
ALTER TABLE public.teacher_earnings 
ADD COLUMN IF NOT EXISTS minutes_snapshot integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sessions_snapshot integer DEFAULT 0;

-- Prevent update/delete on paid earnings + audit rejected attempts
CREATE OR REPLACE FUNCTION public.protect_paid_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'paid' THEN
      INSERT INTO public.system_logs (level, source, message, metadata)
      VALUES ('warn', 'financial_security', 'محاولة حذف أرباح مدفوعة مرفوضة',
        jsonb_build_object('earning_id', OLD.id, 'teacher_id', OLD.teacher_id, 'amount', OLD.amount, 'month', OLD.month));
      RAISE EXCEPTION 'Cannot delete paid earnings';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'paid' AND (
      NEW.amount IS DISTINCT FROM OLD.amount OR
      NEW.teacher_id IS DISTINCT FROM OLD.teacher_id OR
      NEW.month IS DISTINCT FROM OLD.month OR
      NEW.hours IS DISTINCT FROM OLD.hours
    ) THEN
      INSERT INTO public.system_logs (level, source, message, metadata)
      VALUES ('warn', 'financial_security', 'محاولة تعديل أرباح مدفوعة مرفوضة',
        jsonb_build_object('earning_id', OLD.id, 'teacher_id', OLD.teacher_id, 'attempted_amount', NEW.amount, 'original_amount', OLD.amount));
      RAISE EXCEPTION 'Cannot modify paid earnings';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_paid_earnings
BEFORE UPDATE OR DELETE ON public.teacher_earnings
FOR EACH ROW
EXECUTE FUNCTION public.protect_paid_earnings();
