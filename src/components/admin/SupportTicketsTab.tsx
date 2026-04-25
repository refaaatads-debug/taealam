import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Loader2, ArrowRight, Clock, User, Paperclip, FileText, Image as ImageIcon, X, Download, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoicePlayer from "@/components/VoicePlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Ticket {
  id: string; user_id: string; subject: string; status: string; category: string; created_at: string; user_name?: string;
}
interface Message {
  id: string; ticket_id: string; sender_id: string; content: string; is_admin: boolean; created_at: string;
  file_url?: string | null; file_name?: string | null; file_type?: string | null;
}

const SupportTicketsTab = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { play: playSupportSound } = useNotificationSound();

  useEffect(() => { fetchTickets(); }, []);

  useEffect(() => {
    if (!selectedTicket) return;
    fetchMessages();
    const channel = supabase
      .channel(`admin-support-${selectedTicket}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${selectedTicket}` },
        (payload) => { const msg = payload.new as Message; setMessages(prev => { if (prev.some(m => m.id === msg.id)) return prev; if (msg.sender_id !== user?.id) playSupportSound(); return [...prev, msg]; }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchTickets = async () => {
    const { data: ticketData } = await supabase.from("support_tickets").select("*").order("updated_at", { ascending: false });
    if (ticketData) {
      const userIds = [...new Set(ticketData.map(t => t.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const nameMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      setTickets(ticketData.map(t => ({ ...t, user_name: nameMap.get(t.user_id) || "مستخدم" })) as Ticket[]);
    }
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selectedTicket!).order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    const ext = file.name.split('.').pop();
    const path = `${selectedTicket}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("support-files").upload(path, file);
    if (error) { toast.error("فشل في رفع الملف"); return null; }
    const { data: urlData } = supabase.storage.from("support-files").getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name, type: file.type };
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !selectedFile) || !selectedTicket || !user || sending) return;
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
      ticket_id: selectedTicket, sender_id: user.id, content, is_admin: true,
      ...(fileData && { file_url: fileData.url, file_name: fileData.name, file_type: fileData.type }),
    });

    if (error) {
      setNewMessage(content);
      toast.error("فشل في إرسال الرسالة");
    } else {
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", selectedTicket);
      const ticket = tickets.find(t => t.id === selectedTicket);
      if (ticket) {
        await supabase.from("notifications").insert({
          user_id: ticket.user_id, title: "رد من خدمة العملاء 💬",
          body: content.length > 50 ? content.slice(0, 50) + "..." : content, type: "support_reply",
        });
      }
    }
    setSending(false);
  };

  const sendVoiceMessage = async (file: File) => {
    if (!selectedTicket || !user) return;
    setSending(true);
    const fileData = await uploadFile(file);
    if (!fileData) { setSending(false); return; }
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedTicket, sender_id: user.id, content: "🎤 رسالة صوتية", is_admin: true,
      file_url: fileData.url, file_name: fileData.name, file_type: fileData.type,
    });
    if (error) toast.error("فشل في إرسال الرسالة الصوتية");
    else {
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", selectedTicket);
      const ticket = tickets.find(t => t.id === selectedTicket);
      if (ticket) await supabase.from("notifications").insert({
        user_id: ticket.user_id, title: "رد من خدمة العملاء 💬", body: "🎤 رسالة صوتية", type: "support_reply",
      });
    }
    setSending(false);
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    await supabase.from("support_tickets").update({ status }).eq("id", ticketId);
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
    toast.success("تم تحديث حالة التذكرة");
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
    const isPdf = msg.file_type === "application/pdf" || msg.file_name?.endsWith(".pdf");
    if (isImage(msg.file_type)) {
      return (
        <div className="mt-2 space-y-1">
          <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
            <img src={msg.file_url} alt={msg.file_name || "صورة"} className="max-w-[220px] rounded-lg border border-border/30" loading="lazy" />
          </a>
          <a href={msg.file_url} download={msg.file_name || "image"} target="_blank" rel="noopener noreferrer"
            className={`flex items-center gap-1 text-[11px] ${msg.is_admin ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
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
              className={`text-[11px] underline shrink-0 ${msg.is_admin ? "text-primary-foreground/80" : "text-primary"}`}>فتح</a>
            <a href={msg.file_url} download={msg.file_name || "file.pdf"} target="_blank" rel="noopener noreferrer"
              className={`shrink-0 ${msg.is_admin ? "text-primary-foreground/80" : "text-primary"}`}>
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className={`mt-2 flex items-center gap-2 rounded-xl px-3 py-2 ${msg.is_admin ? "bg-primary-foreground/10" : "bg-background/50"}`}>
        <FileText className="h-5 w-5 shrink-0" />
        <span className="text-xs truncate flex-1">{msg.file_name || "ملف"}</span>
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
          className={`text-[11px] underline shrink-0 ${msg.is_admin ? "text-primary-foreground/80" : "text-primary"}`}>فتح</a>
        <a href={msg.file_url} download={msg.file_name || "file"} target="_blank" rel="noopener noreferrer"
          className={`shrink-0 ${msg.is_admin ? "text-primary-foreground/80" : "text-primary"}`}>
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  };

  const filteredTickets = filter === "all" ? tickets : tickets.filter(t => t.status === filter);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      open: { label: "مفتوحة", variant: "default" }, in_progress: { label: "قيد المعالجة", variant: "secondary" }, closed: { label: "مغلقة", variant: "destructive" },
    };
    const s = map[status] || map.open;
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (selectedTicket) {
    const ticket = tickets.find(t => t.id === selectedTicket);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => { setSelectedTicket(null); setMessages([]); setSelectedFile(null); }}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <p className="font-bold text-foreground">{ticket?.subject}</p>
            <p className="text-xs text-muted-foreground"><User className="h-3 w-3 inline ml-1" />{ticket?.user_name}</p>
          </div>
          <Select value={ticket?.status} onValueChange={v => updateTicketStatus(selectedTicket, v)}>
            <SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">مفتوحة</SelectItem>
              <SelectItem value="in_progress">قيد المعالجة</SelectItem>
              <SelectItem value="closed">مغلقة</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="h-80 overflow-y-auto space-y-3 mb-4">
              {messages.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">لا توجد رسائل</p>
              ) : messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_admin ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.is_admin ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    {renderFileAttachment(msg)}
                    <p className={`text-[10px] mt-1 ${msg.is_admin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {new Date(msg.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 bg-muted rounded-lg px-3 py-2 text-sm">
                {selectedFile.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                <span className="truncate flex-1 text-foreground">{selectedFile.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedFile(null)}><X className="h-3 w-3" /></Button>
              </div>
            )}
            <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleFileSelect} />
              <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <VoiceRecorder onRecorded={sendVoiceMessage} disabled={sending} />
              <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="اكتب ردك..." className="rounded-xl flex-1" dir="rtl" />
              <Button type="submit" size="icon" className="rounded-xl" disabled={(!newMessage.trim() && !selectedFile) || sending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40 rounded-xl"><SelectValue placeholder="تصفية" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="open">مفتوحة</SelectItem>
            <SelectItem value="in_progress">قيد المعالجة</SelectItem>
            <SelectItem value="closed">مغلقة</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary">{filteredTickets.length} تذكرة</Badge>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">لا توجد تذاكر دعم</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map(t => (
            <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedTicket(t.id)}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-foreground">{t.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <User className="h-3 w-3 inline ml-1" />{t.user_name} · <Clock className="h-3 w-3 inline ml-1" />{new Date(t.created_at).toLocaleDateString("ar-SA")}
                  </p>
                </div>
                {statusBadge(t.status)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportTicketsTab;
