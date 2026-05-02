import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ArrowRight, MessageSquare, Loader2, Plus, Clock, Paperclip, FileText, Image as ImageIcon, X, Download, Sparkles, Headphones } from "lucide-react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoicePlayer from "@/components/VoicePlayer";
import AIAssistantChat from "@/components/support/AIAssistantChat";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  category: string;
  created_at: string;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  content: string;
  is_admin: boolean;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
}

const SupportChat = () => {
  const { user, roles } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const ticketId = searchParams.get("ticket");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { play: playSupportSound } = useNotificationSound();

  const backPath = roles.includes("teacher") ? "/teacher" : "/student";

  useEffect(() => {
    if (!user) return;
    fetchTickets();
  }, [user]);

  useEffect(() => {
    if (!ticketId || !user) return;
    fetchMessages();
    const channel = supabase
      .channel(`support-${ticketId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          if (msg.sender_id !== user?.id) playSupportSound();
          return [...prev, msg];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from("support_tickets").select("*")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false });
    if (data) setTickets(data as Ticket[]);
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("support_messages").select("*")
      .eq("ticket_id", ticketId!)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  const createTicket = async () => {
    if (!newSubject.trim() || !user) return;
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject: newSubject.trim() })
      .select().single();
    if (error) { toast.error("فشل في إنشاء التذكرة"); return; }
    if (data) {
      setSearchParams({ ticket: data.id });
      setNewSubject("");
      setShowNewTicket(false);
      fetchTickets();
      toast.success("تم إنشاء تذكرة الدعم");
    }
  };

  const createTicketFromAI = async (subject: string, conversationLog: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject })
      .select().single();
    if (error || !data) { toast.error("فشل في إنشاء التذكرة"); return; }
    // Seed first message with conversation context
    await supabase.from("support_messages").insert({
      ticket_id: data.id,
      sender_id: user.id,
      content: `📋 محادثة سابقة مع المساعد الذكي:\n\n${conversationLog}`,
      is_admin: false,
    });
    setSearchParams({ ticket: data.id });
    fetchTickets();
    toast.success("تم تحويل المحادثة لفريق الدعم");
  };

  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    const ext = file.name.split('.').pop();
    const path = `${ticketId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("support-files").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) { toast.error("فشل في رفع الملف"); return null; }
    const { data: urlData } = supabase.storage.from("support-files").getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name, type: file.type };
  };

  const sendVoiceMessage = async (file: File) => {
    if (!ticketId || !user) return;
    setSending(true);
    const fileData = await uploadFile(file);
    if (!fileData) { setSending(false); return; }
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: ticketId, sender_id: user.id, content: "🎤 رسالة صوتية", is_admin: false,
      file_url: fileData.url, file_name: fileData.name, file_type: fileData.type,
    });
    if (error) toast.error("فشل في إرسال الرسالة الصوتية");
    setSending(false);
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !selectedFile) || !ticketId || !user || sending) return;
    setSending(true);
    const content = newMessage.trim() || (selectedFile ? `📎 ${selectedFile.name}` : "");
    setNewMessage("");

    let fileData: { url: string; name: string; type: string } | null = null;
    if (selectedFile) {
      fileData = await uploadFile(selectedFile);
      if (!fileData) { setSending(false); return; }
      setSelectedFile(null);
    }

    const { error } = await supabase.from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content,
      is_admin: false,
      ...(fileData && { file_url: fileData.url, file_name: fileData.name, file_type: fileData.type }),
    });

    if (error) {
      setNewMessage(content);
      toast.error("فشل في إرسال الرسالة");
    }
    setSending(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("الحد الأقصى 10 ميجابايت"); return; }
    setSelectedFile(file);
  };

  const isImage = (type?: string | null) => type?.startsWith("image/");

  const renderFileAttachment = (msg: Message) => {
    if (!msg.file_url) return null;
    if (msg.file_type?.startsWith("audio/")) return <VoicePlayer url={msg.file_url} />;
    const isMe = !msg.is_admin;
    const isPdf = msg.file_type === "application/pdf" || msg.file_name?.endsWith(".pdf");
    if (isImage(msg.file_type)) {
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

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      open: { label: "مفتوحة", variant: "default" },
      in_progress: { label: "قيد المعالجة", variant: "secondary" },
      closed: { label: "مغلقة", variant: "destructive" },
    };
    const s = map[status] || map.open;
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  // Ticket list view + AI Assistant tabs
  if (!ticketId) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
          <div className="flex items-center gap-3 mb-5">
            <Button variant="ghost" size="icon" className="rounded-xl" asChild>
              <Link to={backPath}><ArrowRight className="h-5 w-5" /></Link>
            </Button>
            <h1 className="text-xl font-bold text-foreground">مركز الدعم</h1>
          </div>

          <Tabs defaultValue="ai" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 rounded-xl">
              <TabsTrigger value="ai" className="rounded-lg gap-1.5">
                <Sparkles className="h-4 w-4" /> مساعد ذكي
              </TabsTrigger>
              <TabsTrigger value="human" className="rounded-lg gap-1.5">
                <Headphones className="h-4 w-4" /> فريق الدعم
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="mt-0">
              <Card className="overflow-hidden">
                <AIAssistantChat onCreateTicket={createTicketFromAI} />
              </Card>
            </TabsContent>

            <TabsContent value="human" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">تذاكرك مع فريق الدعم</p>
                <Button onClick={() => setShowNewTicket(true)} size="sm" className="rounded-xl gap-1">
                  <Plus className="h-4 w-4" /> تذكرة جديدة
                </Button>
              </div>

              {showNewTicket && (
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex gap-2">
                      <Input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                        placeholder="عنوان المشكلة أو الاستفسار..." className="rounded-xl flex-1"
                        onKeyDown={e => e.key === "Enter" && createTicket()} />
                      <Button onClick={createTicket} className="rounded-xl">إنشاء</Button>
                      <Button variant="ghost" onClick={() => setShowNewTicket(false)} className="rounded-xl">إلغاء</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-16 w-16 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">لا توجد تذاكر دعم</p>
                  <p className="text-sm text-muted-foreground mt-1">أنشئ تذكرة جديدة للتواصل مع فريق الدعم</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.map(t => (
                    <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSearchParams({ ticket: t.id })}>
                      <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-foreground">{t.subject}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <Clock className="h-3 w-3 inline ml-1" />
                            {new Date(t.created_at).toLocaleDateString("ar-SA")}
                          </p>
                        </div>
                        {statusBadge(t.status)}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Chat view
  const currentTicket = tickets.find(t => t.id === ticketId);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />
      <div className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-16 z-40">
        <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => setSearchParams({})}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-foreground text-sm">{currentTicket?.subject || "خدمة العملاء"}</p>
          <p className="text-xs text-muted-foreground">فريق الدعم الفني</p>
        </div>
        {currentTicket && statusBadge(currentTicket.status)}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">ابدأ المحادثة مع فريق الدعم 👋</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = !msg.is_admin;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}>
                  {msg.is_admin && <p className="text-[10px] font-bold mb-1 text-primary">فريق الدعم</p>}
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  {renderFileAttachment(msg)}
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

      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-card border-t p-3 z-40">
        {selectedFile && (
          <div className="flex items-center gap-2 mb-2 bg-muted rounded-lg px-3 py-2 text-sm max-w-3xl mx-auto">
            {selectedFile.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
            <span className="truncate flex-1 text-foreground">{selectedFile.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedFile(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2 max-w-3xl mx-auto">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileSelect} />
          <Button type="button" variant="ghost" size="icon" className="rounded-xl shrink-0"
            onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <VoiceRecorder onRecorded={sendVoiceMessage} disabled={sending} />
          <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
            placeholder="اكتب رسالتك..." className="rounded-xl flex-1" dir="rtl" />
          <Button type="submit" size="icon" className="rounded-xl shrink-0"
            disabled={(!newMessage.trim() && !selectedFile) || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
      <BottomNav />
    </div>
  );
};

export default SupportChat;
