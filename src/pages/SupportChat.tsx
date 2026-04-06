import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ArrowRight, MessageSquare, Loader2, Plus, Clock, CheckCircle, XCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const bottomRef = useRef<HTMLDivElement>(null);

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
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticketId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false });
    if (data) setTickets(data as Ticket[]);
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId!)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  const createTicket = async () => {
    if (!newSubject.trim() || !user) return;
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject: newSubject.trim() })
      .select()
      .single();
    if (error) { toast.error("فشل في إنشاء التذكرة"); return; }
    if (data) {
      setSearchParams({ ticket: data.id });
      setNewSubject("");
      setShowNewTicket(false);
      fetchTickets();
      toast.success("تم إنشاء تذكرة الدعم");
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !ticketId || !user || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content,
      is_admin: false,
    });

    if (error) {
      setNewMessage(content);
      toast.error("فشل في إرسال الرسالة");
    }
    setSending(false);
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

  // Ticket list view
  if (!ticketId) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-xl" asChild>
                <Link to={backPath}><ArrowRight className="h-5 w-5" /></Link>
              </Button>
              <h1 className="text-xl font-bold text-foreground">خدمة العملاء</h1>
            </div>
            <Button onClick={() => setShowNewTicket(true)} size="sm" className="rounded-xl gap-1">
              <Plus className="h-4 w-4" /> تذكرة جديدة
            </Button>
          </div>

          {showNewTicket && (
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="flex gap-2">
                  <Input
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder="عنوان المشكلة أو الاستفسار..."
                    className="rounded-xl flex-1"
                    onKeyDown={e => e.key === "Enter" && createTicket()}
                  />
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
                <Card
                  key={t.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSearchParams({ ticket: t.id })}
                >
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
                  {msg.is_admin && (
                    <p className="text-[10px] font-bold mb-1 text-primary">فريق الدعم</p>
                  )}
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

      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-card border-t p-3 z-40">
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2 max-w-3xl mx-auto">
          <Input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="اكتب رسالتك..."
            className="rounded-xl flex-1"
            dir="rtl"
          />
          <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={!newMessage.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <BottomNav />
    </div>
  );
};

export default SupportChat;
