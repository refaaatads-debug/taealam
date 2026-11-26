-- Per-admin "seen" marks for dashboard badges (replaces browser-only localStorage).
-- NOT applied yet. Rollback: DROP TABLE public.admin_seen_tabs;
CREATE TABLE IF NOT EXISTS public.admin_seen_tabs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tab_key text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tab_key)
);
ALTER TABLE public.admin_seen_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage own seen marks" ON public.admin_seen_tabs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE ALL ON public.admin_seen_tabs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_seen_tabs TO authenticated;
