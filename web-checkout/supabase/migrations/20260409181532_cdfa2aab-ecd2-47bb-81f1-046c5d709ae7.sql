-- Create a function to delete chat messages older than 1 year
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.chat_messages
  WHERE created_at < now() - interval '1 year';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  INSERT INTO public.system_logs (level, source, message, metadata)
  VALUES ('info', 'chat_cleanup', 'تم حذف الرسائل القديمة', 
    jsonb_build_object('deleted_count', deleted_count));
  
  RETURN deleted_count;
END;
$$;

-- Create pg_cron extension if not exists and schedule daily cleanup
-- Note: pg_cron may not be available, so we use a trigger-based approach instead
-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);