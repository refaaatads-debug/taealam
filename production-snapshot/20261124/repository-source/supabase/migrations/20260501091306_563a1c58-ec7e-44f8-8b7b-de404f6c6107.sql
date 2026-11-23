
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_name text,
  actor_role text,
  action text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text,
  target_table text,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.admin_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_category ON public.admin_audit_log(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin managers can view all audit logs"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_admins'::app_permission));

CREATE POLICY "Users can view own audit logs"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (auth.uid() = actor_id);

CREATE POLICY "Authenticated can insert own audit logs"
  ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _category text DEFAULT 'general',
  _description text DEFAULT NULL,
  _target_table text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _before jsonb DEFAULT NULL,
  _after jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _name text;
  _role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT full_name INTO _name FROM public.profiles WHERE user_id = auth.uid();
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_name, actor_role, action, category,
    description, target_table, target_id, before_data, after_data, metadata
  ) VALUES (
    auth.uid(),
    COALESCE(_name, 'مستخدم'),
    COALESCE(_role, 'unknown'),
    _action, _category, _description, _target_table, _target_id,
    _before, _after, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(text, text, text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, text, text, jsonb, jsonb, jsonb) TO authenticated;
