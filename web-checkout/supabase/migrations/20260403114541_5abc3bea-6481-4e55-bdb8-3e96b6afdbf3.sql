
ALTER TABLE public.booking_requests
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;

-- Set default for new rows: 2 minutes from creation
UPDATE public.booking_requests SET expires_at = created_at + interval '2 minutes' WHERE expires_at IS NULL;

ALTER TABLE public.booking_requests ALTER COLUMN expires_at SET DEFAULT (now() + interval '2 minutes');
