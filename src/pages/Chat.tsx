import { useState, useEffect, useRef } from "react";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ArrowRight, MessageSquare, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";

interface ChatMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  content: string;
  is_filtered: boolean;
  created_at: string;
}

const Chat = () => {
  const { user } = useAuth();
  const { play: playNotificationSound } = useNotificationSound();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [otherName, setOtherName] = useState("المحادثة");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingId || !user) return;

    // Fetch booking info to get the other party's name
    const fetchBookingInfo = async () => {
      const { data: booking } = await supabase
        .from("bookings")
        .select("student_id, teacher_id")
        .eq("id", bookingId)
        .single();
      
      if (booking) {
        const otherId = booking.student_id === user.id ? booking.teacher_id : booking.student_id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", otherId)
          .single();
        if (profile) setOtherName(profile.full_name || "المحادثة");
      }
    };

    // Fetch existing messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
      setLoading(false);
    };

    fetchBookingInfo();
    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${bookingId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        const newMsg = payload.new as ChatMessage;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookingId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !bookingId || !user || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("chat_messages").insert({
      booking_id: bookingId,
      sender_id: user.id,
      content,
    });

    if (error) {
      setNewMessage(content);
    } else {
      // Send notification to the other party
      try {
        const { data: booking } = await supabase
          .from("bookings")
          .select("student_id, teacher_id")
          .eq("id", bookingId)
          .single();
        if (booking) {
          const recipientId = booking.student_id === user.id ? booking.teacher_id : booking.student_id;
          await supabase.from("notifications").insert({
            user_id: recipientId,
            title: "رسالة جديدة 💬",
            body: content.length > 50 ? content.slice(0, 50) + "..." : content,
            type: "chat_message",
          });
        }
      } catch (e) {
        // Non-critical, ignore
      }
    }
    setSending(false);
  };

  if (!bookingId) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">لا توجد محادثة</h2>
          <p className="text-muted-foreground mb-4">يتم إنشاء المحادثة تلقائياً عند قبول الحجز</p>
          <Button asChild><Link to="/student">العودة للوحة التحكم</Link></Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />
      
      {/* Chat Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-16 z-40">
        <Button variant="ghost" size="icon" className="rounded-xl shrink-0" asChild>
          <Link to="/student"><ArrowRight className="h-5 w-5" /></Link>
        </Button>
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-bold text-foreground text-sm">{otherName}</p>
          <p className="text-xs text-muted-foreground">محادثة الحصة</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">ابدأ المحادثة! 👋</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  msg.is_filtered
                    ? "bg-destructive/10 border border-destructive/20"
                    : isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                }`}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-card border-t p-3 z-40">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2 max-w-3xl mx-auto"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="اكتب رسالتك..."
            className="rounded-xl flex-1"
            dir="rtl"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-xl shrink-0"
            disabled={!newMessage.trim() || sending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <BottomNav />
    </div>
  );
};

export default Chat;
