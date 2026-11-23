-- Server-side read receipts for chat messages (two-check state in the mobile app).
-- Reversible: DROP TABLE public.chat_message_reads;
CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reader_id)
);

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

-- A reader records only their own reads, and only for messages of a booking they take part in.
CREATE POLICY "Readers record their own reads" ON public.chat_message_reads
FOR INSERT WITH CHECK (
  reader_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chat_messages m
    JOIN public.bookings b ON b.id = m.booking_id
    WHERE m.id = message_id
      AND m.sender_id <> auth.uid()
      AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
);

-- Both people in the booking can see the receipts.
CREATE POLICY "Participants view read receipts" ON public.chat_message_reads
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages m
    JOIN public.bookings b ON b.id = m.booking_id
    WHERE m.id = message_id
      AND (b.student_id = auth.uid() OR b.teacher_id = auth.uid())
  )
);

-- The VPS needs explicit grants for new tables.
GRANT SELECT, INSERT ON public.chat_message_reads TO authenticated;
GRANT ALL ON public.chat_message_reads TO service_role;

CREATE INDEX IF NOT EXISTS idx_chat_message_reads_message ON public.chat_message_reads(message_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads;
