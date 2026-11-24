-- Auto-claim ticket on first admin reply + lock to assigned admin
CREATE OR REPLACE FUNCTION public.enforce_ticket_assignment_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _assigned uuid;
BEGIN
  -- Only enforce for admin replies
  IF NEW.is_admin IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Verify sender actually has admin role (defense in depth)
  SELECT public.has_role(NEW.sender_id, 'admin'::app_role) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Only admins can post admin replies';
  END IF;

  -- Lock the ticket row to prevent race conditions between concurrent admin replies
  SELECT assigned_to INTO _assigned
  FROM public.support_tickets
  WHERE id = NEW.ticket_id
  FOR UPDATE;

  IF _assigned IS NULL THEN
    -- First admin reply: auto-claim the ticket
    UPDATE public.support_tickets
       SET assigned_to = NEW.sender_id,
           assigned_at = now(),
           status = CASE WHEN status = 'closed' THEN status ELSE 'in_progress' END
     WHERE id = NEW.ticket_id;
  ELSIF _assigned <> NEW.sender_id THEN
    -- Ticket is locked to another admin
    RAISE EXCEPTION 'TICKET_LOCKED: هذه التذكرة يتابعها موظف آخر — لا يمكنك الرد عليها' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ticket_assignment ON public.support_messages;
CREATE TRIGGER trg_enforce_ticket_assignment
BEFORE INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ticket_assignment_on_reply();