
CREATE TABLE IF NOT EXISTS public.call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE CASCADE,
  twilio_call_sid text NOT NULL,
  speaker text NOT NULL DEFAULT 'unknown', -- 'teacher' | 'student' | 'unknown'
  text text NOT NULL,
  is_violation boolean NOT NULL DEFAULT false,
  violation_type text,
  segment_start_ms integer,
  segment_end_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_sid ON public.call_transcripts(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_log ON public.call_transcripts(call_log_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_violation ON public.call_transcripts(is_violation) WHERE is_violation = true;

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins or violation/wallet managers can view transcripts"
ON public.call_transcripts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_permission(auth.uid(), 'manage_violations') OR
  public.has_permission(auth.uid(), 'manage_wallets')
);

CREATE POLICY "Service role only insert transcripts"
ON public.call_transcripts FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
