
ALTER TABLE public.ai_logs
ADD COLUMN usefulness_score numeric DEFAULT NULL,
ADD COLUMN is_regenerated boolean DEFAULT false,
ADD COLUMN evaluator_feedback text DEFAULT NULL;
