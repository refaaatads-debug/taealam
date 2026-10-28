BEGIN;
-- Immediate privacy cutover: compatibility never grants teachers student phones.
DROP POLICY IF EXISTS "Anon can read profiles via view" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anon can read teacher profiles via view" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Authenticated can read teacher profiles via view" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Owners can read private profiles" ON public.profiles;
CREATE POLICY "Owners can read private profiles" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.get_booking_contact(p_user_id uuid,p_booking_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid,phone text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid()<>p_user_id
    AND NOT public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Contact access denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT p.user_id,p.phone FROM public.profiles p WHERE p.user_id=p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_booking_contact(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_booking_contact(uuid,uuid) TO authenticated;

-- Historical call logs also contain the student phone and provider errors.
DROP POLICY IF EXISTS call_logs_select_participant ON public.call_logs;
DROP POLICY IF EXISTS "Admins or wallet managers can manage call_logs" ON public.call_logs;
CREATE POLICY "Student owns private call records" ON public.call_logs FOR SELECT TO authenticated
  USING (student_id=(SELECT auth.uid()));
CREATE POLICY "Admins manage private call records" ON public.call_logs FOR ALL TO authenticated
  USING(public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK(public.has_role(auth.uid(),'admin'::public.app_role));
CREATE OR REPLACE VIEW public.teacher_call_history WITH (security_barrier=true) AS
  SELECT id,teacher_id,student_id,booking_id,duration_minutes,estimated_minutes,cost,status,created_at,ended_at
  FROM public.call_logs WHERE teacher_id=(SELECT auth.uid());
ALTER VIEW public.teacher_call_history OWNER TO postgres;
REVOKE ALL ON public.teacher_call_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.teacher_call_history TO authenticated,service_role;
COMMIT;
