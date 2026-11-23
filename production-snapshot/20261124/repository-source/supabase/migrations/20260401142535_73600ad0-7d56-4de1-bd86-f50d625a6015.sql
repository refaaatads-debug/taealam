
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  selected_role app_role;
BEGIN
  -- Read role from signup metadata, default to 'student'
  selected_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::app_role,
    'student'::app_role
  );
  
  -- Don't allow self-assigning admin
  IF selected_role = 'admin' THEN
    selected_role := 'student';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, selected_role);
  RETURN NEW;
END;
$function$;
