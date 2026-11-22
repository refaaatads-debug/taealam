BEGIN;
DROP POLICY IF EXISTS notifications_insert_checked ON public.notifications;
CREATE POLICY notifications_insert_own_or_admin ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP FUNCTION IF EXISTS public.can_notify(uuid,uuid,text);
COMMIT;
