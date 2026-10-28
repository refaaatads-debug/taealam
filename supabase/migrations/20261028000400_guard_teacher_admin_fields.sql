BEGIN;
CREATE OR REPLACE FUNCTION public.guard_teacher_admin_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  personal_fields text[] := ARRAY[
    'bio','years_experience','available_from','available_to','available_days',
    'nationality','teaching_stages','bank_name','iban','account_holder_name',
    'vat_enabled','tax_id','cv_url','updated_at',
    'teaching_mode','city_id','in_person_latitude','in_person_longitude',
    'in_person_service_radius_km','in_person_enabled'
  ];
BEGIN
  IF auth.role() = 'service_role'
     OR (auth.role() IS NULL AND session_user IN ('postgres','supabase_admin'))
     OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Profile owner required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_approved,false) OR COALESCE(NEW.is_verified,false)
       OR COALESCE(NEW.balance,0) <> 0 OR COALESCE(NEW.hourly_rate,0) <> 0
       OR COALESCE(NEW.approval_status,'pending') <> 'pending'
       OR COALESCE(NEW.in_person_approval_status,'not_requested') <> 'not_requested'
       OR NEW.in_person_teacher_rate_sar IS NOT NULL
       OR COALESCE(NEW.avg_rating,0) <> 0 OR COALESCE(NEW.total_sessions,0) <> 0
       OR COALESCE(NEW.total_reviews,0) <> 0 THEN
      RAISE EXCEPTION 'Administrative fields cannot be set at registration' USING ERRCODE = '42501';
    END IF;
  ELSIF (to_jsonb(NEW) - personal_fields) IS DISTINCT FROM (to_jsonb(OLD) - personal_fields) THEN
    RAISE EXCEPTION 'Administrative fields require authorization' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_teacher_admin_fields() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_teacher_admin_fields
BEFORE INSERT OR UPDATE ON public.teacher_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_teacher_admin_fields();

ALTER FUNCTION public.cleanup_stale_active_sessions() SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.cleanup_stale_active_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_active_sessions() TO service_role;
COMMIT;
