ALTER TABLE public.internal_calls
  ADD COLUMN IF NOT EXISTS transport_provider text NOT NULL DEFAULT 'webrtc'
  CHECK (transport_provider IN ('webrtc', 'agora'));

CREATE TABLE IF NOT EXISTS public.internal_call_transport_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  agora_enabled boolean NOT NULL DEFAULT false,
  test_user_ids uuid[] NOT NULL
);

ALTER TABLE public.internal_call_transport_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_call_transport_config FROM PUBLIC, anon, authenticated;

INSERT INTO public.internal_call_transport_config (singleton, agora_enabled, test_user_ids)
VALUES (
  true,
  false,
  ARRAY[
    '328ac5b7-c495-438d-bdaf-58bdd39cc7f1'::uuid,
    '00a39848-081c-499e-bc26-331bf3d4e55d'::uuid
  ]
)
ON CONFLICT (singleton) DO UPDATE
SET test_user_ids = EXCLUDED.test_user_ids;

CREATE OR REPLACE FUNCTION public.start_internal_call(
  p_student_id uuid,
  p_booking_id uuid,
  p_transport_provider text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_booking_id uuid := NULL;
  v_call public.internal_calls;
  v_config public.internal_call_transport_config;
BEGIN
  IF v_teacher_id IS NULL OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'هذه الخدمة متاحة للمعلمين فقط');
  END IF;
  IF p_student_id IS NULL OR p_student_id = v_teacher_id
     OR NOT public.has_role(p_student_id, 'student'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STUDENT', 'message', 'بيانات الطالب غير صحيحة');
  END IF;
  IF p_transport_provider NOT IN ('webrtc', 'agora') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PROVIDER');
  END IF;
  IF p_transport_provider = 'agora' THEN
    SELECT * INTO v_config
    FROM public.internal_call_transport_config
    WHERE singleton = true;
    IF NOT COALESCE(v_config.agora_enabled, false)
       OR NOT (v_teacher_id = ANY(v_config.test_user_ids))
       OR NOT (p_student_id = ANY(v_config.test_user_ids)) THEN
      RETURN jsonb_build_object('success', false, 'code', 'AGORA_NOT_ENABLED');
    END IF;
  END IF;
  IF p_booking_id IS NOT NULL THEN
    SELECT b.id INTO v_booking_id
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
    WHERE s.user_id = p_student_id AND s.is_connected = true
      AND s.last_heartbeat > now() - interval '90 seconds'
  ) OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = p_student_id AND b.session_status = 'in_progress'
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
  INSERT INTO public.internal_calls (caller_id, callee_id, booking_id, transport_provider)
  VALUES (v_teacher_id, p_student_id, v_booking_id, p_transport_provider)
  RETURNING * INTO v_call;
  RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
END;
$$;

REVOKE ALL ON FUNCTION public.start_internal_call(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_internal_call(uuid, uuid, text) TO authenticated;
