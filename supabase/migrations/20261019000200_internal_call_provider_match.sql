CREATE OR REPLACE FUNCTION public.respond_internal_call(
  p_call_id uuid,
  p_accept boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Legacy/mobile clients identify as WebRTC; never let them accept an Agora-pinned call.
  RETURN public.respond_internal_call(p_call_id, p_accept, 'webrtc');
END;
$$;

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

  IF v_call.transport_provider IS DISTINCT FROM p_transport_provider THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROVIDER_MISMATCH',
      'message', 'استخدم الطرف الآخر مزوّد اتصال مختلفًا؛ لم يتم بدء المكالمة'
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
    SET status = 'connecting',
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
