-- Run after 20261022000300_teacher_in_person_status_notifications.sql
-- The transaction rolls back all synthetic users and notification rows.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_teacher uuid := 'a3000000-0000-4000-8000-000000000003';
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (v_teacher, 'authenticated', 'authenticated', 'approval-notification@example.invalid', '', now(), now());
  INSERT INTO public.profiles(user_id, full_name)
  VALUES (v_teacher, 'Synthetic approval-notification teacher')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status, in_person_approval_status, in_person_enabled)
  VALUES (v_teacher, 20, true, 'approved', 'pending', false);

  UPDATE public.teacher_profiles
  SET in_person_approval_status = 'approved'
  WHERE user_id = v_teacher;
  UPDATE public.teacher_profiles
  SET in_person_approval_status = 'approved'
  WHERE user_id = v_teacher;

  SELECT count(*) INTO v_count FROM public.notifications
  WHERE user_id = v_teacher AND type = 'teacher_in_person_approval';
  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_teacher AND type = 'teacher_in_person_approval'
      AND title = '✅ تم اعتماد التدريس الحضوري'
      AND body LIKE '%وافقت الإدارة على طلبك%'
      AND link = '/profile'
  ) THEN
    RAISE EXCEPTION 'Approval transition must create one accurate Arabic notification';
  END IF;

  UPDATE public.teacher_profiles
  SET in_person_approval_status = 'rejected',
      in_person_rejection_reason = 'نقص بيانات موقع الخدمة'
  WHERE user_id = v_teacher;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_teacher AND type = 'teacher_in_person_approval'
      AND title = 'لم تتم الموافقة على طلب التدريس الحضوري'
      AND body LIKE '%نقص بيانات موقع الخدمة%'
  ) THEN
    RAISE EXCEPTION 'Rejection notification must include the recorded reason';
  END IF;

  UPDATE public.teacher_profiles
  SET in_person_approval_status = 'approved',
      in_person_enabled = true
  WHERE user_id = v_teacher;
  UPDATE public.teacher_profiles
  SET in_person_enabled = false
  WHERE user_id = v_teacher;

  SELECT count(*) INTO v_count FROM public.notifications
  WHERE user_id = v_teacher;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Expected one notification per actual transition; got %', v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_teacher
      AND title = 'تم إيقاف استقبال الحجوزات الحضورية'
      AND body LIKE '%لا يؤثر ذلك في حجوزاتك السابقة%'
  ) THEN
    RAISE EXCEPTION 'Availability notification must describe actual impact';
  END IF;
END;
$$;

ROLLBACK;
