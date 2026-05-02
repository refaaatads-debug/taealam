
-- Session quality incidents log
CREATE TABLE IF NOT EXISTS public.session_quality_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  booking_id UUID,
  user_id UUID NOT NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('disconnect', 'high_latency', 'packet_loss', 'audio_failure', 'video_failure')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  duration_ms INTEGER,
  rtt_ms INTEGER,
  packet_loss NUMERIC,
  jitter_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  was_compensated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_session ON public.session_quality_incidents(session_id);
CREATE INDEX IF NOT EXISTS idx_quality_user ON public.session_quality_incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_quality_created ON public.session_quality_incidents(created_at DESC);

ALTER TABLE public.session_quality_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their session incidents"
ON public.session_quality_incidents FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can log incidents"
ON public.session_quality_incidents FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage incidents"
ON public.session_quality_incidents FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Session compensations
CREATE TABLE IF NOT EXISTS public.session_compensations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID REFERENCES public.session_quality_incidents(id) ON DELETE SET NULL,
  session_id UUID,
  student_id UUID NOT NULL,
  minutes_credited INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compensation_student ON public.session_compensations(student_id);
CREATE INDEX IF NOT EXISTS idx_compensation_status ON public.session_compensations(status);

ALTER TABLE public.session_compensations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view their compensations"
ON public.session_compensations FOR SELECT
TO authenticated
USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage compensations"
ON public.session_compensations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_session_compensations_updated_at
BEFORE UPDATE ON public.session_compensations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
