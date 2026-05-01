import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, CheckCircle, XCircle, Clock, GraduationCap,
  CreditCard, MessageSquare, ShieldAlert, ArrowLeft, Flame,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";

type Priority = "high" | "medium" | "low";
type TaskItem = {
  id: string;
  kind: "teacher" | "withdrawal" | "support" | "violation";
  title: string;
  subtitle?: string;
  created_at: string;
  priority: Priority;
  raw: any;
};

// ربط كل نوع مهمة بالصلاحية المطلوبة لاتخاذ إجراء عليها
const KIND_PERMISSION: Record<TaskItem["kind"], string> = {
  teacher: "manage_teachers",
  withdrawal: "manage_withdrawals",
  support: "manage_support",
  violation: "manage_violations",
};

interface Props {
  onOpenTab?: (tab: string) => void;
}

const PRIORITY_META: Record<Priority, { label: string; color: string; ring: string }> = {
  high: { label: "عاجل", color: "bg-destructive/10 text-destructive border-destructive/30", ring: "ring-destructive/30" },
  medium: { label: "متوسط", color: "bg-warning/10 text-warning border-warning/30", ring: "ring-warning/20" },
  low: { label: "عادي", color: "bg-info/10 text-info border-info/30", ring: "ring-info/20" },
};

const ageHours = (iso: string) => (Date.now() - +new Date(iso)) / 3_600_000;

const computePriority = (kind: TaskItem["kind"], created_at: string): Priority => {
  const h = ageHours(created_at);
  if (kind === "violation") return "high";
  if (kind === "withdrawal") return h > 24 ? "high" : "medium";
  if (kind === "support") return h > 12 ? "high" : "medium";
  if (kind === "teacher") return h > 48 ? "high" : h > 12 ? "medium" : "low";
  return "low";
};

const kindMeta = (k: TaskItem["kind"]) => {
  switch (k) {
    case "teacher": return { icon: GraduationCap, label: "معلم", tab: "teachers", color: "text-secondary" };
    case "withdrawal": return { icon: CreditCard, label: "سحب", tab: "withdrawals", color: "text-warning" };
    case "support": return { icon: MessageSquare, label: "دعم", tab: "support", color: "text-info" };
    case "violation": return { icon: ShieldAlert, label: "مخالفة", tab: "violations", color: "text-destructive" };
  }
};

const POSTPONE_KEY = "admin_postponed_tasks_v1";
const loadPostponed = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(POSTPONE_KEY) || "{}"); } catch { return {}; }
};
const savePostponed = (m: Record<string, number>) => {
  try { localStorage.setItem(POSTPONE_KEY, JSON.stringify(m)); } catch {}
};

export default function AdminUrgentTasks({ onOpenTab }: Props) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Priority>("all");
  const { isFullAdmin, can, loading: permLoading } = useAdminPermissions();

  // يحدد ما إذا كان المستخدم يستطيع اتخاذ إجراء على نوع مهمة معين
  const canActOn = (kind: TaskItem["kind"]) => isFullAdmin || can(KIND_PERMISSION[kind]);
  // دور المستخدم لعرضه كشارة
  const roleLabel = isFullAdmin ? "مدير عام" : "مراجع";

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const [teachersRes, withdrRes, supportRes, violRes] = await Promise.all([
        supabase.from("teacher_profiles").select("id, user_id, hourly_rate, years_experience, created_at").eq("is_approved", false).order("created_at", { ascending: false }).limit(10),
        (supabase as any).from("withdrawal_requests").select("id, teacher_id, amount, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10),
        supabase.from("support_tickets").select("id, user_id, subject, category, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(10),
        (supabase as any).from("violations").select("id, user_id, violation_type, created_at").eq("is_reviewed", false).order("created_at", { ascending: false }).limit(10),
      ]);

      // Resolve names for teachers + withdrawals + support + violations
      const allUserIds = new Set<string>();
      (teachersRes.data || []).forEach(t => allUserIds.add(t.user_id));
      (withdrRes.data || []).forEach((w: any) => allUserIds.add(w.teacher_id));
      (supportRes.data || []).forEach((s: any) => allUserIds.add(s.user_id));
      (violRes.data || []).forEach((v: any) => allUserIds.add(v.user_id));
      const ids = Array.from(allUserIds);
      const profileMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
        (data || []).forEach(p => profileMap.set(p.user_id, p.full_name || ""));
      }

      const aggregated: TaskItem[] = [
        ...(teachersRes.data || []).map((t: any) => ({
          id: `tch-${t.id}`,
          kind: "teacher" as const,
          title: profileMap.get(t.user_id) || "طلب تسجيل معلم",
          subtitle: `${t.years_experience || 0} سنة خبرة · ${t.hourly_rate || 0} ر.س/س`,
          created_at: t.created_at,
          priority: computePriority("teacher", t.created_at),
          raw: t,
        })),
        ...(withdrRes.data || []).map((w: any) => ({
          id: `wdr-${w.id}`,
          kind: "withdrawal" as const,
          title: `${profileMap.get(w.teacher_id) || "معلم"} — سحب ${Number(w.amount || 0).toFixed(2)} ر.س`,
          subtitle: "بانتظار المراجعة والتحويل",
          created_at: w.created_at,
          priority: computePriority("withdrawal", w.created_at),
          raw: w,
        })),
        ...(supportRes.data || []).map((s: any) => ({
          id: `sup-${s.id}`,
          kind: "support" as const,
          title: s.subject || "تذكرة دعم",
          subtitle: `${profileMap.get(s.user_id) || "مستخدم"} · ${s.category || "عام"}`,
          created_at: s.created_at,
          priority: computePriority("support", s.created_at),
          raw: s,
        })),
        ...((violRes.data || []) as any[]).map((v: any) => ({
          id: `vio-${v.id}`,
          kind: "violation" as const,
          title: `مخالفة: ${v.violation_type || "غير محددة"}`,
          subtitle: profileMap.get(v.user_id) || "مستخدم",
          created_at: v.created_at,
          priority: computePriority("violation", v.created_at),
          raw: v,
        })),
      ];

      // Filter postponed (snoozed for 4h)
      const postponed = loadPostponed();
      const now = Date.now();
      const visible = aggregated.filter(t => {
        const until = postponed[t.id];
        return !until || until < now;
      });

      // Sort by priority then date
      const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      visible.sort((a, b) => order[a.priority] - order[b.priority] || +new Date(b.created_at) - +new Date(a.created_at));

      setTasks(visible);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const channels = [
      supabase.channel("urgent-teachers").on("postgres_changes", { event: "*", schema: "public", table: "teacher_profiles" }, () => fetchTasks()),
      supabase.channel("urgent-withdr").on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, () => fetchTasks()),
      supabase.channel("urgent-support").on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchTasks()),
    ];
    channels.forEach(ch => ch.subscribe());
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, []);

  const approve = async (t: TaskItem) => {
    try {
      if (t.kind === "teacher") {
        const { error } = await supabase.from("teacher_profiles").update({ is_approved: true, is_verified: true }).eq("id", t.raw.id);
        if (error) throw error;
        toast.success("تمت الموافقة على المعلم");
      } else if (t.kind === "withdrawal") {
        const { error } = await (supabase as any).from("withdrawal_requests").update({ status: "approved" }).eq("id", t.raw.id);
        if (error) throw error;
        toast.success("تمت الموافقة على السحب");
      } else if (t.kind === "support") {
        const { error } = await supabase.from("support_tickets").update({ status: "resolved" }).eq("id", t.raw.id);
        if (error) throw error;
        toast.success("تم إغلاق التذكرة");
      } else if (t.kind === "violation") {
        const { error } = await (supabase as any).from("violations").update({ is_reviewed: true }).eq("id", t.raw.id);
        if (error) throw error;
        toast.success("تم تأكيد المخالفة");
      }
      setTasks(prev => prev.filter(x => x.id !== t.id));
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    }
  };

  const reject = async (t: TaskItem) => {
    try {
      if (t.kind === "teacher") {
        await supabase.from("teacher_profiles").delete().eq("id", t.raw.id);
        await supabase.from("user_roles").update({ role: "student" as any }).eq("user_id", t.raw.user_id);
        toast.success("تم رفض طلب المعلم");
      } else if (t.kind === "withdrawal") {
        const { error } = await (supabase as any).from("withdrawal_requests").update({ status: "rejected" }).eq("id", t.raw.id);
        if (error) throw error;
        toast.success("تم رفض طلب السحب");
      } else if (t.kind === "support") {
        const { error } = await supabase.from("support_tickets").update({ status: "closed" }).eq("id", t.raw.id);
        if (error) throw error;
        toast.success("تم إغلاق التذكرة");
      } else if (t.kind === "violation") {
        const { error } = await (supabase as any).from("violations").update({ is_reviewed: true, is_false_positive: true }).eq("id", t.raw.id);
        if (error) throw error;
        toast.success("تم تعليم المخالفة كاستثناء");
      }
      setTasks(prev => prev.filter(x => x.id !== t.id));
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    }
  };

  const postpone = (t: TaskItem) => {
    const map = loadPostponed();
    map[t.id] = Date.now() + 4 * 3_600_000; // 4h
    savePostponed(map);
    setTasks(prev => prev.filter(x => x.id !== t.id));
    toast("تم تأجيل المهمة 4 ساعات", { description: t.title });
  };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.priority === filter);
  const highCount = tasks.filter(t => t.priority === "high").length;

  const timeAgo = (iso: string) => {
    const h = ageHours(iso);
    if (h < 1) return "منذ دقائق";
    if (h < 24) return `منذ ${Math.floor(h)} س`;
    return `منذ ${Math.floor(h / 24)} يوم`;
  };

  return (
    <Card className="border border-border/50 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-l from-destructive/5 via-transparent to-warning/5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Flame className="h-4 w-4 text-destructive" />
            المهام العاجلة
            {!permLoading && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-primary/5 text-primary border-primary/20">
                {roleLabel}
              </Badge>
            )}
            {highCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] h-5 px-1.5 gap-1">
                <AlertTriangle className="h-2.5 w-2.5" />
                {highCount} عاجل
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-1.5">
            {(["all", "high", "medium", "low"] as const).map(p => {
              const active = filter === p;
              const labels = { all: "الكل", high: "عاجل", medium: "متوسط", low: "عادي" } as const;
              return (
                <button
                  key={p}
                  onClick={() => setFilter(p)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">جاري تحميل المهام...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <CheckCircle className="h-10 w-10 mx-auto text-success opacity-60" />
            <p className="text-sm text-muted-foreground">لا توجد مهام عاجلة 🎉</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
            {filtered.map(t => {
              const meta = kindMeta(t.kind);
              const Icon = meta.icon;
              const prio = PRIORITY_META[t.priority];
              return (
                <div
                  key={t.id}
                  className={`p-4 hover:bg-muted/30 transition-colors ${t.priority === "high" ? "border-r-4 border-destructive" : t.priority === "medium" ? "border-r-4 border-warning" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center ring-2 ${prio.ring}`}>
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                        <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${prio.color}`}>{prio.label}</Badge>
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-muted/50">{meta.label}</Badge>
                      </div>
                      {t.subtitle && <p className="text-xs text-muted-foreground truncate">{t.subtitle}</p>}
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> {timeAgo(t.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Button size="sm" onClick={() => approve(t)} className="h-7 text-[11px] gap-1 bg-success hover:bg-success/90 text-success-foreground rounded-lg">
                      <CheckCircle className="h-3 w-3" /> موافقة
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => reject(t)} className="h-7 text-[11px] gap-1 rounded-lg">
                      <XCircle className="h-3 w-3" /> رفض
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => postpone(t)} className="h-7 text-[11px] gap-1 rounded-lg">
                      <Clock className="h-3 w-3" /> تأجيل
                    </Button>
                    {onOpenTab && (
                      <Button size="sm" variant="ghost" onClick={() => onOpenTab(meta.tab)} className="h-7 text-[11px] gap-1 mr-auto">
                        التفاصيل <ArrowLeft className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
