CREATE TABLE IF NOT EXISTS public.invoice_zatca_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  zatca_uuid TEXT,
  zatca_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID,
  actor_role TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_zatca_log_invoice ON public.invoice_zatca_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_zatca_log_created ON public.invoice_zatca_log(created_at DESC);

ALTER TABLE public.invoice_zatca_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage zatca log"
ON public.invoice_zatca_log
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students view own invoice zatca log"
ON public.invoice_zatca_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_zatca_log.invoice_id
    AND (i.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Authenticated insert zatca log"
ON public.invoice_zatca_log
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (actor_id = auth.uid())
);

-- Trigger to auto-log ZATCA status changes
CREATE OR REPLACE FUNCTION public.log_invoice_zatca_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.invoice_zatca_log (invoice_id, from_status, to_status, zatca_uuid, zatca_hash, reason, metadata)
    VALUES (NEW.id, NULL, NEW.zatca_status, NEW.zatca_uuid, NEW.zatca_hash, 'Invoice issued', jsonb_build_object('event','created'));
  ELSIF TG_OP = 'UPDATE' AND (NEW.zatca_status IS DISTINCT FROM OLD.zatca_status
                              OR NEW.zatca_uuid IS DISTINCT FROM OLD.zatca_uuid
                              OR NEW.zatca_hash IS DISTINCT FROM OLD.zatca_hash) THEN
    INSERT INTO public.invoice_zatca_log (invoice_id, from_status, to_status, zatca_uuid, zatca_hash, reason, metadata)
    VALUES (NEW.id, OLD.zatca_status, NEW.zatca_status, NEW.zatca_uuid, NEW.zatca_hash,
            COALESCE(NEW.metadata->>'zatca_reason', NULL),
            jsonb_build_object('event','updated'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_invoice_zatca ON public.invoices;
CREATE TRIGGER trg_log_invoice_zatca
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.log_invoice_zatca_change();