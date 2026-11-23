-- Make plan_id nullable
ALTER TABLE public.user_subscriptions
  ALTER COLUMN plan_id DROP NOT NULL;

-- Replace the foreign key constraint with ON DELETE SET NULL
ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT user_subscriptions_plan_id_fkey;

ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id)
  ON DELETE SET NULL;