
CREATE TABLE public.ai_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_name text NOT NULL,
  input_summary text,
  output_summary text,
  status text NOT NULL DEFAULT 'success',
  response_time_ms integer,
  quality_score numeric DEFAULT 0,
  retry_count integer DEFAULT 0,
  error_message text,
  booking_id uuid,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_logs"
ON public.ai_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert ai_logs"
ON public.ai_logs FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Anon can insert ai_logs"
ON public.ai_logs FOR INSERT
TO anon
WITH CHECK (true);

CREATE INDEX idx_ai_logs_feature ON public.ai_logs(feature_name);
CREATE INDEX idx_ai_logs_status ON public.ai_logs(status);
CREATE INDEX idx_ai_logs_created ON public.ai_logs(created_at DESC);
