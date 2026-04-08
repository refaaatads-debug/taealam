
-- Manual earnings added by admin
CREATE TABLE public.teacher_earnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  month TEXT NOT NULL, -- format: 2026-04
  notes TEXT,
  added_by_admin UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage teacher_earnings"
  ON public.teacher_earnings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view own earnings"
  ON public.teacher_earnings FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

-- Daily stats
CREATE TABLE public.teacher_daily_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  date DATE NOT NULL,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, date)
);

ALTER TABLE public.teacher_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage daily_stats"
  ON public.teacher_daily_stats FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view own daily_stats"
  ON public.teacher_daily_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

-- Index for performance
CREATE INDEX idx_teacher_earnings_teacher ON public.teacher_earnings(teacher_id);
CREATE INDEX idx_teacher_earnings_month ON public.teacher_earnings(month);
CREATE INDEX idx_teacher_daily_stats_teacher_date ON public.teacher_daily_stats(teacher_id, date);
