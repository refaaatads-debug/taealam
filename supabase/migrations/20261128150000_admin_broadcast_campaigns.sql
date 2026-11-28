-- PREVIEW MIGRATION FILE. NOT APPLIED. Server-side, resumable admin broadcasts.
-- Additive only: one new table and one new nullable column on notifications.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  file_url TEXT,
  file_name TEXT,
  target TEXT NOT NULL CHECK (target IN ('all', 'all_students', 'all_teachers')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  total_recipients INTEGER,
  sent_count INTEGER NOT NULL DEFAULT 0,
  last_user_id UUID,
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read broadcasts" ON public.admin_broadcasts;
CREATE POLICY "Admins read broadcasts" ON public.admin_broadcasts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- New tables here get no default grants: be explicit. Writes only through the edge function (service_role).
GRANT SELECT ON public.admin_broadcasts TO authenticated;
GRANT ALL ON public.admin_broadcasts TO service_role;

-- Idempotency: one notification per (broadcast, user), so a retried page cannot duplicate.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS broadcast_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_broadcast_user_uniq
  ON public.notifications (broadcast_id, user_id) WHERE broadcast_id IS NOT NULL;

COMMIT;

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS public.notifications_broadcast_user_uniq;
--   ALTER TABLE public.notifications DROP COLUMN IF EXISTS broadcast_id;
--   DROP TABLE IF EXISTS public.admin_broadcasts;
