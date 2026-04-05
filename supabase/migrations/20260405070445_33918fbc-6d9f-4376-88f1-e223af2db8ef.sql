
-- Add file attachment columns to chat_messages
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS file_url text,
ADD COLUMN IF NOT EXISTS file_name text,
ADD COLUMN IF NOT EXISTS file_type text;

-- Create storage bucket for chat files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat files
CREATE POLICY "Authenticated users can upload chat files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-files');

CREATE POLICY "Anyone can view chat files"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-files');

-- Update default duration to 45 minutes
ALTER TABLE public.booking_requests ALTER COLUMN duration_minutes SET DEFAULT 45;
ALTER TABLE public.bookings ALTER COLUMN duration_minutes SET DEFAULT 45;
