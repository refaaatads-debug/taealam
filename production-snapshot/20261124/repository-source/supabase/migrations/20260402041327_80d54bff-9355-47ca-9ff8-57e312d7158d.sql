
-- Create booking_requests table for broadcast booking model
CREATE TABLE public.booking_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  subject_id UUID REFERENCES public.subjects(id),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'expired', 'cancelled')),
  accepted_by UUID,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Students can create their own requests
CREATE POLICY "Students can create requests"
ON public.booking_requests
FOR INSERT
WITH CHECK (auth.uid() = student_id);

-- Students can view their own requests
CREATE POLICY "Students can view own requests"
ON public.booking_requests
FOR SELECT
USING (auth.uid() = student_id);

-- Students can cancel their own open requests
CREATE POLICY "Students can update own requests"
ON public.booking_requests
FOR UPDATE
USING (auth.uid() = student_id AND status = 'open');

-- Approved teachers can view open requests for their subjects
CREATE POLICY "Teachers can view open requests"
ON public.booking_requests
FOR SELECT
USING (
  status = 'open' 
  AND EXISTS (
    SELECT 1 FROM public.teacher_profiles tp
    JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = auth.uid() 
      AND tp.is_approved = true
      AND ts.subject_id = booking_requests.subject_id
  )
);

-- Teachers can accept open requests (update status)
CREATE POLICY "Teachers can accept open requests"
ON public.booking_requests
FOR UPDATE
USING (
  status = 'open'
  AND EXISTS (
    SELECT 1 FROM public.teacher_profiles tp
    JOIN public.teacher_subjects ts ON ts.teacher_id = tp.id
    WHERE tp.user_id = auth.uid()
      AND tp.is_approved = true
      AND ts.subject_id = booking_requests.subject_id
  )
);

-- Admins full access
CREATE POLICY "Admins can manage requests"
ON public.booking_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_booking_requests_updated_at
BEFORE UPDATE ON public.booking_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_requests;
