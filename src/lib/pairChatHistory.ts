// Preserve server-side pair lookup for large booking histories; retain canonical-query fallback.
export async function loadPairChatHistory(client: any, bookingId: string, studentId: string, teacherId: string) {
  try {
    const [messages, bookings] = await Promise.all([
      client.rpc('get_pair_messages', { p_booking_id: bookingId }),
      client.rpc('get_pair_booking_ids', { p_booking_id: bookingId }),
    ]);
    if (!messages.error && !bookings.error && Array.isArray(messages.data) && Array.isArray(bookings.data)) {
      return { messages: messages.data, bookingIds: [...new Set<string>([bookingId, ...bookings.data.map((r: any) => r.bid).filter((v: unknown): v is string => typeof v === 'string' && !!v)])] };
    }
  } catch { /* An older backend may not expose either RPC yet. */ }
  const result = await client.from('bookings').select('id').eq('student_id', studentId).eq('teacher_id', teacherId);
  if (result.error) throw result.error;
  const ids = [...new Set<string>([bookingId, ...(result.data || []).map((b: any) => b.id)])];
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const messages: any[] = [];
  // Keep URLs bounded even when RPCs are unavailable. Small histories still use one request.
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await client.from('chat_messages').select('*').in('booking_id', ids.slice(i, i + 100)).gte('created_at', cutoff.toISOString()).order('created_at', { ascending: true });
    if (rows.error) throw rows.error;
    messages.push(...(rows.data || []));
  }
  messages.sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return { messages, bookingIds: ids };
}
