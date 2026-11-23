
-- Fix views to use SECURITY INVOKER
ALTER VIEW public.public_teacher_profiles SET (security_invoker = on);
ALTER VIEW public.public_profiles SET (security_invoker = on);
