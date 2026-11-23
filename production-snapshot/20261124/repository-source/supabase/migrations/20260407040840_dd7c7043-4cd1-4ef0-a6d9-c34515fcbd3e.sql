
ALTER TABLE public.subscription_plans
ADD COLUMN assigned_user_id uuid DEFAULT NULL;

-- Update the public SELECT policy to only show plans that are either public (no assigned user) or assigned to the current user
DROP POLICY IF EXISTS "Plans are public" ON public.subscription_plans;

CREATE POLICY "Plans visible to assigned or all"
ON public.subscription_plans
FOR SELECT
USING (
  assigned_user_id IS NULL 
  OR assigned_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);
