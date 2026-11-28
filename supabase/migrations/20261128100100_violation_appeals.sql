-- PREVIEW: NOT applied. Appeals for violations. Users create and read only their own; admins manage all.
-- Backup first (pg_dump). Rollback at the bottom.
BEGIN;

CREATE TABLE IF NOT EXISTS public.violation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id uuid NOT NULL REFERENCES public.violations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  admin_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One appeal per violation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_violation_appeals_violation ON public.violation_appeals (violation_id);
CREATE INDEX IF NOT EXISTS idx_violation_appeals_status ON public.violation_appeals (status, created_at DESC);

ALTER TABLE public.violation_appeals ENABLE ROW LEVEL SECURITY;

-- Table privileges for logged-in users (RLS below limits what they can do). Without this the table
-- answers "permission denied" because new tables here do not get default grants.
GRANT SELECT, INSERT, UPDATE ON public.violation_appeals TO authenticated;
GRANT ALL ON public.violation_appeals TO supabase_admin;

CREATE POLICY "Admins manage appeals" ON public.violation_appeals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own appeals" ON public.violation_appeals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- A user may appeal only their own violation, only as pending, and the row must carry their id.
CREATE POLICY "Users create own appeals" ON public.violation_appeals
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND decided_by IS NULL
    AND EXISTS (SELECT 1 FROM public.violations v WHERE v.id = violation_id AND v.user_id = auth.uid() AND v.deleted_at IS NULL)
  );

COMMIT;

-- Rollback:
--   DROP TABLE IF EXISTS public.violation_appeals;
