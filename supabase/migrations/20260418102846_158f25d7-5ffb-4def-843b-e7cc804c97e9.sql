-- Simplify session-recordings storage policies to use path-based ownership
DROP POLICY IF EXISTS "Session participants can upload recordings" ON storage.objects;
DROP POLICY IF EXISTS "Session participants can update recordings" ON storage.objects;
DROP POLICY IF EXISTS "Session recording participants can read" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own recordings" ON storage.objects;

-- INSERT: authenticated user can upload to their own folder (first path segment = user id)
CREATE POLICY "Users can upload own session recordings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'session-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE: same condition
CREATE POLICY "Users can update own session recordings"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'session-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- SELECT: bucket is public, but add explicit policy for authenticated participants
CREATE POLICY "Authenticated users can read session recordings"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'session-recordings');

-- DELETE: own recordings
CREATE POLICY "Users can delete own session recordings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);