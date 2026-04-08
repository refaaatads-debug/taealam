import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, AlertTriangle, CheckCircle, XCircle, RefreshCw, Clock } from "lucide-react";
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

export default function MaterialsMonitorTab() {
  const [stats, setStats] = useState<MonitorStats>({
    totalMaterials: 0, todayMaterials: 0, expiringSoon: 0,
    failureLogs: 0, avgCreationMs: 0, missingMaterials: 0,
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalMaterials },
      { count: todayMaterials },
      { count: expiringSoon },
      { data: logs },
      { count: failureLogs },
    ] = await Promise.all([
      supabase.from("session_materials").select("*", { count: "exact", head: true }).eq("is_deleted", false),
      supabase.from("session_materials").select("*", { count: "exact", head: true }).gte("created_at", todayStart).eq("is_deleted", false),
      supabase.from("session_materials").select("*", { count: "exact", head: true }).eq("is_deleted", false).lte("expires_at", threeDaysFromNow).gt("expires_at", now.toISOString()),
      supabase.from("system_logs").select("*").eq("source", "session_materials").order("created_at", { ascending: false }).limit(20),
      supabase.from("system_logs").select("*", { count: "exact", head: true }).eq("source", "session_materials").eq("level", "error"),
    ]);

    // Calculate avg creation time from logs
    const successLogs = (logs ?? []).filter(l => l.level === "info" && l.metadata?.elapsed_ms);
    const avgMs = successLogs.length > 0
      ? successLogs.reduce((sum: number, l: any) => sum + (l.metadata.elapsed_ms || 0), 0) / successLogs.length
      : 0;

    // Check missing materials (completed sessions without materials in last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: completedSessions } = await supabase
      .from("sessions")
      .select("id")
      .not("ended_at", "is", null)
      .gte("ended_at", sevenDaysAgo)
      .gte("duration_minutes", 5);

    const sessionIds = (completedSessions ?? []).map(s => s.id);
    let missingCount = 0;
    if (sessionIds.length > 0) {
      const { data: existingMats } = await supabase
        .from("session_materials")
        .select("session_id")
        .in("session_id", sessionIds);
      const existingSet = new Set((existingMats ?? []).map(m => m.session_id));
      missingCount = sessionIds.filter(id => !existingSet.has(id)).length;
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
    setLoading(false);
  };

  const runRepair = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-materials");
      if (error) throw error;
      toast.success(`تم الإصلاح: ${data?.repaired || 0} مادة`);
      fetchData();
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

  if (loading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert if missing */}
      {stats.missingMaterials > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-bold text-foreground">{stats.missingMaterials} جلسة بدون مادة تعليمية</p>
                <p className="text-xs text-muted-foreground">يمكن إصلاحها تلقائياً</p>
              </div>
            </div>
            <Button size="sm" onClick={runRepair} disabled={repairing}>
              <RefreshCw className={`h-4 w-4 ml-1 ${repairing ? "animate-spin" : ""}`} />
              {repairing ? "جاري الإصلاح..." : "إصلاح تلقائي"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Logs */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            سجل العمليات الأخير
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد سجلات</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 text-sm">
                  <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "secondary" : "outline"} className="text-[10px] mt-0.5">
                    {log.level}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground truncate">{log.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("ar-SA")}
                      {log.metadata?.session_id && ` • جلسة: ${(log.metadata.session_id as string).slice(0, 8)}...`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
