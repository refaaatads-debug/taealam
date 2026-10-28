BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
SELECT ('ba280000-0000-4000-8000-00000000004'||n)::uuid,'authenticated','authenticated',
  'private-profile-'||n||'@example.invalid',now(),now() FROM generate_series(1,4) n;
UPDATE public.profiles SET phone='test-private-phone'
  WHERE user_id='ba280000-0000-4000-8000-000000000041';
INSERT INTO public.user_roles(user_id,role)
VALUES ('ba280000-0000-4000-8000-000000000042','teacher'),
       ('ba280000-0000-4000-8000-000000000044','admin')
ON CONFLICT DO NOTHING;
INSERT INTO public.teacher_profiles(user_id,hourly_rate,is_approved,bank_name)
VALUES ('ba280000-0000-4000-8000-000000000042',20,true,'private-test-bank')
ON CONFLICT(user_id) DO UPDATE SET hourly_rate=20,is_approved=true,bank_name='private-test-bank';
INSERT INTO public.bookings(id,student_id,teacher_id,scheduled_at,status,duration_minutes,price)
VALUES ('ba280000-0000-4000-8000-000000000045','ba280000-0000-4000-8000-000000000041',
  'ba280000-0000-4000-8000-000000000042',now()+interval '1 day','confirmed',45,0),
  ('ba280000-0000-4000-8000-000000000046','ba280000-0000-4000-8000-000000000043',
  'ba280000-0000-4000-8000-000000000042',now()+interval '2 days','pending',45,0);
INSERT INTO public.bookings(id,student_id,teacher_id,scheduled_at,status,duration_minutes,price)
VALUES ('ba280000-0000-4000-8000-000000000049','ba280000-0000-4000-8000-000000000041',
  'ba280000-0000-4000-8000-000000000042',now()-interval '1 day','completed',45,0);
INSERT INTO public.call_logs(id,teacher_id,student_id,booking_id,student_phone,cost,status)
VALUES ('ba280000-0000-4000-8000-000000000048','ba280000-0000-4000-8000-000000000042',
  'ba280000-0000-4000-8000-000000000041','ba280000-0000-4000-8000-000000000045',
  'test-private-phone',0,'initiated');
-- Schema clones omit ACLs. Reproduce the broad SELECT grants from production;
-- the policies, rather than an accidental missing grant, must protect rows.
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
GRANT SELECT ON public.profiles,public.teacher_profiles TO anon,authenticated;
GRANT SELECT ON public.call_logs TO anon,authenticated;
SELECT set_config('request.jwt.claim.role','anon',true);
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.profiles) OR EXISTS(SELECT 1 FROM public.teacher_profiles)
  THEN RAISE EXCEPTION 'Anonymous private rows leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.public_profiles WHERE user_id='ba280000-0000-4000-8000-000000000041')
  OR NOT EXISTS(SELECT 1 FROM public.public_teacher_profiles WHERE user_id='ba280000-0000-4000-8000-000000000042')
  THEN RAISE EXCEPTION 'Public directory broke'; END IF;
  IF has_function_privilege('anon','public.get_booking_contact(uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Anonymous contact execution allowed'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('public_profiles','public_teacher_profiles')
      AND column_name IN ('phone','bank_name','iban','account_holder_name'))
  THEN RAISE EXCEPTION 'Sensitive columns exposed by a public view'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','ba280000-0000-4000-8000-000000000042',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result text; denied boolean := false; booking uuid; BEGIN
  IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id <> auth.uid())
  THEN RAISE EXCEPTION 'Teacher can read private student rows'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.teacher_profiles WHERE bank_name='private-test-bank')
  THEN RAISE EXCEPTION 'Own bank settings broke'; END IF;
  FOREACH booking IN ARRAY ARRAY[
    'ba280000-0000-4000-8000-000000000045'::uuid,
    'ba280000-0000-4000-8000-000000000049'::uuid] LOOP
    denied := false;
    BEGIN
      PERFORM * FROM public.get_booking_contact('ba280000-0000-4000-8000-000000000041',booking);
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Teacher phone access allowed with booking %',booking; END IF;
  END LOOP;
  SELECT public.get_profile_phone('ba280000-0000-4000-8000-000000000041') INTO result;
  IF result IS NOT NULL THEN RAISE EXCEPTION 'Scalar phone RPC leaked student number'; END IF;
  IF EXISTS(SELECT 1 FROM public.call_logs)
  THEN RAISE EXCEPTION 'Historical call record leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.teacher_call_history WHERE id='ba280000-0000-4000-8000-000000000048')
  THEN RAISE EXCEPTION 'Redacted call history broke'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='teacher_call_history' AND column_name IN ('student_phone','error_message','twilio_call_sid'))
  THEN RAISE EXCEPTION 'Private fields in teacher history projection'; END IF;
  denied := false;
  BEGIN
    PERFORM * FROM public.get_booking_contact('ba280000-0000-4000-8000-000000000043',NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Pending contact allowed'; END IF;
  denied := false;
  BEGIN
    PERFORM * FROM public.get_booking_contact(
      'ba280000-0000-4000-8000-000000000041','ba280000-0000-4000-8000-000000000046');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Mismatched booking contact allowed'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ba280000-0000-4000-8000-000000000041',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean := false; BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND phone='test-private-phone')
  THEN RAISE EXCEPTION 'Own profile settings broke'; END IF;
  IF (SELECT phone FROM public.get_booking_contact(auth.uid(),NULL)) IS DISTINCT FROM 'test-private-phone'
  THEN RAISE EXCEPTION 'Own contact RPC broke'; END IF;
  IF EXISTS(SELECT 1 FROM public.teacher_profiles)
  THEN RAISE EXCEPTION 'Student can read teacher bank details'; END IF;
  BEGIN
    PERFORM * FROM public.get_booking_contact('ba280000-0000-4000-8000-000000000042',NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Student can expose teacher phone'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ba280000-0000-4000-8000-000000000043',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean := false; BEGIN
  IF EXISTS(SELECT 1 FROM public.teacher_profiles)
  THEN RAISE EXCEPTION 'Unrelated user can read bank details'; END IF;
  BEGIN
    PERFORM * FROM public.get_booking_contact('ba280000-0000-4000-8000-000000000041',NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unrelated contact allowed'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ba280000-0000-4000-8000-000000000044',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE phone='test-private-phone')
  OR NOT EXISTS(SELECT 1 FROM public.teacher_profiles WHERE bank_name='private-test-bank')
  THEN RAISE EXCEPTION 'Administrative private screens broke'; END IF;
  IF (SELECT phone FROM public.get_booking_contact('ba280000-0000-4000-8000-000000000041',NULL))
    IS DISTINCT FROM 'test-private-phone' THEN RAISE EXCEPTION 'Admin contact RPC broke'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
