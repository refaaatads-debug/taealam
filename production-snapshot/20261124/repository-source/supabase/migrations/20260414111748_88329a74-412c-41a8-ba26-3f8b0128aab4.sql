
-- 1. Move extensions from public to extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move uuid-ossp if it exists in public
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp' AND extnamespace = 'public'::regnamespace) THEN
    ALTER EXTENSION "uuid-ossp" SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not move uuid-ossp: %', SQLERRM;
END $$;

-- Move pgcrypto if it exists in public  
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto' AND extnamespace = 'public'::regnamespace) THEN
    ALTER EXTENSION "pgcrypto" SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not move pgcrypto: %', SQLERRM;
END $$;

-- 2. Fix public bucket listing - replace broad SELECT with path-scoped policies

-- Drop old broad SELECT policies for public buckets
DROP POLICY IF EXISTS "Site assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat files" ON storage.objects;
DROP POLICY IF EXISTS "Support files are publicly readable" ON storage.objects;

-- Site assets: allow reading individual files but not listing
CREATE POLICY "Site assets readable by path" ON storage.objects
FOR SELECT USING (
  bucket_id = 'site-assets'
  AND (name IS NOT NULL AND name != '')
);

-- Chat files: only booking participants can read
CREATE POLICY "Chat file participants can read" ON storage.objects
FOR SELECT USING (
  bucket_id = 'chat-files'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.chat_messages cm
    JOIN public.bookings b ON b.id = cm.booking_id
    WHERE cm.file_url LIKE '%' || storage.objects.name || '%'
    AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
);

-- Admins can read all chat files
CREATE POLICY "Admins can read chat files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'chat-files'
  AND public.has_role(auth.uid(), 'admin')
);

-- Support files: only ticket owner and admins
CREATE POLICY "Support file owner can read" ON storage.objects
FOR SELECT USING (
  bucket_id = 'support-files'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.support_messages sm
    JOIN public.support_tickets st ON st.id = sm.ticket_id
    WHERE sm.file_url LIKE '%' || storage.objects.name || '%'
    AND st.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can read support files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'support-files'
  AND public.has_role(auth.uid(), 'admin')
);
