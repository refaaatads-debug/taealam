import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCheck,
  ChevronLeft,
  Headphones,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Minimize2,
  PhoneCall,
  Plus,
  Radio,
  Send,
  Sparkles,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIAssistantChat from "@/components/support/AIAssistantChat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import CallStudentButton from "@/components/teacher/CallStudentButton";

type HubTab = "support" | "messages" | "assistant";

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  content: string;
  is_admin: boolean;
  created_at: string;
}

interface Conversation {
  bookingId: string;
  bookingIds: string[];
  otherUserId: string;
  otherName: string;
  scheduledAt: string;
  status: string;
  sessionStatus?: string | null;
  lastMessageAt?: string | null;
  callCount?: number;
  lastCallAt?: string | null;
  lastCallStatus?: string | null;
}

interface CallHistoryItem {
  id: string;
  status: string;
  created_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  cost: number | null;
}

interface DirectMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const ticketStatus: Record<string, { label: string; className: string }> = {
  open: { label: "مفتوحة", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  in_progress: { label: "قيد المعالجة", className: "border-amber-200 bg-amber-50 text-amber-700" },
  resolved: { label: "تم الحل", className: "border-blue-200 bg-blue-50 text-blue-700" },
  closed: { label: "مغلقة", className: "border-slate-200 bg-slate-100 text-slate-600" },
};

const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });

const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("ar-SA", { day: "numeric", month: "short" });

const callStatusLabel = (status: string) => ({
  completed: "مكتملة",
  connected: "متصلة",
  ringing: "فائتة",
  missed: "فائتة",
  rejected: "مرفوضة",
  busy: "مشغول",
  failed: "فاشلة",
  cancelled: "ملغاة",
  ended: "انتهت",
}[status] || status);

const callDurationLabel = (minutes: number | null) =>
  minutes && minutes > 0 ? `${minutes} دقيقة` : "دون مدة";

const conversationStatus = (conversation: Conversation) => {
  if (["ringing", "connecting"].includes(conversation.lastCallStatus || "")) {
    return { label: "اتصال جارٍ", className: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  }
  if (conversation.lastCallStatus === "connected") {
    return { label: "متصل الآن", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  }
  if (conversation.sessionStatus === "in_progress") {
    return { label: "في جلسة الآن", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  }
  if (conversation.sessionStatus === "waiting_acceptance") {
    return { label: "بانتظار القبول", className: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  }
  if (conversation.status === "confirmed" && new Date(conversation.scheduledAt).getTime() >= Date.now()) {
    return { label: "لديه حجز قادم", className: "bg-blue-50 text-blue-700", dot: "bg-blue-500" };
  }
  return { label: "غير متاح الآن", className: "bg-slate-100 text-slate-500", dot: "bg-slate-400" };
};

function EmptyState({ icon: Icon, title, description }: { icon: typeof MessageCircle; title: string; description: string }) {
  return (
    <div className="flex h-full min-h-[250px] flex-col items-center justify-center px-8 text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-black text-slate-800">{title}</p>
      <p className="mt-1 max-w-[280px] text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function SupportPanel({ onOpenTicket }: { onOpenTicket?: (ticketId: string) => void }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId);

  const loadTickets = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, subject, status, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (!error) setTickets((data || []) as SupportTicket[]);
    setLoading(false);
  };

  const loadMessages = async (ticketId: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("id, ticket_id, sender_id, content, is_admin, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as SupportMessage[]);
  };

  useEffect(() => {
    loadTickets();
  }, [user]);

  useEffect(() => {
    if (!selectedId || !user) return;
    loadMessages(selectedId);
    const channel = supabase
      .channel(`hub-support-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${selectedId}` }, (payload) => {
        const incoming = payload.new as SupportMessage;
        setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createTicket = async (event?: FormEvent, initialSubject?: string, initialMessage?: string) => {
    event?.preventDefault();
    const finalSubject = (initialSubject || subject).trim();
    if (!user || !finalSubject || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject: finalSubject })
      .select("id, subject, status, created_at, updated_at")
      .single();
    if (error || !data) {
      toast.error("تعذر إنشاء تذكرة الدعم");
      setSending(false);
      return;
    }
    if (initialMessage?.trim()) {
      await supabase.from("support_messages").insert({
        ticket_id: data.id,
        sender_id: user.id,
        content: initialMessage.trim(),
        is_admin: false,
      });
    }
    setSubject("");
    setShowCreate(false);
    await loadTickets();
    setSelectedId(data.id);
    onOpenTicket?.(data.id);
    toast.success("تم إنشاء تذكرة الدعم");
    setSending(false);
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (!content || !selectedId || !user || sending) return;
    setSending(true);
    setMessage("");
    const temp: SupportMessage = {
      id: `temp-${Date.now()}`,
      ticket_id: selectedId,
      sender_id: user.id,
      content,
      is_admin: false,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, temp]);
    const { data, error } = await supabase.from("support_messages").insert({
      ticket_id: selectedId,
      sender_id: user.id,
      content,
      is_admin: false,
    }).select().single();
    if (error) {
      setMessages((current) => current.filter((item) => item.id !== temp.id));
      setMessage(content);
      toast.error("تعذر إرسال الرسالة");
    } else if (data) {
      setMessages((current) => current.map((item) => item.id === temp.id ? data as SupportMessage : item));
      await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", selectedId);
    }
    setSending(false);
  };

  if (selectedId) {
    const status = ticketStatus[selectedTicket?.status || "open"] || ticketStatus.open;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setSelectedId(null)}><ArrowRight className="h-4 w-4" /></Button>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#174477]"><Headphones className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{selectedTicket?.subject || "الدعم الفني"}</p><p className="text-[10px] text-slate-400">فريق أجيال المعرفة</p></div>
          <Badge variant="outline" className={cn("rounded-full text-[10px]", status.className)}>{status.label}</Badge>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4">
          {messages.length === 0 && <EmptyState icon={Headphones} title="ابدأ المحادثة" description="اكتب تفاصيل طلبك وسيجيبك فريق الدعم الفني هنا." />}
          {messages.map((item) => {
            const mine = !item.is_admin;
            return (
              <div key={item.id} className={cn("flex", mine ? "justify-start" : "justify-end")}>
                <div className={cn("max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm", mine ? "rounded-tr-md bg-[#174477] text-white" : "rounded-tl-md border border-slate-200 bg-white text-slate-700")}>
                  {item.is_admin && <p className="mb-1 text-[10px] font-black text-emerald-700">الدعم الفني</p>}
                  <p className="whitespace-pre-wrap leading-6">{item.content}</p>
                  <p className={cn("mt-1 text-left text-[9px]", mine ? "text-white/55" : "text-slate-400")}>{timeLabel(item.created_at)}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
          <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب رسالتك لفريق الدعم..." className="h-10 rounded-xl border-slate-200 bg-slate-50" />
          <Button type="submit" size="icon" disabled={!message.trim() || sending} className="h-10 w-10 shrink-0 rounded-xl bg-[#174477] hover:bg-[#10355e]">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div><p className="text-sm font-black text-slate-800">الدعم الفني</p><p className="text-[10px] text-slate-400">تابع طلباتك وتواصل مع الفريق</p></div>
        <Button size="sm" onClick={() => setShowCreate((value) => !value)} className="h-8 gap-1 rounded-xl bg-[#174477] text-[11px]"><Plus className="h-3.5 w-3.5" /> تذكرة جديدة</Button>
      </div>
      {showCreate && (
        <form onSubmit={(event) => createTicket(event)} className="border-b border-blue-100 bg-blue-50/60 p-3">
          <div className="flex gap-2"><Input autoFocus value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="اكتب عنوان المشكلة..." className="h-9 rounded-xl bg-white text-xs" /><Button type="submit" size="sm" disabled={!subject.trim() || sending} className="h-9 rounded-xl">إنشاء</Button></div>
        </form>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#174477]" /></div> : tickets.length === 0 ? <EmptyState icon={Headphones} title="لا توجد تذاكر" description="أنشئ تذكرة جديدة وسيصلك رد فريق الدعم داخل هذه النافذة." /> : (
          <div className="space-y-2">
            {tickets.map((ticket) => {
              const status = ticketStatus[ticket.status] || ticketStatus.open;
              return (
                <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-right transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#174477]"><Headphones className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-slate-800">{ticket.subject}</span><span className="mt-1 block text-[10px] text-slate-400">{dateLabel(ticket.updated_at || ticket.created_at)}</span></span>
                  <Badge variant="outline" className={cn("rounded-full text-[9px]", status.className)}>{status.label}</Badge><ChevronLeft className="h-4 w-4 text-slate-300 transition-transform group-hover:-translate-x-0.5" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MessagesPanel() {
  const { user, roles } = useAuth();
  const isTeacher = roles.includes("teacher");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allBookingIds, setAllBookingIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [bookingIds, setBookingIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [canStudentSend, setCanStudentSend] = useState(true);
  const [instantSending, setInstantSending] = useState<string | null>(null);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const unreadCounts = useUnreadMessages(allBookingIds);

  useEffect(() => {
    if (!user) return;
    const loadConversations = async () => {
      setLoading(true);
      const roleColumn = isTeacher ? "teacher_id" : "student_id";
      const { data, error } = await supabase
        .from("bookings")
        .select("id, student_id, teacher_id, scheduled_at, status, session_status")
        .eq(roleColumn, user.id)
        .order("scheduled_at", { ascending: false })
        // The conversation list must include historical bookings too.  A
        // teacher can have more than 100 bookings, and the chat is unified
        // across all bookings with the same student.
        .limit(1000);
      if (error || !data) { setLoading(false); return; }
      setAllBookingIds(data.map((booking: any) => booking.id));
      const unique = new Map<string, { latest: any; bookingIds: string[] }>();
      data.forEach((booking: any) => {
        const otherUserId = isTeacher ? booking.student_id : booking.teacher_id;
        if (!otherUserId) return;
        const current = unique.get(otherUserId);
        if (current) current.bookingIds.push(booking.id);
        else unique.set(otherUserId, { latest: booking, bookingIds: [booking.id] });
      });
      const ids = [...unique.keys()];
      const [{ data: profiles }, { data: recentMessages }, { data: callRows }] = await Promise.all([
        ids.length ? supabase.from("public_profiles").select("user_id, full_name").in("user_id", ids) : Promise.resolve({ data: [] as any[] }),
        data.length
          ? supabase.from("chat_messages").select("booking_id, created_at").in("booking_id", data.map((booking: any) => booking.id)).order("created_at", { ascending: false }).limit(5000)
          : Promise.resolve({ data: [] as any[] }),
        isTeacher
          ? supabase.from("call_logs").select("student_id, status, created_at").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(500)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const names = new Map((profiles || []).map((profile: any) => [profile.user_id, profile.full_name]));
      const lastMessageByBooking = new Map<string, string>();
      (recentMessages || []).forEach((message: any) => {
        if (!lastMessageByBooking.has(message.booking_id)) lastMessageByBooking.set(message.booking_id, message.created_at);
      });
      const nextCallStats: Record<string, { count: number; lastAt: string | null; lastStatus: string | null }> = {};
      (callRows || []).forEach((call: any) => {
        if (!call.student_id) return;
        const current = nextCallStats[call.student_id];
        nextCallStats[call.student_id] = {
          count: (current?.count || 0) + 1,
          lastAt: current?.lastAt || call.created_at || null,
          lastStatus: current?.lastStatus || call.status || null,
        };
      });
      const nextConversations = [...unique.entries()].map(([otherUserId, group]) => ({
        bookingId: group.latest.id,
        bookingIds: group.bookingIds,
        otherUserId,
        otherName: names.get(otherUserId) || (isTeacher ? "طالب" : "معلم"),
        scheduledAt: group.latest.scheduled_at,
        status: group.latest.status,
        sessionStatus: group.latest.session_status,
        lastMessageAt: group.bookingIds.map((id) => lastMessageByBooking.get(id)).filter(Boolean).sort().pop() || null,
        callCount: nextCallStats[otherUserId]?.count || 0,
        lastCallAt: nextCallStats[otherUserId]?.lastAt || null,
        lastCallStatus: nextCallStats[otherUserId]?.lastStatus || null,
      }));
      nextConversations.sort((a, b) =>
        new Date(b.lastMessageAt || b.scheduledAt).getTime() - new Date(a.lastMessageAt || a.scheduledAt).getTime()
      );
      setConversations(nextConversations);
      setLoading(false);
    };
    loadConversations();
    const refreshTimer = window.setInterval(loadConversations, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, [user, isTeacher]);

  useEffect(() => {
    if (!selected || !user) return;
    let active = true;
    const loadThread = async () => {
      setLoading(true);
      const studentId = isTeacher ? selected.otherUserId : user.id;
      const teacherId = isTeacher ? user.id : selected.otherUserId;
      const [{ data: pairBookings }, subscriptionResult, callResult] = await Promise.all([
        supabase.from("bookings").select("id").eq("student_id", studentId).eq("teacher_id", teacherId),
        isTeacher ? Promise.resolve({ data: [{ id: "teacher" }] }) : supabase.from("user_subscriptions").select("id").eq("user_id", user.id).eq("is_active", true).gt("remaining_minutes", 0).gt("ends_at", new Date().toISOString()).limit(1),
        isTeacher
          ? supabase.from("call_logs").select("id, status, created_at, ended_at, duration_minutes, cost").eq("teacher_id", user.id).eq("student_id", selected.otherUserId).order("created_at", { ascending: false }).limit(30)
          : Promise.resolve({ data: [] as CallHistoryItem[] }),
      ]);
      if (!active) return;
      setCallHistory((callResult.data || []) as CallHistoryItem[]);
      const ids = (pairBookings || []).map((item: any) => item.id);
      const finalIds = ids.length ? ids : [selected.bookingId];
      setBookingIds(finalIds);
      setCanStudentSend(isTeacher || !!subscriptionResult.data?.length);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const { data } = await supabase.from("chat_messages").select("id, booking_id, sender_id, content, created_at").in("booking_id", finalIds).gte("created_at", oneYearAgo.toISOString()).order("created_at", { ascending: true });
      if (active) { setMessages((data || []) as DirectMessage[]); setLoading(false); }
    };
    loadThread();
    return () => { active = false; };
  }, [selected, user, isTeacher]);

  useEffect(() => {
    if (!selected || !user || bookingIds.length === 0) return;
    const channel = supabase.channel(`hub-chat-${user.id}-${selected.otherUserId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
      const incoming = payload.new as DirectMessage;
      if (!bookingIds.includes(incoming.booking_id)) return;
      setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming]);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected, user, bookingIds]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (!content || !selected || !user || sending) return;
    if (!canStudentSend) { toast.error("يجب تفعيل باقة لإرسال الرسائل"); return; }
    setSending(true);
    setMessage("");
    const temp: DirectMessage = { id: `temp-${Date.now()}`, booking_id: selected.bookingId, sender_id: user.id, content, created_at: new Date().toISOString() };
    setMessages((current) => [...current, temp]);
    const { data, error } = await supabase.from("chat_messages").insert({ booking_id: selected.bookingId, sender_id: user.id, content }).select().single();
    if (error) {
      setMessages((current) => current.filter((item) => item.id !== temp.id));
      setMessage(content);
      toast.error("تعذر إرسال الرسالة");
    } else {
      if (data) setMessages((current) => current.map((item) => item.id === temp.id ? data as DirectMessage : item));
      await supabase.from("notifications").insert({ user_id: selected.otherUserId, title: "رسالة جديدة 💬", body: content.length > 50 ? `${content.slice(0, 50)}...` : content, type: "chat_message" });
    }
    setSending(false);
  };

  const sendInstantSession = async (conversation: Conversation) => {
    if (!user || instantSending) return;
    setInstantSending(conversation.otherUserId);
    try {
      const roleColumn = isTeacher ? "teacher_id" : "student_id";
      const { data: activeSessions } = await supabase
        .from("bookings")
        .select("id, session_status")
        .eq(roleColumn, user.id)
        .in("session_status", ["waiting_acceptance", "in_progress"])
        .limit(1);

      if (activeSessions?.length) {
        toast.error(activeSessions[0].session_status === "in_progress"
          ? "لديك جلسة جارية الآن"
          : "لديك طلب جلسة فورية قيد الانتظار");
        return;
      }

      const studentId = isTeacher ? conversation.otherUserId : user.id;
      const teacherId = isTeacher ? user.id : conversation.otherUserId;
      const { data: subscriptions } = await supabase
        .from("user_subscriptions")
        .select("remaining_minutes")
        .eq("user_id", studentId)
        .eq("is_active", true)
        .gte("remaining_minutes", 15)
        .gt("ends_at", new Date().toISOString());

      if (!subscriptions?.length) {
        toast.error("لا يمكن بدء جلسة فورية", {
          description: isTeacher
            ? "الطالب لا يمتلك 15 دقيقة متاحة على الأقل."
            : "تحتاج إلى باقة نشطة بها 15 دقيقة على الأقل.",
        });
        return;
      }

      const { data: existingPairSession } = await supabase
        .from("bookings")
        .select("id, session_status")
        .eq("student_id", studentId)
        .eq("teacher_id", teacherId)
        .in("session_status", ["waiting_acceptance", "in_progress"])
        .limit(1);

      if (existingPairSession?.length) {
        toast.info(existingPairSession[0].session_status === "in_progress"
          ? "توجد جلسة جارية بينكما الآن"
          : "يوجد طلب جلسة فورية قيد الانتظار بينكما");
        return;
      }

      const { data: newBooking, error } = await supabase.from("bookings").insert({
        teacher_id: teacherId,
        student_id: studentId,
        scheduled_at: new Date().toISOString(),
        duration_minutes: 45,
        status: "confirmed" as any,
        session_status: "waiting_acceptance",
      }).select("id").single();

      if (error || !newBooking) throw error || new Error("تعذر إنشاء الجلسة");

      await supabase.from("notifications").insert({
        user_id: isTeacher ? studentId : teacherId,
        ...(isTeacher
          ? notificationTemplates.instantSessionFromTeacher({ teacherName: "معلمك" })
          : notificationTemplates.instantSessionFromStudent()),
      });

      setConversations((current) => current.map((item) => item.otherUserId === conversation.otherUserId
        ? { ...item, bookingId: newBooking.id, bookingIds: [...item.bookingIds, newBooking.id], status: "confirmed", sessionStatus: "waiting_acceptance" }
        : item
      ));
      setAllBookingIds((current) => [...current, newBooking.id]);
      toast.success(`تم إرسال طلب جلسة فورية إلى ${conversation.otherName}`);
    } catch (error: any) {
      toast.error("تعذر إرسال الجلسة الفورية", { description: error?.message || "حاول مرة أخرى" });
    } finally {
      setInstantSending(null);
    }
  };

  if (selected) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => { setSelected(null); setMessages([]); }}><ArrowRight className="h-4 w-4" /></Button>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><UserRound className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{selected.otherName}</p><p className="flex items-center gap-1 text-[10px] text-emerald-600"><Radio className="h-2.5 w-2.5" /> محادثة الطالب والمعلم</p></div>
          {isTeacher && <CallStudentButton bookingId={selected.bookingId} studentName={selected.otherName} variant="outline" size="sm" className="h-8 rounded-xl text-[10px]" />}
        </div>
        {isTeacher && callHistory.length > 0 && (
          <details className="border-b border-slate-100 bg-slate-50/80 px-4 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-black text-slate-600">
              <PhoneCall className="h-3.5 w-3.5 text-[#14786f]" />
              سجل المكالمات
              <Badge variant="outline" className="mr-auto rounded-full text-[9px]">{callHistory.length}</Badge>
            </summary>
            <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto">
              {callHistory.map((call) => (
                <div key={call.id} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[10px]">
                  <span className="font-bold text-slate-700">{callStatusLabel(call.status)}</span>
                  <span className="text-slate-400">{dateLabel(call.created_at)} · {timeLabel(call.created_at)}</span>
                  <span className="mr-auto text-slate-400">{callDurationLabel(call.duration_minutes)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4">
          {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#174477]" /></div> : messages.length === 0 ? <EmptyState icon={MessagesSquare} title="لا توجد رسائل بعد" description="ابدأ المحادثة وسيظهر الرد هنا فورًا." /> : messages.map((item) => {
            const mine = item.sender_id === user?.id;
            return <div key={item.id} className={cn("flex", mine ? "justify-start" : "justify-end")}><div className={cn("max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm", mine ? "rounded-tr-md bg-[#174477] text-white" : "rounded-tl-md border border-slate-200 bg-white text-slate-700")}><p className="whitespace-pre-wrap leading-6">{item.content}</p><p className={cn("mt-1 flex items-center justify-end gap-1 text-[9px]", mine ? "text-white/55" : "text-slate-400")}>{timeLabel(item.created_at)}{mine && <CheckCheck className="h-3 w-3" />}</p></div></div>;
          })}
          <div ref={bottomRef} />
        </div>
        {!canStudentSend ? <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-700">يلزم وجود باقة نشطة لإرسال الرسائل</div> : (
          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-slate-100 bg-white p-3"><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب رسالتك..." className="h-10 rounded-xl border-slate-200 bg-slate-50" /><Button type="submit" size="icon" disabled={!message.trim() || sending} className="h-10 w-10 shrink-0 rounded-xl bg-[#14786f] hover:bg-[#10655d]">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></form>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-black text-slate-800">مركز الرسائل</p><p className="text-[10px] text-slate-400">محادثاتك المباشرة مع {isTeacher ? "الطلاب" : "المعلمين"}</p></div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#174477]" /></div> : conversations.length === 0 ? <EmptyState icon={MessagesSquare} title="لا توجد محادثات" description="تُنشأ المحادثة تلقائيًا عند وجود حجز بين الطالب والمعلم." /> : (
          <div className="space-y-2">{conversations.map((conversation) => {
            const status = conversationStatus(conversation);
            const unread = conversation.bookingIds.reduce((total, bookingId) => total + (unreadCounts[bookingId] || 0), 0);
            return (
              <div key={conversation.otherUserId} className="rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:border-emerald-200 hover:shadow-md">
                <button onClick={() => setSelected(conversation)} className="group flex w-full items-center gap-3 text-right">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <UserRound className="h-5 w-5" />
                    <span className={cn("absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white", status.dot)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block truncate text-xs font-black text-slate-800">{conversation.otherName}</span>
                      {unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-black text-destructive-foreground">{unread}</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                      <span className={cn("rounded-full px-1.5 py-0.5 font-bold", status.className)}>{status.label}</span>
                      <span>آخر نشاط · {conversation.lastMessageAt ? dateLabel(conversation.lastMessageAt) : dateLabel(conversation.scheduledAt)}</span>
                      {isTeacher && conversation.callCount ? <span>• {conversation.callCount} مكالمة</span> : null}
                    </span>
                  </span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:-translate-x-0.5" />
                </button>
                <div className="mt-2 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg px-2.5 text-[10px] text-emerald-700"
                    onClick={() => sendInstantSession(conversation)}
                    disabled={instantSending === conversation.otherUserId}
                  >
                    {instantSending === conversation.otherUserId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}
                    جلسة فورية
                  </Button>
                </div>
              </div>
            );
          })}</div>
        )}
      </div>
    </div>
  );
}

export default function CommunicationHub() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>("support");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const tabs = useMemo(() => [
    { value: "support" as const, label: "الدعم", icon: Headphones },
    { value: "messages" as const, label: "الرسائل", icon: MessagesSquare },
    { value: "assistant" as const, label: "المساعد الذكي", icon: Bot },
  ], []);

  return (
    <>
      {open && <button aria-label="إغلاق مركز التواصل" className="fixed inset-0 z-[69] cursor-default bg-slate-950/15 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none" onClick={() => setOpen(false)} />}
      <div className="fixed bottom-20 left-3 z-[70] md:bottom-6 md:left-6" dir="rtl">
        {open && (
          <section className="mb-3 flex h-[min(720px,calc(100vh-112px))] w-[min(430px,calc(100vw-24px))] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_30px_90px_-28px_rgba(15,42,78,0.55)] animate-in fade-in-0 slide-in-from-bottom-4 zoom-in-95 duration-200">
            <header className="relative overflow-hidden bg-gradient-to-l from-[#102e57] via-[#174b78] to-[#14786f] px-4 pb-4 pt-4 text-white">
              <div className="pointer-events-none absolute -left-10 -top-14 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-inner"><MessageCircle className="h-5 w-5" /><span className="absolute -bottom-1 -left-1 h-3.5 w-3.5 rounded-full border-[3px] border-[#176f6b] bg-emerald-300" /></span>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-black">مركز تواصل أجيال المعرفة</h2><p className="mt-0.5 text-[10px] text-white/65">الدعم والرسائل والمساعدة في مكان واحد</p></div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8 rounded-xl text-white/80 hover:bg-white/10 hover:text-white"><Minimize2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8 rounded-xl text-white/80 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></Button>
              </div>
            </header>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as HubTab)} className="flex min-h-0 flex-1 flex-col">
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-none border-b border-slate-100 bg-white p-2">
                {tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 rounded-xl py-2.5 text-[10px] font-bold text-slate-500 data-[state=active]:bg-slate-100 data-[state=active]:text-[#174477] data-[state=active]:shadow-none"><tab.icon className="h-3.5 w-3.5" />{tab.label}</TabsTrigger>)}
              </TabsList>
              <TabsContent value="support" className="m-0 min-h-0 flex-1 overflow-hidden"><SupportPanel /></TabsContent>
              <TabsContent value="messages" className="m-0 min-h-0 flex-1 overflow-hidden"><MessagesPanel /></TabsContent>
              <TabsContent value="assistant" className="m-0 min-h-0 flex-1 overflow-hidden"><AIAssistantChat compact /></TabsContent>
            </Tabs>
          </section>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "إغلاق مركز التواصل" : "فتح مركز التواصل"}
          aria-expanded={open}
          className="group relative flex items-center gap-3 rounded-[22px] bg-gradient-to-l from-[#102e57] via-[#174b78] to-[#14786f] p-2.5 pr-3 text-white shadow-[0_18px_45px_-15px_rgba(17,65,102,0.75)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_55px_-16px_rgba(17,65,102,0.85)] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/40"
        >
          <span className="absolute inset-0 -z-10 rounded-[24px] bg-emerald-400/20 blur-md transition-transform group-hover:scale-110" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-inner"><MessageCircle className={cn("h-5 w-5 transition-transform", open ? "scale-90" : "group-hover:rotate-[-8deg] group-hover:scale-110")} /><span className="absolute -left-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#174b78] bg-emerald-300"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-300 opacity-60" /></span></span>
          <span className="hidden pl-2 text-right sm:block"><span className="block text-xs font-black">تواصل معنا</span><span className="mt-0.5 block text-[9px] text-white/60">متاحون لمساعدتك</span></span>
          {!open && <Sparkles className="ml-1 hidden h-3.5 w-3.5 text-emerald-200 sm:block" />}
        </button>
      </div>
    </>
  );
}
