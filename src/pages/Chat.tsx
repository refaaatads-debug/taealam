import { useState, useEffect, useRef } from "react";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ArrowRight, MessageSquare, Loader2, Paperclip, FileText, Image, Download, ClipboardList } from "lucide-react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import CallStudentButton from "@/components/teacher/CallStudentButton";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoicePlayer from "@/components/VoicePlayer";

const isImageType = (t?: string | null) => !!t && t.startsWith("image/");
const isPdfType = (t?: string | null, n?: string | null) =>
  t === "application/pdf" || (!!n && n.toLowerCase().endsWith(".pdf"));

interface ChatMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  content: string;
  is_filtered: boolean;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
}

const Chat = () => {
  const { user, roles } = useAuth();
  const dashboardPath = roles?.includes("teacher") ? "/teacher" : "/student";
  const { play: playNotificationSound } = useNotificationSound();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookingId = searchParams.get("booking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [otherName, setOtherName] = useState("المحادثة");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(true);
  const [isStudent, setIsStudent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [allBookingIds, setAllBookingIds] = useState<string[]>([]);

  useEffect(() => {
    if (!bookingId || !user) return;

    const fetchBookingInfo = async () => {
      const { data: booking } = await supabase
        .from("bookings")
        .select("student_id, teacher_id")
        .eq("id", bookingId)
        .single();
      
      if (booking) {
        const isUserStudent = booking.student_id === user.id;
        setIsStudent(isUserStudent);
        const otherId = isUserStudent ? booking.teacher_id : booking.student_id;
        const { data: profile } = await supabase
          .from("public_profiles")
          .select("full_name")
          .eq("user_id", otherId)
          .single();
        if (profile) setOtherName(profile.full_name || "المحادثة");

        // Check student subscription status
        if (isUserStudent) {
          const { data: sub } = await supabase
            .from("user_subscriptions")
            .select("id, remaining_minutes, is_active")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .gt("remaining_minutes", 0)
            .limit(1);
          setHasActiveSubscription(!!(sub && sub.length > 0));
        }

        // Get ALL booking IDs between this pair for unified chat
        const { data: pairBookings } = await supabase
          .from("bookings")
          .select("id")
          .or(`and(student_id.eq.${booking.student_id},teacher_id.eq.${booking.teacher_id}),and(student_id.eq.${booking.teacher_id},teacher_id.eq.${booking.student_id})`);
        
        const ids = pairBookings?.map(b => b.id) || [bookingId];
        setAllBookingIds(ids);

        // Fetch messages from ALL bookings between this pair
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("*")
          .in("booking_id", ids)
          .gte("created_at", oneYearAgo.toISOString())
          .order("created_at", { ascending: true });
        if (msgs) setMessages(msgs as ChatMessage[]);
        setLoading(false);
      }
    };

    fetchBookingInfo();

    // Listen for new messages globally (filter by pair in handler)
    const channel = supabase
      .channel(`unified-chat-${bookingId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, (payload) => {
        const newMsg = payload.new as ChatMessage;
        setAllBookingIds(currentIds => {
          if (!currentIds.includes(newMsg.booking_id)) return currentIds;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            if (newMsg.sender_id !== user?.id) {
              playNotificationSound();
            }
            return [...prev, newMsg];
          });
          return currentIds;
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
    if (isStudent && !hasActiveSubscription) {
      toast.error("يجب تفعيل باقة للتمكن من إرسال الرسائل");
      return;
    }
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
      } catch {
        // Non-critical
      }
    }
    setSending(false);
  };

  const uploadAndSendFile = async (file: File) => {
    if (!bookingId || !user) return;
    if (isStudent && !hasActiveSubscription) {
      toast.error("يجب تفعيل باقة للتمكن من إرسال الملفات");
      return;
    }

    const isAudio = file.type.startsWith("audio/");
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!isAudio && !allowedTypes.includes(file.type)) {
      toast.error("يُسمح فقط بملفات PDF و JPG و PNG والرسائل الصوتية");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن لا يتجاوز 10 ميجابايت");
      return;
    }

    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const filePath = `${bookingId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-files")
        .upload(filePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(uploadError.message || "فشل رفع الملف إلى التخزين");
      }

      const { data: urlData } = supabase.storage
        .from("chat-files")
        .getPublicUrl(filePath);

      const safeContent = isAudio
        ? "🎤 رسالة صوتية"
        : isImageType(file.type)
          ? "📷 صورة مرفقة"
          : isPdfType(file.type, file.name)
            ? "📄 ملف PDF مرفق"
            : "📎 ملف مرفق";

      const { error: msgError } = await supabase.from("chat_messages").insert({
        booking_id: bookingId,
        sender_id: user.id,
        content: safeContent,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type,
      });

      if (msgError) {
        console.error("Insert chat_messages error:", msgError);
        throw new Error(msgError.message || "فشل إرسال رسالة الملف");
      }
      toast.success(isAudio ? "تم إرسال الرسالة الصوتية" : "تم إرسال الملف بنجاح");
    } catch (err: any) {
      console.error("File upload failure:", err);
      toast.error(err?.message || "فشل في رفع الملف");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadAndSendFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const renderFileMessage = (msg: ChatMessage) => {
    if (!msg.file_url) return null;
    const isAudio = msg.file_type?.startsWith("audio/");
    const isImg = msg.file_type?.startsWith("image/");
    const isPdf = msg.file_type === "application/pdf" || msg.file_name?.endsWith(".pdf");
    const isMe = msg.sender_id === user?.id;

    if (isAudio) return <VoicePlayer url={msg.file_url} />;

    if (isImg) {
      return (
        <div className="mt-2 space-y-1">
          <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
            <img src={msg.file_url} alt={msg.file_name || "صورة"} className="max-w-[220px] rounded-lg border border-border/30" loading="lazy" />
          </a>
          <a href={msg.file_url} download={msg.file_name || "image"} target="_blank" rel="noopener noreferrer"
            className={`flex items-center gap-1 text-[11px] ${isMe ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Download className="h-3 w-3" /> تحميل الصورة
          </a>
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className="mt-2 space-y-2">
          <iframe src={msg.file_url} className="w-full h-48 rounded-lg border border-border/30 bg-background" title={msg.file_name || "PDF"} />
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="text-xs truncate flex-1">{msg.file_name || "ملف PDF"}</span>
            <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
              className={`text-[11px] underline shrink-0 ${isMe ? "text-primary-foreground/80" : "text-primary"}`}>فتح</a>
            <a href={msg.file_url} download={msg.file_name || "file.pdf"} target="_blank" rel="noopener noreferrer"
              className={`shrink-0 ${isMe ? "text-primary-foreground/80" : "text-primary"}`}>
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className={`mt-2 flex items-center gap-2 rounded-xl px-3 py-2 ${isMe ? "bg-primary-foreground/10" : "bg-background/50"}`}>
        <FileText className="h-5 w-5 shrink-0" />
        <span className="text-xs truncate flex-1">{msg.file_name || "ملف"}</span>
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
          className={`text-[11px] underline shrink-0 ${isMe ? "text-primary-foreground/80" : "text-primary"}`}>فتح</a>
        <a href={msg.file_url} download={msg.file_name || "file"} target="_blank" rel="noopener noreferrer"
          className={`shrink-0 ${isMe ? "text-primary-foreground/80" : "text-primary"}`}>
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  };

  if (!bookingId) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">لا توجد محادثة</h2>
          <p className="text-muted-foreground mb-4">يتم إنشاء المحادثة تلقائياً عند قبول الحجز</p>
          <Button asChild><Link to={dashboardPath}>العودة للوحة التحكم</Link></Button>
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
          <Link to={dashboardPath}><ArrowRight className="h-5 w-5" /></Link>
        </Button>
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-foreground text-sm">{otherName}</p>
          <p className="text-xs text-muted-foreground">محادثة الحصة</p>
        </div>
        {!isStudent && bookingId && (
          <CallStudentButton bookingId={bookingId} variant="outline" size="sm" />
        )}
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
            // Detect assignment marker [[ASSIGNMENT:/path]]
            const assignMatch = !msg.is_filtered && msg.content?.match(/^\[\[ASSIGNMENT:([^\]]+)\]\]\s*([\s\S]*)$/);
            if (assignMatch) {
              const target = assignMatch[1];
              const body = assignMatch[2].trim();
              const lines = body.split("\n");
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
                  <button
                    onClick={() => navigate(target)}
                    className={`max-w-[75%] text-right rounded-2xl p-3 border-2 transition hover:scale-[1.02] active:scale-[0.99] ${
                      isMe
                        ? "bg-primary/10 border-primary/40 hover:bg-primary/15"
                        : "bg-secondary/10 border-secondary/40 hover:bg-secondary/15"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-primary">واجب جديد</span>
                    </div>
                    {lines.map((l, i) => (
                      <p key={i} className={`text-sm leading-relaxed ${i === 0 ? "font-bold" : "text-muted-foreground"}`}>{l}</p>
                    ))}
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">
                      اضغط لفتح الواجب <ArrowRight className="h-3 w-3 rotate-180" />
                    </div>
                    <p className={`text-[10px] mt-1 ${isMe ? "text-muted-foreground" : "text-muted-foreground"}`}>
                      {new Date(msg.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                </div>
              );
            }
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
                  {renderFileMessage(msg)}
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
        {isStudent && !hasActiveSubscription ? (
          <div className="flex items-center justify-center gap-3 max-w-3xl mx-auto py-2">
            <p className="text-sm text-destructive font-medium">⚠️ يجب تفعيل باقة للتمكن من إرسال الرسائل</p>
            <Button size="sm" asChild className="rounded-xl">
              <Link to="/pricing">تفعيل باقة</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2 max-w-3xl mx-auto"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="rounded-xl shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <VoiceRecorder onRecorded={uploadAndSendFile} disabled={uploading || (isStudent && !hasActiveSubscription)} />
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
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Chat;
