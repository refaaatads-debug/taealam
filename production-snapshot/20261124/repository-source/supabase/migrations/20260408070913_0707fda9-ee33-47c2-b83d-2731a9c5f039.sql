
-- 1) ai_logs: Remove permissive INSERT policies
DROP POLICY IF EXISTS "Service can insert ai_logs" ON public.ai_logs;
DROP POLICY IF EXISTS "Anon can insert ai_logs" ON public.ai_logs;

-- ai_logs: Only allow inserts from service_role (triggers/edge functions)
-- No authenticated/anon INSERT policy = only service_role can insert

-- 2) session_materials: Remove permissive INSERT policy
DROP POLICY IF EXISTS "Service can insert materials" ON public.session_materials;

-- session_materials: Allow insert only if user is the teacher or student
CREATE POLICY "Teachers or students can insert materials"
ON public.session_materials FOR INSERT TO authenticated
WITH CHECK (auth.uid() = teacher_id OR auth.uid() = student_id);

-- 3) notifications: Remove permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- notifications: No user-facing INSERT policy = only service_role/triggers can insert

-- 4) system_logs: Remove permissive INSERT policy  
DROP POLICY IF EXISTS "Service can insert logs" ON public.system_logs;

-- system_logs: No user-facing INSERT policy = only service_role/triggers can insert
