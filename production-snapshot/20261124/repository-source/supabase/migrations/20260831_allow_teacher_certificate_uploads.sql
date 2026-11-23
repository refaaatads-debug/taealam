-- Allow authenticated users to upload certificate files only inside their own namespace.
-- The application stores these files as certificates/<auth.uid()>/<filename>.
DROP POLICY IF EXISTS "Teachers can upload own certificates" ON storage.objects;

CREATE POLICY "Teachers can upload own certificates"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-files'
  AND (storage.foldername(name))[1] = 'certificates'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);
