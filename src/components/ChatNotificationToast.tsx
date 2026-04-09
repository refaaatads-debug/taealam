import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatToast {
  id: string;
  bookingId: string;
  senderName: string;
  content: string;
}

export default function ChatNotificationToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { play } = useNotificationSound();
  const [toasts, setToasts] = useState<ChatToast[]>([]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("global-chat-notifications")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, async (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id === user.id) return;

        // Don't notify if already on chat page for this booking
        const params = new URLSearchParams(location.search);
        if (location.pathname === "/chat" && params.get("booking") === msg.booking_id) return;

        // If on live session with chat open, skip toast
        if (location.pathname === "/live-session") {
          const lsParams = new URLSearchParams(location.search);
          if (lsParams.get("booking") === msg.booking_id) {
            // Don't show toast if chat panel is already open in session
            // The realtime listener in LiveSession handles this
            return;
          }
        }

        const { data: booking } = await supabase
          .from("bookings")
          .select("id, student_id, teacher_id")
          .eq("id", msg.booking_id)
          .single();

        if (!booking) return;
        if (booking.student_id !== user.id && booking.teacher_id !== user.id) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", msg.sender_id)
          .single();

        const senderName = profile?.full_name || "مستخدم";
        const content = msg.file_url ? "📎 ملف مرفق" : (msg.content?.substring(0, 80) || "رسالة جديدة");

        play();

        const toastId = msg.id;
        setToasts(prev => [...prev.slice(-2), { id: toastId, bookingId: msg.booking_id, senderName, content }]);

        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toastId));
        }, 6000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, location.pathname, location.search]);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const openChat = (toast: ChatToast) => {
    dismissToast(toast.id);

    // If currently in a live session, open the chat panel instead of navigating away
    if (location.pathname === "/live-session") {
      window.dispatchEvent(new CustomEvent("open-session-chat"));
      return;
    }

    navigate(`/chat?booking=${toast.bookingId}`);
  };

  return (
    <div className="fixed bottom-20 left-4 z-50 flex flex-col gap-2 max-w-xs" dir="rtl">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -100, scale: 0.9 }}
            className="bg-card border shadow-lg rounded-xl p-3 cursor-pointer hover:shadow-xl transition-shadow"
            onClick={() => openChat(t)}
          >
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{t.senderName}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.content}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismissToast(t.id); }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
