
-- Financial months table
CREATE TABLE IF NOT EXISTS public.financial_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage financial_months"
ON public.financial_months FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add invoice_id to teacher_earnings
ALTER TABLE public.teacher_earnings ADD COLUMN IF NOT EXISTS invoice_id text UNIQUE;

-- Function to generate invoice_id
CREATE OR REPLACE FUNCTION public.generate_earning_invoice_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _seq integer;
BEGIN
  SELECT COUNT(*) + 1 INTO _seq
  FROM public.teacher_earnings
  WHERE month = NEW.month;

  NEW.invoice_id := 'EARN-' || REPLACE(NEW.month, '-', '-') || '-' || LPAD(_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_invoice_id
BEFORE INSERT ON public.teacher_earnings
FOR EACH ROW
WHEN (NEW.invoice_id IS NULL)
EXECUTE FUNCTION public.generate_earning_invoice_id();

-- Block inserts/updates on closed months
CREATE OR REPLACE FUNCTION public.block_closed_month_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
BEGIN
  SELECT status INTO _status FROM public.financial_months WHERE month = NEW.month;

  IF _status = 'closed' THEN
    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES ('warn', 'financial_security', 'محاولة تعديل أرباح في شهر مقفل',
      jsonb_build_object('month', NEW.month, 'teacher_id', NEW.teacher_id, 'amount', NEW.amount));
    RAISE EXCEPTION 'Month % is closed', NEW.month;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_block_closed_month
BEFORE INSERT OR UPDATE ON public.teacher_earnings
FOR EACH ROW
EXECUTE FUNCTION public.block_closed_month_earnings();
