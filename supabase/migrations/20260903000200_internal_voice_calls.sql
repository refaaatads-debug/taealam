CREATE TABLE IF NOT EXISTS public.internal_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'connecting', 'connected', 'rejected', 'busy', 'cancelled', 'missed', 'ended', 'failed')),
  accepted_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds'),
  max_ends_at timestamptz,
  end_reason text,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_calls_callee_active
  ON public.internal_calls (callee_id, created_at DESC)
  WHERE status IN ('ringing', 'connecting', 'connected');
CREATE INDEX IF NOT EXISTS idx_internal_calls_caller_active
  ON public.internal_calls (caller_id, created_at DESC)
  WHERE status IN ('ringing', 'connecting', 'connected');

ALTER TABLE public.internal_calls ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.internal_calls TO authenticated;

DROP POLICY IF EXISTS "Call participants can view internal calls" ON public.internal_calls;
CREATE POLICY "Call participants can view internal calls"
ON public.internal_calls FOR SELECT TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

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
  v_call public.internal_calls;
BEGIN
  IF v_teacher_id IS NULL OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'هذه الخدمة متاحة للمعلمين فقط');
  END IF;
  IF p_student_id IS NULL OR p_student_id = v_teacher_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STUDENT', 'message', 'بيانات الطالب غير صحيحة');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.teacher_id = v_teacher_id
      AND b.student_id = p_student_id
      AND b.status <> 'cancelled'::public.booking_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'BOOKING_NOT_FOUND', 'message', 'لا توجد حصة تربطك بهذا الطالب');
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
  VALUES (v_teacher_id, p_student_id, p_booking_id)
  RETURNING * INTO v_call;

  RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_internal_call(
  p_call_id uuid,
  p_accept boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.internal_calls;
BEGIN
  SELECT * INTO v_call FROM public.internal_calls WHERE id = p_call_id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.mark_internal_call_connected(
  p_call_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.internal_calls;
BEGIN
  UPDATE public.internal_calls
    SET status = 'connected',
        connected_at = COALESCE(connected_at, now()),
        updated_at = now()
    WHERE id = p_call_id
      AND auth.uid() IN (caller_id, callee_id)
      AND status IN ('connecting', 'connected')
    RETURNING * INTO v_call;
  RETURN jsonb_build_object('success', v_call.id IS NOT NULL, 'call', to_jsonb(v_call));
END;
$$;

CREATE OR REPLACE FUNCTION public.end_internal_call(
  p_call_id uuid,
  p_reason text DEFAULT 'participant_ended'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.internal_calls;
  v_status text;
BEGIN
  SELECT * INTO v_call FROM public.internal_calls WHERE id = p_call_id FOR UPDATE;
  IF v_call.id IS NULL OR auth.uid() NOT IN (v_call.caller_id, v_call.callee_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF v_call.status NOT IN ('ringing', 'connecting', 'connected') THEN
    RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
  END IF;
  v_status := CASE WHEN v_call.status = 'ringing' THEN 'cancelled' ELSE 'ended' END;
  UPDATE public.internal_calls
    SET status = v_status,
        ended_at = now(),
        end_reason = left(COALESCE(p_reason, 'participant_ended'), 80),
        duration_seconds = CASE
          WHEN connected_at IS NULL THEN 0
          ELSE LEAST(120, GREATEST(0, floor(extract(epoch FROM (now() - connected_at)))::integer))
        END,
        updated_at = now()
    WHERE id = p_call_id
    RETURNING * INTO v_call;
  RETURN jsonb_build_object('success', true, 'call', to_jsonb(v_call));
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_internal_calls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.internal_calls
    SET status = CASE WHEN status = 'ringing' THEN 'missed' ELSE 'ended' END,
        ended_at = now(),
        end_reason = CASE WHEN status = 'ringing' THEN 'ring_timeout' ELSE 'time_limit' END,
        duration_seconds = CASE
          WHEN connected_at IS NULL THEN 0
          ELSE LEAST(120, GREATEST(0, floor(extract(epoch FROM (now() - connected_at)))::integer))
        END,
        updated_at = now()
    WHERE (status = 'ringing' AND expires_at <= now())
       OR (status IN ('connecting', 'connected') AND max_ends_at IS NOT NULL AND max_ends_at <= now())
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.start_internal_call(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_internal_call(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_internal_call_connected(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_internal_call(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_internal_calls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_internal_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_internal_call(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_internal_call_connected(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_internal_call(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_internal_calls() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'internal_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_calls;
  END IF;
END $$;

ALTER TABLE public.internal_calls REPLICA IDENTITY FULL;
NOTIFY pgrst, 'reload schema';