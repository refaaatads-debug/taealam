
CREATE OR REPLACE FUNCTION public.auto_create_teacher_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'teacher' THEN
    INSERT INTO public.teacher_profiles (user_id, hourly_rate, is_approved)
    VALUES (NEW.user_id, 0, false)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_role_created_teacher_profile
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_teacher_profile();
