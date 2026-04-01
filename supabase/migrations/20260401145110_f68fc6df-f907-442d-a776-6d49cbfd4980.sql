CREATE OR REPLACE FUNCTION public.set_new_user_role(_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _created_at timestamptz;
  _current_role app_role;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only allow for recently created users (within 10 minutes)
  SELECT created_at INTO _created_at FROM auth.users WHERE id = _user_id;
  IF _created_at IS NULL OR (now() - _created_at) > interval '10 minutes' THEN
    RAISE EXCEPTION 'Role can only be set for new accounts';
  END IF;

  -- Don't allow admin self-assignment
  IF _role = 'admin' THEN
    RAISE EXCEPTION 'Cannot self-assign admin role';
  END IF;

  -- Get current role
  SELECT role INTO _current_role FROM public.user_roles WHERE user_id = _user_id;
  
  -- Only update if current role is student (default)
  IF _current_role = 'student' AND _role = 'teacher' THEN
    UPDATE public.user_roles SET role = _role WHERE user_id = _user_id;
    
    -- Create teacher profile
    INSERT INTO public.teacher_profiles (user_id, hourly_rate, is_approved)
    VALUES (_user_id, 0, false)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;