ALTER TABLE public.internal_calls
  ADD COLUMN IF NOT EXISTS caller_agora_capable boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.start_internal_call(
  p_student_id uuid,
  p_booking_id uuid,
  p_transport_provider text,
  p_caller_agora_capable boolean
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
  -- New clients begin the call as WebRTC while ringing. Agora is chosen only
  -- when this exact caller and the accepting client both advertise support.
  IF p_transport_provider IS DISTINCT FROM 'webrtc' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PROVIDER');
  END IF;
  IF p_caller_agora_capable THEN
    SELECT * INTO v_config
    FROM public.internal_call_transport_config
    WHERE singleton = true;
    IF NOT COALESCE(v_config.agora_enabled, false) THEN
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
  INSERT INTO public.internal_calls (
    caller_id, callee_id, booking_id, transport_provider, caller_agora_capable
  )
  VALUES (v_teacher_id, p_student_id, v_booking_id, 'webrtc', COALESCE(p_caller_agora_capable, false))
  RETURNING * INTO v_call;
  RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
END;
$$;

REVOKE ALL ON FUNCTION public.start_internal_call(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_internal_call(uuid, uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_internal_call(
  p_call_id uuid,
  p_accept boolean,
  p_transport_provider text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.internal_calls;
  v_config public.internal_call_transport_config;
  v_selected_provider text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF p_transport_provider IS NULL OR p_transport_provider NOT IN ('webrtc', 'agora') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PROVIDER');
  END IF;
  SELECT * INTO v_call
  FROM public.internal_calls
  WHERE id = p_call_id
  FOR UPDATE;
  IF v_call.id IS NULL OR v_call.callee_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF v_call.status <> 'ringing' OR v_call.expires_at <= now() THEN
    UPDATE public.internal_calls
      SET status = CASE WHEN status = 'ringing' THEN 'missed' ELSE status END,
          ended_at = CASE WHEN status = 'ringing' THEN now() ELSE ended_at END,
          end_reason = CASE WHEN status = 'ringing' THEN 'ring_timeout' ELSE end_reason END,
          updated_at = now()
      WHERE id = p_call_id;
    RETURN jsonb_build_object('success', false, 'code', 'CALL_EXPIRED', 'message', 'انتهت مهلة الرد');
  END IF;
  IF NOT p_accept THEN
    UPDATE public.internal_calls
      SET status = 'rejected', ended_at = now(), end_reason = 'rejected_by_student', updated_at = now()
      WHERE id = p_call_id RETURNING * INTO v_call;
    RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
  END IF;

  v_selected_provider := p_transport_provider;
  IF p_transport_provider = 'agora' THEN
    SELECT * INTO v_config
    FROM public.internal_call_transport_config
    WHERE singleton = true;
    IF NOT COALESCE(v_config.agora_enabled, false)
       OR (v_call.transport_provider = 'webrtc' AND NOT v_call.caller_agora_capable)
       OR v_call.transport_provider NOT IN ('webrtc', 'agora') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PROVIDER_MISMATCH',
        'message', 'الطرف الآخر يستخدم إصدارًا لا يدعم Agora؛ لم يتم بدء المكالمة'
      );
    END IF;
  ELSIF v_call.transport_provider <> 'webrtc' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROVIDER_MISMATCH',
      'message', 'الطرف الآخر يستخدم مزوّد اتصال مختلفًا؛ لم يتم بدء المكالمة'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.active_sessions s
    WHERE s.user_id = auth.uid()
      AND s.is_connected = true
      AND s.last_heartbeat > now() - interval '90 seconds'
  ) OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = auth.uid()
      AND b.session_status = 'in_progress'
      AND b.status = 'confirmed'::public.booking_status
  ) THEN
    UPDATE public.internal_calls
      SET status = 'busy', ended_at = now(), end_reason = 'student_in_session', updated_at = now()
      WHERE id = p_call_id RETURNING * INTO v_call;
    RETURN jsonb_build_object('success', false, 'code', 'STUDENT_BUSY', 'message', 'لا يمكن الرد أثناء وجودك في حصة', 'call', to_jsonb(v_call));
  END IF;

  UPDATE public.internal_calls
    SET transport_provider = v_selected_provider,
        status = 'connecting',
        accepted_at = now(),
        max_ends_at = now() + interval '2 minutes',
        updated_at = now()
    WHERE id = p_call_id
    RETURNING * INTO v_call;
  RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
END;
$$;

REVOKE ALL ON FUNCTION public.respond_internal_call(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_internal_call(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_internal_call(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_internal_call(uuid, boolean, text) TO authenticated;
