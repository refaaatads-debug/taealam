import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, AlertTriangle, BookOpen, CheckCircle, CheckCircle2, Clock,
  FileWarning, History, Layers3, RefreshCw, TimerReset, Wrench, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MonitorStats {
  totalMaterials: number;
  todayMaterials: number;
  expiringSoon: number;
  failureLogs: number;
  avgCreationMs: number;
  missingMaterials: number;
}

type MonitorView = "overview" | "attention" | "logs";

interface MaterialRow {
  id: string;
  session_id: string;
  expires_at: string | null;
  created_at: string;
}

interface SessionRow {
  id: string;
  ended_at: string | null;
  duration_minutes: number | null;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function MaterialsMonitorTab() {
  const [stats, setStats] = useState<MonitorStats>({
    totalMaterials: 0, todayMaterials: 0, expiringSoon: 0,
    failureLogs: 0, avgCreationMs: 0, missingMaterials: 0,
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [expiringMaterials, setExpiringMaterials] = useState<MaterialRow[]>([]);
  const [missingSessions, setMissingSessions] = useState<SessionRow[]>([]);
  const [failureLogs, setFailureLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [activeView, setActiveView] = useState<MonitorView>("overview");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalMaterials },
      { count: todayMaterials },
      { data: expiringRows, count: expiringSoon },
      { data: logs },
      { data: errorRows, count: failureLogs },
    ] = await Promise.all([
      supabase.from("session_materials").select("*", { count: "exact", head: true }).eq("is_deleted", false),
      supabase.from("session_materials").select("*", { count: "exact", head: true }).gte("created_at", todayStart).eq("is_deleted", false),
      supabase.from("session_materials").select("id, session_id, expires_at, created_at", { count: "exact" }).eq("is_deleted", false).lte("expires_at", threeDaysFromNow).gt("expires_at", now.toISOString()).order("expires_at", { ascending: true }).limit(30),
      supabase.from("system_logs").select("*").eq("source", "session_materials").order("created_at", { ascending: false }).limit(20),
      supabase.from("system_logs").select("*", { count: "exact" }).eq("source", "session_materials").eq("level", "error").order("created_at", { ascending: false }).limit(20),
    ]);

    // Calculate avg creation time from logs
    const successLogs = (logs ?? []).filter(l => l.level === "info" && l.metadata && typeof l.metadata === "object" && !Array.isArray(l.metadata) && "elapsed_ms" in l.metadata);
    const avgMs = successLogs.length > 0
      ? successLogs.reduce((sum: number, l: any) => sum + ((l.metadata as any).elapsed_ms || 0), 0) / successLogs.length
      : 0;

    // Check missing materials (completed sessions without materials in last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: completedSessions } = await supabase
      .from("sessions")
      .select("id, ended_at, duration_minutes")
      .not("ended_at", "is", null)
      .gte("ended_at", sevenDaysAgo)
      .gte("duration_minutes", 5)
      .order("ended_at", { ascending: false })
      .limit(100);

    const sessionIds = (completedSessions ?? []).map(s => s.id);
    let missingCount = 0;
    let missingRows: SessionRow[] = [];
    if (sessionIds.length > 0) {
      const { data: existingMats } = await supabase
        .from("session_materials")
        .select("session_id")
        .in("session_id", sessionIds);
      const existingSet = new Set((existingMats ?? []).map(m => m.session_id));
      missingRows = (completedSessions ?? []).filter(session => !existingSet.has(session.id)) as SessionRow[];
      missingCount = missingRows.length;
    }

    setStats({
      totalMaterials: totalMaterials || 0,
      todayMaterials: todayMaterials || 0,
      expiringSoon: expiringSoon || 0,
      failureLogs: failureLogs || 0,
      avgCreationMs: Math.round(avgMs),
      missingMaterials: missingCount,
    });
    setRecentLogs(logs ?? []);
    setExpiringMaterials((expiringRows ?? []) as MaterialRow[]);
    setFailureLogs(errorRows ?? []);
    setMissingSessions(missingRows);
    setLoading(false);
  };

  const runRepair = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-materials");
      if (error) throw error;
      toast.success(`تم الإصلاح: ${data?.repaired || 0} مادة`);
      await fetchData();
    } catch (e: any) {
      toast.error("فشل الإصلاح: " + e.message);
    }
    setRepairing(false);
  };

  const statCards = [
    { label: "إجمالي المواد", value: stats.totalMaterials, icon: BookOpen, color: "text-primary" },
    { label: "مواد اليوم", value: stats.todayMaterials, icon: CheckCircle, color: "text-green-500" },
    { label: "تنتهي قريباً", value: stats.expiringSoon, icon: Clock, color: "text-orange-500" },
    { label: "أخطاء الإنشاء", value: stats.failureLogs, icon: XCircle, color: "text-destructive" },
    { label: "مواد ناقصة", value: stats.missingMaterials, icon: AlertTriangle, color: "text-orange-500" },
    { label: "متوسط وقت الإنشاء", value: stats.avgCreationMs + "ms", icon: Clock, color: "text-primary" },
  ];

  const views = [
    { id: "overview" as const, label: "ملخص المراقبة", icon: Activity },
    { id: "attention" as const, label: "يحتاج متابعة", icon: AlertTriangle, count: stats.missingMaterials + stats.expiringSoon + stats.failureLogs },
    { id: "logs" as const, label: "سجل العمليات", icon: History, count: recentLogs.length },
  ];

  if (loading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Layers3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black">مركز مراقبة المواد التعليمية</h2>
              <p className="mt-1 text-sm text-muted-foreground">متابعة إنشاء المواد، اكتمالها، صلاحيتها، وسجل تشغيلها من مكان واحد</p>
            </div>
          </div>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={fetchData} disabled={loading || repairing}>
          <RefreshCw className="h-4 w-4" />
          تحديث المركز
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-3">
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <Button
              key={view.id}
              variant="ghost"
              onClick={() => setActiveView(view.id)}
              className={`h-11 justify-between rounded-xl px-4 text-sm font-bold ${activeView === view.id ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{view.label}</span>
              {view.count !== undefined && view.count > 0 ? <Badge variant={view.id === "attention" ? "destructive" : "secondary"}>{view.count}</Badge> : null}
            </Button>
          );
        })}
      </div>

      {activeView === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {statCards.map((s) => (
              <Card key={s.label} className="border-0 shadow-sm">
                <CardContent className="p-4 text-center">
                  <s.icon className={`mx-auto mb-2 h-5 w-5 ${s.color}`} />
                  <p className="text-xl font-black">{s.value}</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-primary/15 bg-primary/[0.03]">
              <CardContent className="p-5">
                <BookOpen className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-bold">دورة المادة</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">يتم هنا رصد المواد منذ إنشائها وحتى انتهاء صلاحيتها، مع إبراز الجلسات التي لم تنتج مادة.</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/[0.03]">
              <CardContent className="p-5">
                <TimerReset className="h-5 w-5 text-amber-600" />
                <h3 className="mt-3 font-bold">المتابعة الوقائية</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">راجع المواد التي ستنتهي خلال ثلاثة أيام قبل أن تؤثر على وصول الطلاب إليها.</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
              <CardContent className="p-5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="mt-3 font-bold">إجراء آمن</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">الإصلاح التلقائي محصور في المواد الناقصة، ولا يحذف المواد أو السجلات الموجودة.</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {activeView === "attention" && (
        <div className="space-y-4">
          {stats.missingMaterials > 0 && (
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-orange-500" />جلسات مكتملة بلا مادة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">{stats.missingMaterials} جلسة خلال آخر 7 أيام تحتاج مادة تعليمية</p>
                  <Button size="sm" onClick={runRepair} disabled={repairing} className="shrink-0">
                    <RefreshCw className={`ml-1 h-4 w-4 ${repairing ? "animate-spin" : ""}`} />
                    {repairing ? "جاري الإصلاح..." : "إصلاح تلقائي"}
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {missingSessions.slice(0, 12).map((session) => (
                    <div key={session.id} className="flex items-center justify-between rounded-xl bg-background/70 p-3 text-sm">
                      <span className="font-mono text-xs">{session.id.slice(0, 12)}…</span>
                      <span className="text-xs text-muted-foreground">{formatDate(session.ended_at)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-amber-600" />تنتهي خلال 3 أيام</CardTitle></CardHeader>
              <CardContent>
                {expiringMaterials.length === 0 ? <EmptyState label="لا توجد مواد ستنتهي قريبًا" /> : (
                  <div className="space-y-2">
                    {expiringMaterials.slice(0, 8).map((material) => (
                      <div key={material.id} className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-xs">
                        <span className="font-mono">{material.session_id.slice(0, 12)}…</span>
                        <Badge variant="outline" className="border-amber-500/30 text-amber-700">{formatDate(material.expires_at)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FileWarning className="h-4 w-4 text-destructive" />أخطاء إنشاء المواد</CardTitle></CardHeader>
              <CardContent>
                {failureLogs.length === 0 ? <EmptyState label="لا توجد أخطاء مسجلة" /> : (
                  <div className="space-y-2">
                    {failureLogs.slice(0, 8).map((log) => (
                      <div key={log.id} className="rounded-xl bg-destructive/[0.04] p-3">
                        <p className="truncate text-xs font-semibold">{log.message || "خطأ غير موصوف"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(log.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeView === "logs" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />سجل تشغيل مركز المواد</CardTitle></CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? <EmptyState label="لا توجد سجلات حتى الآن" /> : (
              <div className="space-y-2">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-xl bg-muted/30 p-3 text-sm">
                    <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "secondary" : "outline"} className="mt-0.5 text-[10px]">{log.level}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">{log.message}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(log.created_at)}{log.metadata?.session_id && ` • جلسة: ${(log.metadata.session_id as string).slice(0, 8)}…`}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
      <CheckCircle2 className="h-7 w-7 text-emerald-500/70" />
      <span>{label}</span>
    </div>
  );
}
