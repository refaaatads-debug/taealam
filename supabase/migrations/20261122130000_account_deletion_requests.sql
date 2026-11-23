-- Account deletion request flow (Google Play requirement). NOT applied yet: apply only after owner approval.
-- Rollback: DROP TABLE public.account_deletion_requests;
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_one_pending
  ON public.account_deletion_requests (user_id) WHERE status = 'pending';
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users create own deletion request" ON public.account_deletion_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Users read own deletion request" ON public.account_deletion_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage deletion requests" ON public.account_deletion_requests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;
