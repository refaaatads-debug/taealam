import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useUnreadMessages(bookingIds: string[]) {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user || bookingIds.length === 0) return;

    const fetchCounts = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("booking_id, id")
        .in("booking_id", bookingIds)
        .neq("sender_id", user.id);

      if (!data) return;

      const counts: Record<string, number> = {};
      data.forEach((m) => {
        counts[m.booking_id] = (counts[m.booking_id] || 0) + 1;
      });
      setUnreadCounts(counts);
    };

    fetchCounts();

    const channel = supabase
      .channel("unread-messages-" + bookingIds.slice(0, 3).join("-"))
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id !== user.id && bookingIds.includes(msg.booking_id)) {
          setUnreadCounts(prev => ({
            ...prev,
            [msg.booking_id]: (prev[msg.booking_id] || 0) + 1,
          }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, bookingIds.join(",")]);

  return unreadCounts;
}