
-- Withdrawal requests table
CREATE TABLE public.withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own withdrawals" ON public.withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can create withdrawals" ON public.withdrawal_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Admins can manage withdrawals" ON public.withdrawal_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_withdrawal_requests_updated_at BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Teacher payments table
CREATE TABLE public.teacher_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT DEFAULT 'bank_transfer',
  notes TEXT,
  withdrawal_request_id UUID REFERENCES public.withdrawal_requests(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own payments" ON public.teacher_payments FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Admins can manage payments" ON public.teacher_payments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
