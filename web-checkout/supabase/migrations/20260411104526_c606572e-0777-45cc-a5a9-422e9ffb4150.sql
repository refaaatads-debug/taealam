ALTER TABLE public.payment_records
  DROP CONSTRAINT payment_records_plan_id_fkey;

ALTER TABLE public.payment_records
  ADD CONSTRAINT payment_records_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id)
  ON DELETE SET NULL;