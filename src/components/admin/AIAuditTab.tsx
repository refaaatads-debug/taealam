import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import {
  Brain, CheckCircle, XCircle, Clock, TrendingUp, RefreshCw,
  AlertTriangle, Activity, Zap, Star, RotateCcw, ThumbsDown
} from "lucide-react";
import DateFilter from "./DateFilter";

const COLORS = ["hsl(var(--primary))", "hsl(142 71% 45%)", "hsl(0 84% 60%)", "hsl(48 96% 53%)", "hsl(280 65% 60%)"];

const AIAuditTab = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState({
    total: 0, success: 0, failed: 0, avgResponseTime: 0,
    avgQuality: 0, totalRetries: 0, successRate: 0,
    avgUsefulness: 0, regeneratedCount: 0, weakReportsCount: 0, weakReportsRatio: 0,
  });
  const [featureStats, setFeatureStats] = useState<any[]>([]);
  const [dailyStats, setDailyStats] = useState<any[]>([]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase.from("ai_logs" as any).select("*").order("created_at", { ascending: false }).limit(500);
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");

      const { data, error } = await query;
      if (error) throw error;

      const logsData = (data as any[]) || [];
      setLogs(logsData);

      const total = logsData.length;
      const success = logsData.filter(l => l.status === "success").length;
      const failed = logsData.filter(l => l.status === "failed").length;
      const avgResponseTime = total > 0
        ? Math.round(logsData.reduce((s, l) => s + (l.response_time_ms || 0), 0) / total) : 0;
      const qualityLogs = logsData.filter(l => l.quality_score > 0);
      const avgQuality = qualityLogs.length > 0
        ? Math.round(qualityLogs.reduce((s, l) => s + (l.quality_score || 0), 0) / qualityLogs.length) : 0;
      const totalRetries = logsData.reduce((s, l) => s + (l.retry_count || 0), 0);
      const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

      // Real quality metrics
      const usefulnessLogs = logsData.filter(l => l.usefulness_score != null && l.usefulness_score > 0);
      const avgUsefulness = usefulnessLogs.length > 0
        ? Math.round((usefulnessLogs.reduce((s, l) => s + (l.usefulness_score || 0), 0) / usefulnessLogs.length) * 10) / 10 : 0;
      const regeneratedCount = logsData.filter(l => l.is_regenerated).length;
      const weakReportsCount = usefulnessLogs.filter(l => (l.usefulness_score || 0) < 6).length;
      const weakReportsRatio = usefulnessLogs.length > 0 ? Math.round((weakReportsCount / usefulnessLogs.length) * 100) : 0;

      setStats({ total, success, failed, avgResponseTime, avgQuality, totalRetries, successRate, avgUsefulness, regeneratedCount, weakReportsCount, weakReportsRatio });

      // Feature breakdown
      const featureMap = new Map<string, { total: number; success: number; failed: number; avgTime: number; avgQuality: number; avgUsefulness: number; regenerated: number; usefulnessCount: number }>();
      for (const l of logsData) {
        const f = featureMap.get(l.feature_name) || { total: 0, success: 0, failed: 0, avgTime: 0, avgQuality: 0, avgUsefulness: 0, regenerated: 0, usefulnessCount: 0 };
        f.total++;
        if (l.status === "success") f.success++; else f.failed++;
        f.avgTime += (l.response_time_ms || 0);
        f.avgQuality += (l.quality_score || 0);
        if (l.usefulness_score != null && l.usefulness_score > 0) {
          f.avgUsefulness += l.usefulness_score;
          f.usefulnessCount++;
        }
        if (l.is_regenerated) f.regenerated++;
        featureMap.set(l.feature_name, f);
      }

      setFeatureStats(Array.from(featureMap.entries()).map(([name, f]) => ({
        name: getFeatureLabel(name), key: name,
        total: f.total, success: f.success, failed: f.failed,
        successRate: f.total > 0 ? Math.round((f.success / f.total) * 100) : 0,
        avgTime: f.total > 0 ? Math.round(f.avgTime / f.total) : 0,
        avgQuality: f.total > 0 ? Math.round(f.avgQuality / f.total) : 0,
        avgUsefulness: f.usefulnessCount > 0 ? Math.round((f.avgUsefulness / f.usefulnessCount) * 10) / 10 : 0,
        regenerated: f.regenerated,
      })));

      // Daily stats
      const dayMap = new Map<string, { total: number; success: number; failed: number; avgUsefulness: number; usefulnessCount: number }>();
      for (const l of logsData) {
        const day = new Date(l.created_at).toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
        const d = dayMap.get(day) || { total: 0, success: 0, failed: 0, avgUsefulness: 0, usefulnessCount: 0 };
        d.total++;
        if (l.status === "success") d.success++; else d.failed++;
        if (l.usefulness_score != null && l.usefulness_score > 0) {
          d.avgUsefulness += l.usefulness_score;
          d.usefulnessCount++;
        }
        dayMap.set(day, d);
      }
      setDailyStats(Array.from(dayMap.entries()).map(([day, d]) => ({
        day, ...d,
        usefulness: d.usefulnessCount > 0 ? Math.round((d.avgUsefulness / d.usefulnessCount) * 10) / 10 : 0,
      })).reverse());
    } catch {
      toast.error("خطأ في تحميل سجلات AI");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [dateFrom, dateTo]);

  const getFeatureLabel = (name: string) => {
    const labels: Record<string, string> = {
      session_report: "تقارير الحصص",
      teacher_performance: "أداء المعلمين",
      violation_analysis: "تحليل المخالفات",
      ai_tutor: "المعلم الذكي",
      smart_matching: "التوصيات الذكية",
    };
    return labels[name] || name;
  };

  const getStatusBadge = (status: string) => {
    if (status === "success") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">ناجح</Badge>;
    return <Badge variant="destructive">فشل</Badge>;
  };

  const getUsefulnessColor = (score: number) => {
    if (score >= 8) return "text-green-600 dark:text-green-400";
    if (score >= 6) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const pieData = featureStats.map(f => ({ name: f.name, value: f.total }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          فحص أداء الذكاء الاصطناعي
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      {/* Quality Alert */}
      {stats.weakReportsRatio > 20 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" />
            <div>
              <p className="font-bold text-destructive">تنبيه: تدهور جودة AI</p>
              <p className="text-sm text-muted-foreground">
                {stats.weakReportsRatio}% من التقارير ضعيفة الجودة ({stats.weakReportsCount} تقرير).
                يجب مراجعة الـ Prompts أو التحقق من جودة البيانات المدخلة.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards - Row 1: Basic */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">إجمالي العمليات</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats.successRate}%</p>
            <p className="text-xs text-muted-foreground">نسبة النجاح</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.avgResponseTime}</p>
            <p className="text-xs text-muted-foreground">متوسط الاستجابة (ms)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.avgQuality}</p>
            <p className="text-xs text-muted-foreground">جودة الشكل</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards - Row 2: Real Quality */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-primary/30">
          <CardContent className="p-4 text-center">
            <Star className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className={`text-2xl font-bold ${getUsefulnessColor(stats.avgUsefulness)}`}>{stats.avgUsefulness}/10</p>
            <p className="text-xs text-muted-foreground">الجودة الحقيقية (AI Eval)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <RotateCcw className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.regeneratedCount}</p>
            <p className="text-xs text-muted-foreground">تقارير مُعاد توليدها</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ThumbsDown className="h-5 w-5 mx-auto mb-1 text-destructive" />
            <p className="text-2xl font-bold text-destructive">{stats.weakReportsCount}</p>
            <p className="text-xs text-muted-foreground">تقارير ضعيفة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${stats.weakReportsRatio > 20 ? "text-destructive" : "text-muted-foreground"}`} />
            <p className={`text-2xl font-bold ${stats.weakReportsRatio > 20 ? "text-destructive" : ""}`}>{stats.weakReportsRatio}%</p>
            <p className="text-xs text-muted-foreground">نسبة الضعف</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">الأداء اليومي والجودة الحقيقية</CardTitle></CardHeader>
          <CardContent>
            {dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Line type="monotone" dataKey="success" stroke="hsl(142 71% 45%)" name="ناجح" strokeWidth={2} />
                  <Line type="monotone" dataKey="failed" stroke="hsl(0 84% 60%)" name="فشل" strokeWidth={2} />
                  <Line type="monotone" dataKey="usefulness" stroke="hsl(var(--primary))" name="جودة حقيقية" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">توزيع الاستخدام</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feature Performance Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">أداء كل ميزة</CardTitle></CardHeader>
        <CardContent>
          {featureStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right p-2">الميزة</th>
                    <th className="text-center p-2">الإجمالي</th>
                    <th className="text-center p-2">نسبة النجاح</th>
                    <th className="text-center p-2">الاستجابة</th>
                    <th className="text-center p-2">جودة الشكل</th>
                    <th className="text-center p-2">الجودة الحقيقية</th>
                    <th className="text-center p-2">مُعاد توليدها</th>
                  </tr>
                </thead>
                <tbody>
                  {featureStats.map((f) => (
                    <tr key={f.key} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{f.name}</td>
                      <td className="text-center p-2">{f.total}</td>
                      <td className="text-center p-2">
                        <Badge variant={f.successRate >= 90 ? "default" : f.successRate >= 70 ? "secondary" : "destructive"}>
                          {f.successRate}%
                        </Badge>
                      </td>
                      <td className="text-center p-2">{f.avgTime}ms</td>
                      <td className="text-center p-2">{f.avgQuality}/100</td>
                      <td className="text-center p-2">
                        {f.avgUsefulness > 0 ? (
                          <span className={`font-bold ${getUsefulnessColor(f.avgUsefulness)}`}>
                            {f.avgUsefulness}/10
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-center p-2">
                        {f.regenerated > 0 ? (
                          <Badge variant="outline" className="gap-1">
                            <RotateCcw className="h-3 w-3" />{f.regenerated}
                          </Badge>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">لا توجد بيانات</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>آخر العمليات</span>
            <Badge variant="outline">{logs.length} سجل</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {logs.slice(0, 50).map((log: any) => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getStatusBadge(log.status)}
                  <span className="font-medium flex-shrink-0">{getFeatureLabel(log.feature_name)}</span>
                  <span className="text-muted-foreground truncate">{log.input_summary}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {log.usefulness_score != null && log.usefulness_score > 0 && (
                    <span className={`font-bold text-xs ${getUsefulnessColor(log.usefulness_score)}`}>
                      ★{log.usefulness_score}
                    </span>
                  )}
                  {log.is_regenerated && (
                    <Badge variant="outline" className="text-xs gap-0.5 border-primary/50">
                      <RotateCcw className="h-3 w-3" />مُعاد
                    </Badge>
                  )}
                  {log.response_time_ms > 0 && (
                    <span className="text-xs text-muted-foreground">{log.response_time_ms}ms</span>
                  )}
                  {log.retry_count > 0 && (
                    <Badge variant="outline" className="text-xs">
                      <RefreshCw className="h-3 w-3 ml-0.5" />{log.retry_count}
                    </Badge>
                  )}
                  {log.error_message && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
            {logs.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8">لا توجد سجلات بعد. ستظهر البيانات بعد استخدام ميزات AI.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIAuditTab;
