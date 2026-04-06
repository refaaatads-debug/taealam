
-- Add file columns to support_messages
ALTER TABLE public.support_messages
ADD COLUMN file_url text,
ADD COLUMN file_name text,
ADD COLUMN file_type text;

-- Create storage bucket for support files
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-files', 'support-files', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Support files are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'support-files');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload support files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'support-files' AND auth.role() = 'authenticated');
