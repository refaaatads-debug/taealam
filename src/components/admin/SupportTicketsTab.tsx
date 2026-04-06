import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Loader2, ArrowRight, Clock, User } from "lucide-react";
import { toast } from "sonner";

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  category: string;
  created_at: string;
  user_name?: string;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  content: string;
  is_admin: boolean;
  created_at: string;
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  useEffect(() => {
    if (!selectedTicket) return;
    fetchMessages();
    const channel = supabase
      .channel(`admin-support-${selectedTicket}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `ticket_id=eq.${selectedTicket}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTickets = async () => {
    const { data: ticketData } = await supabase
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false });

    if (ticketData) {
      const userIds = [...new Set(ticketData.map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const nameMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      setTickets(ticketData.map(t => ({ ...t, user_name: nameMap.get(t.user_id) || "مستخدم" })) as Ticket[]);
    }
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", selectedTicket!)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedTicket || !user || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedTicket,
      sender_id: user.id,
      content,
      is_admin: true,
    });

    if (error) {
      setNewMessage(content);
      toast.error("فشل في إرسال الرسالة");
    } else {
      // Update ticket status
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", selectedTicket);
      // Notify user
      const ticket = tickets.find(t => t.id === selectedTicket);
      if (ticket) {
        await supabase.from("notifications").insert({
          user_id: ticket.user_id,
          title: "رد من خدمة العملاء 💬",
          body: content.length > 50 ? content.slice(0, 50) + "..." : content,
          type: "support_reply",
        });
      }
    }
    setSending(false);
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    await supabase.from("support_tickets").update({ status }).eq("id", ticketId);
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
    toast.success("تم تحديث حالة التذكرة");
  };

  const filteredTickets = filter === "all" ? tickets : tickets.filter(t => t.status === filter);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      open: { label: "مفتوحة", variant: "default" },
      in_progress: { label: "قيد المعالجة", variant: "secondary" },
      closed: { label: "مغلقة", variant: "destructive" },
    };
    const s = map[status] || map.open;
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  // Chat view
  if (selectedTicket) {
    const ticket = tickets.find(t => t.id === selectedTicket);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => { setSelectedTicket(null); setMessages([]); }}>
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
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    msg.is_admin ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${msg.is_admin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {new Date(msg.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="اكتب ردك..." className="rounded-xl flex-1" dir="rtl" />
              <Button type="submit" size="icon" className="rounded-xl" disabled={!newMessage.trim() || sending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tickets list
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
