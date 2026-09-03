-- Allow a teacher to start an internal voice call without an existing booking.
-- A booking is still retained when it is valid and belongs to both participants.
CREATE OR REPLACE FUNCTION public.start_internal_call(
  p_student_id uuid,
  p_booking_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_booking_id uuid := NULL;
  v_call public.internal_calls;
BEGIN
  IF v_teacher_id IS NULL OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'هذه الخدمة متاحة للمعلمين فقط');
  END IF;

  IF p_student_id IS NULL OR p_student_id = v_teacher_id
     OR NOT public.has_role(p_student_id, 'student'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STUDENT', 'message', 'بيانات الطالب غير صحيحة');
  END IF;

  -- Keep the relation when the caller supplied a valid booking; otherwise
  -- the call remains an independent internal call with a NULL booking_id.
  IF p_booking_id IS NOT NULL THEN
    SELECT b.id
    INTO v_booking_id
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.teacher_id = v_teacher_id
      AND b.student_id = p_student_id
      AND b.status <> 'cancelled'::public.booking_status
    LIMIT 1;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_student_id::text));
  PERFORM public.expire_internal_calls();

  IF EXISTS (
    SELECT 1 FROM public.active_sessions s
    WHERE s.user_id = p_student_id
      AND s.is_connected = true
      AND s.last_heartbeat > now() - interval '90 seconds'
  ) OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = p_student_id
      AND b.session_status = 'in_progress'
      AND b.status = 'confirmed'::public.booking_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'STUDENT_BUSY', 'message', 'الطالب داخل حصة مع معلم آخر الآن');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.internal_calls c
    WHERE (c.caller_id IN (v_teacher_id, p_student_id) OR c.callee_id IN (v_teacher_id, p_student_id))
      AND c.status IN ('ringing', 'connecting', 'connected')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'USER_BUSY', 'message', 'أحد الطرفين مشغول في مكالمة أخرى');
  END IF;

  INSERT INTO public.internal_calls (caller_id, callee_id, booking_id)
  VALUES (v_teacher_id, p_student_id, v_booking_id)
  RETURNING * INTO v_call;

  RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
END;
$$;

REVOKE ALL ON FUNCTION public.start_internal_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_internal_call(uuid, uuid) TO authenticated;