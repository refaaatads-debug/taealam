ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'support_department_users';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'support_department_teachers';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'support_department_sessions';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'support_department_finance';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'support_department_security';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'support_department_system';

CREATE OR REPLACE FUNCTION public.get_support_transfer_agents()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  support_departments text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    permissions.user_id,
    COALESCE(profiles.full_name, 'موظف دعم') AS full_name,
    COALESCE(
      array_agg(DISTINCT permissions.permission::text ORDER BY permissions.permission::text)
        FILTER (WHERE permissions.permission::text LIKE 'support_department_%'),
      ARRAY[]::text[]
    ) AS support_departments
  FROM public.user_permissions AS permissions
  LEFT JOIN public.profiles AS profiles
    ON profiles.user_id = permissions.user_id
  GROUP BY permissions.user_id, profiles.full_name
  HAVING bool_or(permissions.permission::text = 'customer_support')
    AND permissions.user_id <> auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'customer_support'::public.app_permission)
    )
  ORDER BY COALESCE(profiles.full_name, 'موظف دعم');
$function$;

REVOKE ALL ON FUNCTION public.get_support_transfer_agents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_support_transfer_agents() TO authenticated;
