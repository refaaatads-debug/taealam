
-- Track first impression dialog shown per (teacher, student) — so it never shows twice
CREATE TABLE IF NOT EXISTS public.teacher_first_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, student_id)
);

ALTER TABLE public.teacher_first_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own impressions"
  ON public.teacher_first_impressions
  FOR ALL
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Admins view impressions"
  ON public.teacher_first_impressions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Track upcoming-hour reminders to prevent duplicates across devices/refreshes
CREATE TABLE IF NOT EXISTS public.session_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reminder_type TEXT NOT NULL DEFAULT 'one_hour',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id, user_id, reminder_type)
);

ALTER TABLE public.session_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reminders"
  ON public.session_reminders_sent
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Atomic helper: claim an entire booking_request group at once for one teacher
CREATE OR REPLACE FUNCTION public.accept_booking_group(_group_id UUID, _teacher_id UUID)
RETURNS SETOF public.booking_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.booking_requests
     SET status = 'accepted',
         accepted_by = _teacher_id,
         accepted_at = now(),
         updated_at = now()
   WHERE group_id = _group_id
     AND status = 'open'
   RETURNING *;
END;
$$;
