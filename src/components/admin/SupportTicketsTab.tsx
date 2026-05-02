import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Send, Loader2, ArrowRight, Clock, User, Paperclip, FileText, Image as ImageIcon,
  X, Download, Plus, Search, Headphones, UserCheck, AlertCircle, CheckCircle2, Hourglass, Users, Sparkles, Filter, ArrowLeftRight, FolderOpen, ExternalLink, Phone, Mail, Wallet
} from "lucide-react";
import { toast } from "sonner";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoicePlayer from "@/components/VoicePlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Ticket {
  id: string; user_id: string; subject: string; status: string; category: string; created_at: string; updated_at?: string;
  assigned_to?: string | null; assigned_at?: string | null;
  user_name?: string;
  assigned_name?: string | null;
  last_message?: string;
  unread_count?: number;
}
interface Message {
  id: string; ticket_id: string; sender_id: string; content: string; is_admin: boolean; created_at: string;
  file_url?: string | null; file_name?: string | null; file_type?: string | null;
  sender_name?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: "مفتوحة", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", icon: AlertCircle },
  in_progress: { label: "قيد المعالجة", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: Hourglass },
  closed: { label: "مغلقة", color: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
};

const initials = (name?: string) => (name || "?").trim().split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

const SupportTicketsTab = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { play: playSupportSound } = useNotificationSound();
  const [initiateOpen, setInitiateOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<{ user_id: string; full_name: string }[]>([]);
  const [initiateSubject, setInitiateSubject] = useState("");
  const [initiateMessage, setInitiateMessage] = useState("");
  const [initiateUser, setInitiateUser] = useState<{ user_id: string; full_name: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [profileNameMap, setProfileNameMap] = useState<Map<string, string>>(new Map());

  // Transfer ticket dialog
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferResults, setTransferResults] = useState<{ user_id: string; full_name: string }[]>([]);
  const [transferTarget, setTransferTarget] = useState<{ user_id: string; full_name: string } | null>(null);
  const [transferNote, setTransferNote] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Student quick-peek
  const [peekLoading, setPeekLoading] = useState(false);
  const [peekData, setPeekData] = useState<any>(null);

  const loadStudentPeek = async (uid: string) => {
    if (peekData?.user_id === uid) return;
    setPeekLoading(true);
    try {
      const [profileRes, subsRes, ticketsRes, walletRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, phone, avatar_url, created_at").eq("user_id", uid).maybeSingle(),
        supabase.from("user_subscriptions").select("remaining_minutes, is_active, subscription_plans(name_ar)").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("support_tickets").select("id, status").eq("user_id", uid),
        supabase.from("wallets").select("balance").eq("user_id", uid).maybeSingle(),
      ]);
      const subs = (subsRes.data || []) as any[];
      const totalMins = subs.reduce((s: number, x: any) => s + Number(x.remaining_minutes || 0), 0);
      const activePlan = subs.find((s: any) => s.is_active)?.subscription_plans?.name_ar || "—";
      const openTickets = (ticketsRes.data || []).filter((t: any) => t.status !== "closed").length;
      setPeekData({
        user_id: uid,
        ...((profileRes.data as any) || {}),
        totalMins,
        activePlan,
        openTickets,
        totalTickets: (ticketsRes.data || []).length,
        balance: walletRes.data?.balance ?? 0,
      });
    } finally {
      setPeekLoading(false);
    }
  };


  // Realtime: refresh ticket list on any change (new tickets / status / assignment)
  useEffect(() => {
    const ch = supabase.channel("admin-tickets-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!selectedTicket) return;
    fetchMessages();
    const channel = supabase
      .channel(`admin-support-${selectedTicket}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${selectedTicket}` },
        async (payload) => {
          const msg = payload.new as Message;
          // hydrate sender name if admin
          let sender_name: string | undefined;
          if (msg.is_admin) sender_name = profileNameMap.get(msg.sender_id) || (await fetchProfileName(msg.sender_id));
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            if (msg.sender_id !== user?.id) playSupportSound();
            return [...prev, { ...msg, sender_name }];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchProfileName = async (uid: string) => {
    const { data } = await supabase.from("profiles").select("full_name").eq("user_id", uid).maybeSingle();
    const name = data?.full_name || "موظف الدعم";
    setProfileNameMap(prev => new Map(prev).set(uid, name));
    return name;
  };

  const fetchTickets = async () => {
    const { data: ticketData } = await supabase.from("support_tickets").select("*").order("updated_at", { ascending: false });
    if (!ticketData) { setLoading(false); return; }
    const userIds = [...new Set([
      ...ticketData.map(t => t.user_id),
      ...ticketData.map((t: any) => t.assigned_to).filter(Boolean),
    ])];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
    const nameMap = new Map(profiles?.map(p => [p.user_id, p.full_name || "مستخدم"]) || []);
    setProfileNameMap(prev => new Map([...prev, ...nameMap]));
    setTickets(ticketData.map((t: any) => ({
      ...t,
      user_name: nameMap.get(t.user_id) || "مستخدم",
      assigned_name: t.assigned_to ? (nameMap.get(t.assigned_to) || "موظف") : null,
    })) as Ticket[]);
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selectedTicket!).order("created_at", { ascending: true });
    if (!data) return;
    const adminSenders = [...new Set(data.filter(m => m.is_admin).map(m => m.sender_id))];
    const missing = adminSenders.filter(id => !profileNameMap.has(id));
    if (missing.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", missing);
      if (profs) setProfileNameMap(prev => { const next = new Map(prev); profs.forEach(p => next.set(p.user_id, p.full_name || "موظف الدعم")); return next; });
    }
    setMessages(data.map(m => ({ ...m, sender_name: m.is_admin ? (profileNameMap.get(m.sender_id) || "موظف الدعم") : undefined })) as Message[]);
  };

  const claimTicketIfNeeded = async (ticketId: string) => {
    if (!user) return;
    const t = tickets.find(x => x.id === ticketId);
    if (t?.assigned_to) return; // already claimed
    await supabase.from("support_tickets")
      .update({ assigned_to: user.id, assigned_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", ticketId);
  };

  const reassignToMe = async () => {
    if (!user || !selectedTicket) return;
    const { error } = await supabase.from("support_tickets")
      .update({ assigned_to: user.id, assigned_at: new Date().toISOString() })
      .eq("id", selectedTicket);
    if (error) toast.error("فشل تعيين التذكرة");
    else toast.success("تم تعيين التذكرة لك");
  };

  const releaseTicket = async () => {
    if (!selectedTicket) return;
    const { error } = await supabase.from("support_tickets")
      .update({ assigned_to: null, assigned_at: null })
      .eq("id", selectedTicket);
    if (error) toast.error("فشل تحرير التذكرة");
    else toast.success("تم تحرير التذكرة");
  };

  const searchAdmins = async (q: string) => {
    setTransferSearch(q);
    if (q.trim().length < 2) { setTransferResults([]); return; }
    // Get admin user_ids first
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (admins || []).map(a => a.user_id).filter(id => id !== user?.id);
    if (adminIds.length === 0) { setTransferResults([]); return; }
    const { data } = await supabase.from("profiles")
      .select("user_id, full_name")
      .in("user_id", adminIds)
      .ilike("full_name", `%${q}%`)
      .limit(10);
    setTransferResults((data ?? []) as any);
  };

  const performTransfer = async () => {
    if (!user || !selectedTicket || !transferTarget) return;
    setTransferring(true);
    const fromName = profileNameMap.get(user.id) || "أنت";
    const toName = transferTarget.full_name || "موظف الدعم";

    // 1) Update assignment
    const { error: updErr } = await supabase.from("support_tickets")
      .update({ assigned_to: transferTarget.user_id, assigned_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", selectedTicket);
    if (updErr) { toast.error("فشل تحويل التذكرة"); setTransferring(false); return; }

    // 2) Post a system-style admin note in the conversation (visible to admins + user)
    const noteText = transferNote.trim()
      ? `🔄 تم تحويل المحادثة من ${fromName} إلى ${toName}.\n📝 ملاحظة: ${transferNote.trim()}`
      : `🔄 تم تحويل المحادثة من ${fromName} إلى ${toName}.`;
    await supabase.from("support_messages").insert({
      ticket_id: selectedTicket, sender_id: transferTarget.user_id, content: noteText, is_admin: true,
    });

    // 3) Notify the new agent
    await supabase.from("notifications").insert({
      user_id: transferTarget.user_id,
      title: "📨 تذكرة جديدة محوّلة إليك",
      body: `حوّل ${fromName} تذكرة دعم إليك للمتابعة`,
      type: "support_reply",
      link: `/admin?tab=support&ticket=${selectedTicket}`,
    } as any);

    // 4) Audit log
    await supabase.rpc("log_admin_action", {
      _action: "transfer_support_ticket",
      _category: "support",
      _description: `تحويل تذكرة دعم من ${fromName} إلى ${toName}`,
      _target_table: "support_tickets",
      _target_id: selectedTicket,
      _metadata: { note: transferNote.trim() || null, to_user: transferTarget.user_id } as any,
    } as any);

    toast.success(`تم تحويل التذكرة إلى ${toName}`);
    setTransferOpen(false);
    setTransferTarget(null); setTransferNote(""); setTransferSearch(""); setTransferResults([]);
    setTransferring(false);
    fetchTickets();
  };

  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    const ext = file.name.split('.').pop();
    const path = `${selectedTicket}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("support-files").upload(path, file, {
      contentType: file.type || "application/octet-stream", upsert: false,
    });
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

    await claimTicketIfNeeded(selectedTicket);

    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedTicket, sender_id: user.id, content, is_admin: true,
      ...(fileData && { file_url: fileData.url, file_name: fileData.name, file_type: fileData.type }),
    });

    if (error) {
      setNewMessage(content);
      if ((error.message || "").includes("TICKET_LOCKED")) {
        toast.error("التذكرة مقفلة على موظف آخر — لا يمكنك الرد", { duration: 5000 });
        await fetchTickets();
      } else {
        toast.error("فشل في إرسال الرسالة");
      }
    } else {
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", selectedTicket);
      const ticket = tickets.find(t => t.id === selectedTicket);
      if (ticket) {
        await supabase.from("notifications").insert({
          user_id: ticket.user_id, title: "رد من خدمة العملاء 💬",
          body: content.length > 140 ? content.slice(0, 140) + "..." : content, type: "support_reply",
          link: `/support?ticket=${selectedTicket}`,
        } as any);
      }
    }
    setSending(false);
  };

  const sendVoiceMessage = async (file: File) => {
    if (!selectedTicket || !user) return;
    setSending(true);
    const fileData = await uploadFile(file);
    if (!fileData) { setSending(false); return; }
    await claimTicketIfNeeded(selectedTicket);
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedTicket, sender_id: user.id, content: "🎤 رسالة صوتية", is_admin: true,
      file_url: fileData.url, file_name: fileData.name, file_type: fileData.type,
    });
    if (error) {
      if ((error.message || "").includes("TICKET_LOCKED")) {
        toast.error("التذكرة مقفلة على موظف آخر — لا يمكنك الرد");
        await fetchTickets();
      } else toast.error("فشل في إرسال الرسالة الصوتية");
    }
    else {
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", selectedTicket);
      const ticket = tickets.find(t => t.id === selectedTicket);
      if (ticket) await supabase.from("notifications").insert({
        user_id: ticket.user_id, title: "رد من خدمة العملاء 💬", body: "🎤 رسالة صوتية", type: "support_reply",
        link: `/support?ticket=${selectedTicket}`,
      } as any);
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
            <img src={msg.file_url} alt={msg.file_name || "صورة"} className="max-w-[240px] rounded-lg border border-border/30" loading="lazy" />
          </a>
          <a href={msg.file_url} download={msg.file_name || "image"} target="_blank" rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-[11px] ${msg.is_admin ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Download className="h-3 w-3" /> تحميل
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

  const stats = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    closed: tickets.filter(t => t.status === "closed").length,
    mine: tickets.filter(t => t.assigned_to === user?.id).length,
    unassigned: tickets.filter(t => !t.assigned_to && t.status !== "closed").length,
  }), [tickets, user?.id]);

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (filter === "mine") list = list.filter(t => t.assigned_to === user?.id);
    else if (filter === "unassigned") list = list.filter(t => !t.assigned_to && t.status !== "closed");
    else if (filter !== "all") list = list.filter(t => t.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        t.subject?.toLowerCase().includes(q) ||
        t.user_name?.toLowerCase().includes(q) ||
        t.assigned_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tickets, filter, search, user?.id]);

  const StatusBadge = ({ status }: { status: string }) => {
    const c = statusConfig[status] || statusConfig.open;
    const Icon = c.icon;
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", c.color)}>
        <Icon className="h-3 w-3" />{c.label}
      </span>
    );
  };

  const timeAgo = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso); const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "الآن";
    if (m < 60) return `قبل ${m} د`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h} س`;
    return d.toLocaleDateString("ar-SA");
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  // ============ DETAIL VIEW ============
  if (selectedTicket) {
    const ticket = tickets.find(t => t.id === selectedTicket);
    const isMine = ticket?.assigned_to === user?.id;
    const isClaimed = !!ticket?.assigned_to;
    const claimedByOther = isClaimed && !isMine;

    return (
      <div className="space-y-4">
        {/* Header bar */}
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-l from-primary/5 via-card to-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-xl shrink-0"
                onClick={() => { setSelectedTicket(null); setMessages([]); setSelectedFile(null); }}>
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Avatar className="h-10 w-10 ring-2 ring-primary/30 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">{initials(ticket?.user_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground truncate">{ticket?.subject}</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{ticket?.user_name}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(ticket?.created_at)}</span>
                  {ticket && <><span>·</span><StatusBadge status={ticket.status} /></>}
                </div>
              </div>

              {/* Assignment indicator (admin-only) */}
              {isClaimed ? (
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <div className="text-xs leading-tight">
                    <p className="text-muted-foreground">يتابع الردّ:</p>
                    <p className="font-bold text-foreground">{isMine ? "أنت" : ticket?.assigned_name}</p>
                  </div>
                </div>
              ) : (
                <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                  غير مُسنَدة
                </Badge>
              )}

              <Select value={ticket?.status} onValueChange={v => updateTicketStatus(selectedTicket, v)}>
                <SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">مفتوحة</SelectItem>
                  <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                  <SelectItem value="closed">مغلقة</SelectItem>
                </SelectContent>
              </Select>

              {/* Quick access to student profile */}
              {ticket?.user_id && (
                <Popover onOpenChange={(open) => { if (open) loadStudentPeek(ticket.user_id); }}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5 border-primary/30 hover:bg-primary/10">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="hidden sm:inline">ملف الطالب</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-0 overflow-hidden" dir="rtl">
                    {peekLoading || !peekData ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div>
                        <div className="bg-gradient-to-l from-primary/10 to-transparent p-4 border-b">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12 ring-2 ring-primary/30">
                              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                {initials(peekData.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold truncate">{peekData.full_name || "بدون اسم"}</p>
                              <p className="text-xs text-muted-foreground truncate">{peekData.email}</p>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                          {peekData.phone_number && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              <span dir="ltr">{peekData.phone_number}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="rounded-lg border p-2">
                              <div className="text-muted-foreground text-[10px]">الباقة الحالية</div>
                              <div className="font-bold truncate">{peekData.activePlan}</div>
                            </div>
                            <div className="rounded-lg border p-2">
                              <div className="text-muted-foreground text-[10px]">الدقائق المتبقية</div>
                              <div className="font-bold">{peekData.totalMins}</div>
                            </div>
                            <div className="rounded-lg border p-2">
                              <div className="text-muted-foreground text-[10px] flex items-center gap-1"><Wallet className="h-3 w-3" /> الرصيد</div>
                              <div className="font-bold">{Number(peekData.balance).toFixed(2)}</div>
                            </div>
                            <div className="rounded-lg border p-2">
                              <div className="text-muted-foreground text-[10px]">التذاكر</div>
                              <div className="font-bold">
                                {peekData.openTickets} / {peekData.totalTickets}
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="w-full mt-2 rounded-lg gap-1.5"
                            onClick={() => window.open(`/admin/students/${peekData.user_id}`, "_blank")}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            فتح الملف الكامل
                          </Button>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Conflict / takeover banner */}
            {claimedByOther && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-300">
                  هذه التذكرة يتابعها <b>{ticket?.assigned_name}</b> حالياً — تجنّب التداخل، أو خذها إذا لزم.
                </span>
                <Button size="sm" variant="outline" className="ms-auto rounded-lg h-7 text-[11px]" onClick={reassignToMe}>
                  <UserCheck className="h-3.5 w-3.5 ml-1" />استلامها
                </Button>
              </div>
            )}
            {!isClaimed && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-foreground">لم يستلمها أحد بعد — سيتمّ تعيينك تلقائياً عند أول ردّ.</span>
                <Button size="sm" className="ms-auto rounded-lg h-7 text-[11px]" onClick={reassignToMe}>
                  استلام الآن
                </Button>
              </div>
            )}
            {isMine && (
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" className="text-xs h-7 rounded-lg gap-1" onClick={() => setTransferOpen(true)}>
                  <ArrowLeftRight className="h-3.5 w-3.5" /> تحويل لموظف آخر
                </Button>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={releaseTicket}>
                  تحرير التذكرة
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardContent className="p-4">
            <div className="h-[55vh] overflow-y-auto space-y-3 mb-4 pe-1">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare className="h-10 w-10 opacity-30 mb-2" />
                  <p className="text-sm">لا توجد رسائل بعد</p>
                </div>
              ) : messages.map(msg => {
                const isMyMessage = msg.is_admin && msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${msg.is_admin ? "justify-start" : "justify-end"} gap-2`}>
                    {msg.is_admin && (
                      <Avatar className="h-7 w-7 mt-1 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                          {initials(msg.sender_name || "موظف")}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm",
                      msg.is_admin
                        ? (isMyMessage ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground border border-border")
                        : "bg-muted text-foreground"
                    )}>
                      {msg.is_admin && (
                        <p className={cn("text-[10px] font-bold mb-0.5", isMyMessage ? "text-primary-foreground/80" : "text-primary")}>
                          {isMyMessage ? "أنت (موظف الدعم)" : `${msg.sender_name || "موظف الدعم"}`}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      {renderFileAttachment(msg)}
                      <p className={cn("text-[10px] mt-1",
                        msg.is_admin ? (isMyMessage ? "text-primary-foreground/60" : "text-muted-foreground") : "text-muted-foreground"
                      )}>
                        {new Date(msg.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 bg-muted rounded-lg px-3 py-2 text-sm">
                {selectedFile.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                <span className="truncate flex-1 text-foreground">{selectedFile.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedFile(null)}><X className="h-3 w-3" /></Button>
              </div>
            )}
            {claimedByOther ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-amber-700 dark:text-amber-300 flex-1">
                  🔒 التذكرة مقفلة — يتابعها <b>{ticket?.assigned_name}</b>. لا يمكنك الرد إلا بعد استلامها.
                </span>
                <Button size="sm" variant="outline" className="rounded-lg h-7 text-[11px] shrink-0" onClick={reassignToMe}>
                  <UserCheck className="h-3.5 w-3.5 ml-1" />استلامها
                </Button>
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleFileSelect} />
                <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <VoiceRecorder onRecorded={sendVoiceMessage} disabled={sending} />
                <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="اكتب ردك..." className="rounded-xl flex-1" dir="rtl" />
                <Button type="submit" size="icon" className="rounded-xl" disabled={(!newMessage.trim() && !selectedFile) || sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Transfer Ticket Dialog */}
        <Dialog open={transferOpen} onOpenChange={(o) => { setTransferOpen(o); if (!o) { setTransferTarget(null); setTransferNote(""); setTransferSearch(""); setTransferResults([]); } }}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" /> تحويل المحادثة لموظف آخر
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!transferTarget ? (
                <>
                  <p className="text-xs text-muted-foreground">ابحث عن موظف دعم آخر لنقل المتابعة إليه. سيتم إخطاره وتسجيل العملية في سجلّ الإدارة.</p>
                  <div className="relative">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pr-8 rounded-xl" placeholder="ابحث باسم الموظف..." value={transferSearch}
                      onChange={(e) => searchAdmins(e.target.value)} />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {transferResults.map(u => (
                      <button key={u.user_id} onClick={() => setTransferTarget(u)}
                        className="w-full text-right px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2">
                        <Avatar className="h-7 w-7"><AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">{initials(u.full_name)}</AvatarFallback></Avatar>
                        <span className="text-sm font-medium">{u.full_name || "بدون اسم"}</span>
                      </button>
                    ))}
                    {transferSearch.length >= 2 && transferResults.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-3">لا يوجد موظفون مطابقون</p>
                    )}
                    {transferSearch.length < 2 && (
                      <p className="text-center text-xs text-muted-foreground py-3">اكتب حرفين على الأقل للبحث</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
                    <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary/15 text-primary font-bold">{initials(transferTarget.full_name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">سيستلمها</p>
                      <p className="font-bold text-sm truncate">{transferTarget.full_name}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTransferTarget(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1 block">ملاحظة للموظف الجديد (اختياري)</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[90px]"
                      placeholder="مثال: العميل يحتاج متابعة استرداد المبلغ، تواصلت معه مسبقاً..."
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      maxLength={500}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{transferNote.length}/500 — ستظهر هذه الملاحظة كرسالة داخل المحادثة.</p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTransferOpen(false)}>إلغاء</Button>
              <Button disabled={!transferTarget || transferring} onClick={performTransfer} className="gap-1">
                {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowLeftRight className="h-4 w-4" /> تأكيد التحويل</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============ LIST VIEW ============
  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="rounded-2xl border bg-gradient-to-l from-primary/10 via-primary/5 to-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/15 grid place-items-center shrink-0">
            <Headphones className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-foreground">الدعم الفني</h2>
            <p className="text-xs text-muted-foreground">إدارة احترافية للتذاكر مع تتبع المتابعة بين الموظفين</p>
          </div>
          <Button className="rounded-xl gap-1" onClick={() => setInitiateOpen(true)}>
            <Plus className="h-4 w-4" /> رسالة لمستخدم
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
          <StatCard label="الإجمالي" value={stats.total} icon={MessageSquare} />
          <StatCard label="مفتوحة" value={stats.open} icon={AlertCircle} accent="emerald" />
          <StatCard label="قيد المعالجة" value={stats.in_progress} icon={Hourglass} accent="amber" />
          <StatCard label="غير مُسنَدة" value={stats.unassigned} icon={Users} accent="rose" />
          <StatCard label="تذاكري" value={stats.mine} icon={UserCheck} accent="primary" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={setFilter} className="flex-shrink-0">
          <TabsList className="rounded-xl">
            <TabsTrigger value="all" className="rounded-lg text-xs">الكل</TabsTrigger>
            <TabsTrigger value="open" className="rounded-lg text-xs">مفتوحة</TabsTrigger>
            <TabsTrigger value="in_progress" className="rounded-lg text-xs">قيد المعالجة</TabsTrigger>
            <TabsTrigger value="unassigned" className="rounded-lg text-xs gap-1">
              <Users className="h-3 w-3" /> غير مُسنَدة
            </TabsTrigger>
            <TabsTrigger value="mine" className="rounded-lg text-xs gap-1">
              <UserCheck className="h-3 w-3" /> تذاكري
            </TabsTrigger>
            <TabsTrigger value="closed" className="rounded-lg text-xs">مغلقة</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالعنوان، اسم العميل، أو الموظف..."
            className="pe-9 rounded-xl"
          />
        </div>
      </div>

      {/* Initiate dialog */}
      <Dialog open={initiateOpen} onOpenChange={(o) => { setInitiateOpen(o); if (!o) { setInitiateUser(null); setInitiateSubject(""); setInitiateMessage(""); setUserSearch(""); setUserResults([]); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إرسال رسالة لطالب أو معلم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!initiateUser ? (
              <>
                <div className="relative">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pr-8" placeholder="ابحث بالاسم..." value={userSearch}
                    onChange={async (e) => {
                      const q = e.target.value;
                      setUserSearch(q);
                      if (q.trim().length < 2) { setUserResults([]); return; }
                      const { data } = await supabase.from("profiles").select("user_id, full_name").ilike("full_name", `%${q}%`).limit(10);
                      setUserResults((data ?? []) as any);
                    }} />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {userResults.map(u => (
                    <button key={u.user_id} onClick={() => setInitiateUser(u)}
                      className="w-full text-right px-3 py-2 rounded-lg hover:bg-muted transition-colors">
                      {u.full_name || "بدون اسم"}
                    </button>
                  ))}
                  {userSearch.length >= 2 && userResults.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-3">لا توجد نتائج</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="flex-1 font-semibold text-sm">{initiateUser.full_name}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setInitiateUser(null)}><X className="h-3 w-3" /></Button>
                </div>
                <Input placeholder="عنوان المحادثة" value={initiateSubject} onChange={e => setInitiateSubject(e.target.value)} />
                <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
                  placeholder="الرسالة الأولى..." value={initiateMessage} onChange={e => setInitiateMessage(e.target.value)} />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInitiateOpen(false)}>إلغاء</Button>
            <Button disabled={!initiateUser || !initiateSubject.trim() || !initiateMessage.trim() || creating}
              onClick={async () => {
                if (!initiateUser || !user) return;
                setCreating(true);
                const { data: ticket, error } = await supabase.from("support_tickets")
                  .insert({
                    user_id: initiateUser.user_id, subject: initiateSubject.trim(), status: "in_progress",
                    assigned_to: user.id, assigned_at: new Date().toISOString(),
                  } as any)
                  .select().single();
                if (error || !ticket) { toast.error("فشل إنشاء المحادثة"); setCreating(false); return; }
                await supabase.from("support_messages").insert({
                  ticket_id: ticket.id, sender_id: user.id, content: initiateMessage.trim(), is_admin: true,
                });
                await supabase.from("notifications").insert({
                  user_id: initiateUser.user_id, title: "رسالة جديدة من خدمة العملاء 💬",
                  body: initiateMessage.slice(0, 140), type: "support_reply",
                  link: `/support?ticket=${ticket.id}`,
                } as any);
                toast.success("تم إرسال الرسالة");
                setInitiateOpen(false); setInitiateUser(null); setInitiateSubject(""); setInitiateMessage("");
                setCreating(false);
                fetchTickets();
                setSelectedTicket(ticket.id);
              }}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tickets list */}
      {filteredTickets.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <MessageSquare className="h-14 w-14 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">لا توجد تذاكر تطابق الفلتر</p>
            <p className="text-xs text-muted-foreground/70 mt-1">جرّب تغيير الفلتر أو البحث</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map(t => {
            const isMine = t.assigned_to === user?.id;
            const isUnassigned = !t.assigned_to;
            return (
              <Card key={t.id}
                className={cn(
                  "group cursor-pointer transition-all hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5 border",
                  isMine && "border-primary/40 bg-primary/5",
                  isUnassigned && t.status !== "closed" && "border-amber-500/30 bg-amber-500/5",
                )}
                onClick={() => setSelectedTicket(t.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 ring-2 ring-background shadow-sm shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">{initials(t.user_name)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <p className="font-bold text-sm text-foreground truncate flex-1">{t.subject}</p>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{t.user_name}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(t.updated_at || t.created_at)}</span>
                      </div>
                    </div>

                    {/* Assignment indicator (admin-only view) */}
                    <div className="shrink-0 text-end">
                      {t.assigned_to ? (
                        <div className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border",
                          isMine
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary text-secondary-foreground border-border"
                        )}>
                          <UserCheck className="h-3 w-3" />
                          {isMine ? "أنت تتابع" : t.assigned_name}
                        </div>
                      ) : t.status !== "closed" ? (
                        <div className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          <Users className="h-3 w-3" /> غير مُسنَدة
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: "emerald" | "amber" | "rose" | "primary" }) => {
  const colorMap = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    primary: "text-primary bg-primary/10",
    default: "text-foreground bg-muted",
  };
  const cls = colorMap[accent || "default"];
  return (
    <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-lg grid place-items-center shrink-0", cls)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
        <p className="text-lg font-extrabold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
};

export default SupportTicketsTab;
