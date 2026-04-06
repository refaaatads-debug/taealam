
-- Create storage bucket for session recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('session-recordings', 'session-recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload recordings
CREATE POLICY "Users can upload session recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'session-recordings');

-- Allow public read access to recordings
CREATE POLICY "Session recordings are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'session-recordings');

-- Allow users to delete their own recordings (cleanup)
CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'session-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
