CREATE OR REPLACE FUNCTION public.filter_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip filtering for messages that are file attachments (have a file_url)
  IF NEW.file_url IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.content ~ '\d{7,}' OR NEW.content ~ 'https?://' OR NEW.content ~ 'www\.' OR NEW.content ~ '@[a-zA-Z0-9]' OR NEW.content ~ '\+\d{8,}' THEN
    NEW.is_filtered = true;
    NEW.content = '⚠️ تم حجب هذه الرسالة - لا يُسمح بمشاركة أرقام أو روابط أو بريد إلكتروني';

    -- Track violations (runs as definer, bypasses RLS on user_warnings)
    BEGIN
      INSERT INTO public.user_warnings (user_id, warning_type, description, warning_count)
      VALUES (NEW.sender_id, 'chat_violation', 'محاولة مشاركة معلومات اتصال', 1)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Never block the message because of warning insert failure
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;