-- Extend log_admin_action to accept ip_address and user_agent
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _category text DEFAULT 'general'::text,
  _description text DEFAULT NULL::text,
  _target_table text DEFAULT NULL::text,
  _target_id text DEFAULT NULL::text,
  _before jsonb DEFAULT NULL::jsonb,
  _after jsonb DEFAULT NULL::jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _ip_address text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    description, target_table, target_id, before_data, after_data, metadata,
    ip_address, user_agent
  ) VALUES (
    auth.uid(),
    COALESCE(_name, 'مستخدم'),
    COALESCE(_role, 'unknown'),
    _action, _category, _description, _target_table, _target_id,
    _before, _after, COALESCE(_metadata, '{}'::jsonb),
    _ip_address, _user_agent
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_category ON public.admin_audit_log (category);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.admin_audit_log (action);