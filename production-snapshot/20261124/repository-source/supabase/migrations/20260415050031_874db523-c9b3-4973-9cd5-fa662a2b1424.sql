
-- Fix chat-files upload policy to require authentication
DROP POLICY IF EXISTS "Authenticated users can upload chat files" ON storage.objects;

CREATE POLICY "Authenticated users can upload chat files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'chat-files'
  AND auth.role() = 'authenticated'
);

-- Fix duplicate session-recordings upload policy
DROP POLICY IF EXISTS "Users can upload session recordings" ON storage.objects;
