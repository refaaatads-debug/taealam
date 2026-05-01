import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell, BellRing, CheckCheck, AlertTriangle, ShieldAlert,
  CreditCard, MessageSquare, BookOpen, UserCheck, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AlertItem = {
  id: string;
  source: "withdrawal" | "support" | "violation" | "booking" | "teacher";
  title: string;
  body?: string;
  created_at: string;
  is_read: boolean;
};

const SOURCES: { value: AlertItem["source"] | "all"; label: string; icon: any; color: string }[] = [
  { value: "all", label: "الكل", icon: Bell, color: "text-foreground" },
  { value: "withdrawal", label: "سحوبات", icon: CreditCard, color: "text-warning" },
  { value: "support", label: "دعم", icon: MessageSquare, color: "text-info" },
  { value: "violation", label: "مخالفات", icon: ShieldAlert, color: "text-destructive" },
  { value: "booking", label: "حجوزات", icon: BookOpen, color: "text-primary" },
  { value: "teacher", label: "معلمين", icon: UserCheck, color: "text-secondary" },
];

const sourceMeta = (s: AlertItem["source"]) => {
  switch (s) {
    case "withdrawal": return { icon: CreditCard, color: "from-warning/20 to-warning/5", text: "text-warning", label: "سحب أرباح" };
    case "support": return { icon: MessageSquare, color: "from-info/20 to-info/5", text: "text-info", label: "دعم فني" };
    case "violation": return { icon: ShieldAlert, color: "from-destructive/20 to-destructive/5", text: "text-destructive", label: "مخالفة" };
    case "booking": return { icon: BookOpen, color: "from-primary/20 to-primary/5", text: "text-primary", label: "حجز جديد" };
    case "teacher": return { icon: UserCheck, color: "from-secondary/20 to-secondary/5", text: "text-secondary", label: "معلم جديد" };
  }
};

interface Props {
  onOpenTab?: (tab: string) => void;
}

const READ_KEY = "admin_read_alerts_v1";

export default function AdminLiveAlerts({ onOpenTab }: Props) {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<AlertItem["source"] | "all">("all");
  const [loading, setLoading] = useState(true);

  const loadReadIds = (): Set<string> => {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); } catch { return new Set(); }
  };
  const persistReadIds = (set: Set<string>) => {
    try { localStorage.setItem(READ_KEY, JSON.stringify(Array.from(set).slice(-500))); } catch {}
  };

  const fetchAll = async () => {
    setLoading(true);
    const readIds = loadReadIds();
    try {
      const [withdr, support, viol, bookings, teachers] = await Promise.all([
        supabase.from("withdrawal_requests").select("id, amount, status, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(15),
        supabase.from("support_tickets").select("id, subject, status, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(15),
        (supabase as any).from("violations").select("id, violation_type, created_at, is_reviewed").eq("is_reviewed", false).order("created_at", { ascending: false }).limit(15),
        supabase.from("bookings").select("id, status, scheduled_at, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(15),
        supabase.from("teacher_profiles").select("id, is_approved, created_at").eq("is_approved", false).order("created_at", { ascending: false }).limit(15),
      ]);

      const aggregated: AlertItem[] = [
        ...(withdr.data || []).map((w: any) => ({
          id: `w-${w.id}`, source: "withdrawal" as const,
          title: `طلب سحب جديد بقيمة ${Number(w.amount || 0).toFixed(2)} ر.س`,
          body: "بانتظار المراجعة والتحويل",
          created_at: w.created_at, is_read: readIds.has(`w-${w.id}`),
        })),
        ...(support.data || []).map((s: any) => ({
          id: `s-${s.id}`, source: "support" as const,
          title: s.subject || "تذكرة دعم جديدة",
          body: "تذكرة مفتوحة بانتظار الرد",
          created_at: s.created_at, is_read: readIds.has(`s-${s.id}`),
        })),
        ...((viol.data || []) as any[]).map((v: any) => ({
          id: `v-${v.id}`, source: "violation" as const,
          title: `مخالفة: ${v.violation_type || "غير محددة"}`,
          body: "بانتظار المراجعة",
          created_at: v.created_at, is_read: readIds.has(`v-${v.id}`),
        })),
        ...(bookings.data || []).map((b: any) => ({
          id: `b-${b.id}`, source: "booking" as const,
          title: "حجز جديد بانتظار التأكيد",
          body: new Date(b.scheduled_at).toLocaleDateString("ar-SA"),
          created_at: b.created_at, is_read: readIds.has(`b-${b.id}`),
        })),
        ...(teachers.data || []).map((t: any) => ({
          id: `t-${t.id}`, source: "teacher" as const,
          title: "طلب تسجيل معلم جديد",
          body: "بانتظار الموافقة",
          created_at: t.created_at, is_read: readIds.has(`t-${t.id}`),
        })),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      setItems(aggregated);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const channels = [
      supabase.channel("alerts-withdrawals").on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, () => fetchAll()),
      supabase.channel("alerts-support").on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchAll()),
      supabase.channel("alerts-bookings").on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchAll()),
      supabase.channel("alerts-teachers").on("postgres_changes", { event: "*", schema: "public", table: "teacher_profiles" }, () => fetchAll()),
    ];
    channels.forEach(ch => ch.subscribe());
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, []);

  const filtered = items.filter(i => filter === "all" || i.source === filter);
  const unreadCount = items.filter(i => !i.is_read).length;

  const markRead = (id: string) => {
    const read = loadReadIds(); read.add(id); persistReadIds(read);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i));
  };

  const markAllRead = () => {
    const read = loadReadIds();
    items.forEach(i => read.add(i.id));
    persistReadIds(read);
    setItems(prev => prev.map(i => ({ ...i, is_read: true })));
    toast.success("تم تعليم كل التنبيهات كمقروءة");
  };

  const handleOpen = (item: AlertItem) => {
    markRead(item.id);
    if (!onOpenTab) return;
    const tabMap: Record<AlertItem["source"], string> = {
      withdrawal: "withdrawals",
      support: "support",
      violation: "violations",
      booking: "bookings",
      teacher: "teachers",
    };
    onOpenTab(tabMap[item.source]);
  };

  const timeAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - +new Date(iso)) / 1000);
    if (diff < 60) return "الآن";
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  };

  return (
    <Card className="border border-border/50 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-l from-primary/5 to-transparent">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <div className="relative">
              <BellRing className="h-4 w-4 text-primary" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive animate-pulse" />
              )}
            </div>
            التنبيهات الفورية
            {unreadCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] h-5 px-1.5">
                {unreadCount} جديد
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" onClick={markAllRead} className="h-8 text-xs gap-1">
              <CheckCheck className="h-3.5 w-3.5" />
              تعليم الكل كمقروء
            </Button>
          )}
        </div>

        {/* Source filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {SOURCES.map(s => {
            const Icon = s.icon;
            const active = filter === s.value;
            const count = s.value === "all" ? items.length : items.filter(i => i.source === s.value).length;
            return (
              <button
                key={s.value}
                onClick={() => setFilter(s.value)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  active
                    ? "bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {s.label}
                <span className={`text-[10px] ${active ? "opacity-90" : "opacity-60"}`}>({count})</span>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-[360px]">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">جاري تحميل التنبيهات...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Bell className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">لا توجد تنبيهات{filter !== "all" ? " في هذا التصنيف" : ""}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map(item => {
                const meta = sourceMeta(item.source);
                const Icon = meta.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleOpen(item)}
                    className={`w-full flex items-start gap-3 p-3.5 text-right hover:bg-muted/30 transition-colors group ${
                      !item.is_read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 ${meta.text}`} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-semibold truncate ${!item.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                          {item.title}
                        </p>
                        {!item.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      {item.body && <p className="text-xs text-muted-foreground truncate">{item.body}</p>}
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-[10px] text-muted-foreground">{timeAgo(item.created_at)}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className={`text-[10px] font-semibold ${meta.text}`}>{meta.label}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
