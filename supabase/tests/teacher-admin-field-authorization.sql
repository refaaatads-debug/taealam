BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
VALUES ('ba280000-0000-4000-8000-000000000021','authenticated','authenticated',
  'teacher-guard@example.invalid',now(),now());
INSERT INTO public.teacher_profiles(user_id,hourly_rate,is_approved)
VALUES ('ba280000-0000-4000-8000-000000000021',20,true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'ba280000-0000-4000-8000-000000000021', true);
DO $$
DECLARE field text; failed boolean;
BEGIN
  UPDATE public.teacher_profiles SET bio='Allowed personal edit'
    WHERE user_id=auth.uid();
  FOREACH field IN ARRAY ARRAY['balance','hourly_rate','is_approved','is_verified','approval_status'] LOOP
    failed := false;
    BEGIN
      CASE field
        WHEN 'balance' THEN UPDATE public.teacher_profiles SET balance=100 WHERE user_id=auth.uid();
        WHEN 'hourly_rate' THEN UPDATE public.teacher_profiles SET hourly_rate=500 WHERE user_id=auth.uid();
        WHEN 'is_approved' THEN UPDATE public.teacher_profiles SET is_approved=false WHERE user_id=auth.uid();
        WHEN 'is_verified' THEN UPDATE public.teacher_profiles SET is_verified=true WHERE user_id=auth.uid();
        ELSE UPDATE public.teacher_profiles SET approval_status='approved' WHERE user_id=auth.uid();
      END CASE;
    EXCEPTION WHEN insufficient_privilege THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Administrative field % was mutable',field; END IF;
  END LOOP;
END;
$$;
ROLLBACK;
