CREATE OR REPLACE FUNCTION public.list_all_students()
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, COALESCE(p.full_name, 'طالب') AS full_name
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'student'
    AND (
      public.has_role(auth.uid(), 'teacher'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  ORDER BY p.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.list_all_students() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_all_students() TO authenticated;