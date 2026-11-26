-- Server status snapshots (disk + last backup), written by an ops script on the VPS, read by admins.
-- Rollback: supabase/rollbacks_20261126170000_server_status_snapshots.sql
CREATE TABLE IF NOT EXISTS public.server_status_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disk_total_bytes bigint NOT NULL,
  disk_used_bytes bigint NOT NULL,
  last_backup_at timestamptz,
  last_backup_bytes bigint,
  backup_count integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_server_status_snapshots_created ON public.server_status_snapshots (created_at DESC);
ALTER TABLE public.server_status_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read server status" ON public.server_status_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE ALL ON public.server_status_snapshots FROM anon, authenticated;
GRANT SELECT ON public.server_status_snapshots TO authenticated;
-- Inserts come only from the ops script via the service role / postgres user (no client write policy).
