-- PREVIEW: NOT applied. Soft delete for violations (audit trail instead of permanent delete).
-- Apply before deploying the admin UI that writes deleted_at. Backup first (pg_dump). Rollback at the bottom.
BEGIN;

ALTER TABLE public.violations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS idx_violations_not_deleted ON public.violations (created_at DESC) WHERE deleted_at IS NULL;

-- Users no longer see rows an admin archived.
DROP POLICY IF EXISTS "Users can view own violations" ON public.violations;
CREATE POLICY "Users can view own violations" ON public.violations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);

COMMIT;

-- Rollback:
--   BEGIN;
--   DROP POLICY IF EXISTS "Users can view own violations" ON public.violations;
--   CREATE POLICY "Users can view own violations" ON public.violations FOR SELECT TO authenticated USING (auth.uid() = user_id);
--   DROP INDEX IF EXISTS public.idx_violations_not_deleted;
--   ALTER TABLE public.violations DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS delete_reason;
--   COMMIT;
