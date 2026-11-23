ALTER TABLE public.subscription_plans 
ADD COLUMN session_duration_minutes integer NOT NULL DEFAULT 45;