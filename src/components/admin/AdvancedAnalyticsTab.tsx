import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, Users, UserMinus, Clock, Sparkles, RefreshCw, Target, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, LineChart, Line, Legend, FunnelChart, Funnel, LabelList, Cell,
} from "recharts";

const HOURS_LABELS = Array.from({ length: 24 }, (_, i) => `${i}:00`);
const DAYS_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const AdvancedAnalyticsTab = () => {
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [data, setData] = useState<any>({
    funnel: [],
    churn: { total: 0, churned: 0, rate: 0, reasons: [] },
    heatmap: [],
    revenueHistory: [],
    forecast: [],
    metrics: {},
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const last30 = new Date(now.getTime() - 30 * 86400000).toISOString();
      const last90 = new Date(now.getTime() - 90 * 86400000).toISOString();

      // Funnel data
      const [
        { count: visitors },
        { count: registered },
        { count: subscribed },
        { count: activeUsers },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", last30),
        supabase.from("user_subscriptions").select("*", { count: "exact", head: true }).gte("created_at", last30),
        supabase.from("user_subscriptions").select("*", { count: "exact", head: true }).eq("is_active", true),
      ]);

      // Churn analysis
      const { data: cancelledSubs } = await supabase
        .from("user_subscriptions")
        .select("id, is_active, created_at, updated_at, remaining_minutes")
        .gte("created_at", last90);

      const totalSubs = cancelledSubs?.length || 0;
      const churned = cancelledSubs?.filter((s) => !s.is_active).length || 0;
      const churnRate = totalSubs > 0 ? (churned / totalSubs) * 100 : 0;

      // Heatmap (bookings by day/hour)
      const { data: bookings } = await supabase
        .from("bookings")
        .select("scheduled_at, status")
        .gte("scheduled_at", last30);

      const heatmap: { day: number; hour: number; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) heatmap.push({ day: d, hour: h, count: 0 });
      }
      bookings?.forEach((b) => {
        const dt = new Date(b.scheduled_at);
        const day = dt.getDay();
        const hour = dt.getHours();
        const cell = heatmap.find((c) => c.day === day && c.hour === hour);
        if (cell) cell.count++;
      });

      // Revenue history (last 6 months)
      const { data: payments } = await supabase
        .from("payment_records")
        .select("amount, created_at, status")
        .eq("status", "succeeded")
        .gte("created_at", new Date(now.getTime() - 180 * 86400000).toISOString());

      const monthlyRevenue: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyRevenue[k] = 0;
      }
      payments?.forEach((p) => {
        const d = new Date(p.created_at);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (k in monthlyRevenue) monthlyRevenue[k] += Number(p.amount || 0);
      });
      const revenueHistory = Object.entries(monthlyRevenue).map(([month, revenue]) => ({ month, revenue }));

      // Simple linear forecast (next 3 months)
      const values = revenueHistory.map((r) => r.revenue);
      const n = values.length;
      const avgGrowth = n > 1
        ? values.slice(1).reduce((sum, v, i) => sum + (v - values[i]), 0) / (n - 1)
        : 0;
      const lastValue = values[values.length - 1] || 0;
      const forecast: { month: string; revenue: number; predicted: number }[] = [
        ...revenueHistory.map((r) => ({ ...r, predicted: 0 })),
      ];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const predicted = Math.max(0, lastValue + avgGrowth * i);
        forecast.push({ month: k, revenue: 0, predicted });
      }

      const funnel = [
        { name: "إجمالي المستخدمين", value: visitors || 0, fill: "hsl(var(--primary))" },
        { name: "تسجيل (30 يوم)", value: registered || 0, fill: "hsl(var(--secondary))" },
        { name: "مشتركين (30 يوم)", value: subscribed || 0, fill: "hsl(var(--info))" },
        { name: "اشتراكات نشطة", value: activeUsers || 0, fill: "hsl(var(--success))" },
      ];

      setData({
        funnel,
        churn: { total: totalSubs, churned, rate: churnRate, reasons: [] },
        heatmap,
        revenueHistory,
        forecast,
        metrics: {
          totalRevenue: values.reduce((a, b) => a + b, 0),
          avgGrowth,
          conversionRate: visitors ? ((subscribed || 0) / visitors) * 100 : 0,
        },
      });
    } catch (e: any) {
      console.error(e);
      toast.error("تعذر تحميل التحليلات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const generateAIInsight = async () => {
    setAiLoading(true);
    try {
      const summary = {
        funnel: data.funnel,
        churnRate: data.churn.rate.toFixed(1),
        revenueHistory: data.revenueHistory,
        forecast: data.forecast.filter((f: any) => f.predicted > 0),
        conversionRate: data.metrics.conversionRate?.toFixed(1),
      };
      const { data: res, error } = await supabase.functions.invoke("admin-analytics-insights", {
        body: { summary },
      });
      if (error || res?.error) {
        toast.error(res?.error || "تعذر توليد التحليل");
        return;
      }
      setAiInsight(res.insight || "");
    } catch (e: any) {
      toast.error(e?.message || "خطأ");
    } finally {
      setAiLoading(false);
    }
  };

  const maxHeat = useMemo(() => Math.max(1, ...data.heatmap.map((c: any) => c.count)), [data.heatmap]);
  const heatColor = (count: number) => {
    if (count === 0) return "bg-muted/30";
    const intensity = count / maxHeat;
    if (intensity < 0.25) return "bg-primary/20";
    if (intensity < 0.5) return "bg-primary/40";
    if (intensity < 0.75) return "bg-primary/70";
    return "bg-primary";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            التحليلات المتقدمة
          </h2>
          <p className="text-xs text-muted-foreground mt-1">قمع التحويل، Churn، أوقات الذروة، وتوقعات AI</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" /> تحديث
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Target className="h-3.5 w-3.5" /> معدل التحويل
            </div>
            <div className="text-2xl font-black">{data.metrics.conversionRate?.toFixed(1) || 0}%</div>
            <div className="text-[10px] text-muted-foreground">زائر → مشترك</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <UserMinus className="h-3.5 w-3.5" /> معدل Churn
            </div>
            <div className={`text-2xl font-black ${data.churn.rate > 30 ? "text-destructive" : "text-success"}`}>
              {data.churn.rate.toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground">{data.churn.churned} من {data.churn.total} اشتراك</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              {data.metrics.avgGrowth >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
              متوسط النمو الشهري
            </div>
            <div className="text-2xl font-black">{data.metrics.avgGrowth >= 0 ? "+" : ""}{Math.round(data.metrics.avgGrowth || 0)} ر.س</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" /> ذروة الحجوزات
            </div>
            <div className="text-2xl font-black">
              {(() => {
                const peak = data.heatmap.reduce((max: any, c: any) => c.count > max.count ? c : max, { count: 0, day: 0, hour: 0 });
                return peak.count > 0 ? `${peak.hour}:00` : "—";
              })()}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {(() => {
                const peak = data.heatmap.reduce((max: any, c: any) => c.count > max.count ? c : max, { count: 0, day: 0, hour: 0 });
                return peak.count > 0 ? DAYS_LABELS[peak.day] : "لا توجد بيانات";
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">قمع التحويل (Conversion Funnel)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.funnel.map((step: any, i: number) => {
              const max = data.funnel[0]?.value || 1;
              const pct = (step.value / max) * 100;
              const dropFromPrev = i > 0 && data.funnel[i - 1].value > 0
                ? ((data.funnel[i - 1].value - step.value) / data.funnel[i - 1].value) * 100
                : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="font-medium">{step.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black">{step.value.toLocaleString("ar")}</span>
                      {i > 0 && dropFromPrev > 0 && (
                        <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                          -{dropFromPrev.toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="h-8 bg-muted/40 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-700 flex items-center justify-end px-3 text-xs font-bold text-primary-foreground"
                      style={{ width: `${pct}%`, background: step.fill }}
                    >
                      {pct.toFixed(0)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">خريطة حرارية - أوقات ذروة الحجوزات</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="flex gap-1 mb-1 pr-12">
              {HOURS_LABELS.map((h, i) => (
                <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
                  {i % 3 === 0 ? h.split(":")[0] : ""}
                </div>
              ))}
            </div>
            {DAYS_LABELS.map((day, di) => (
              <div key={di} className="flex gap-1 mb-1 items-center">
                <div className="w-12 text-xs text-muted-foreground shrink-0">{day}</div>
                {HOURS_LABELS.map((_, hi) => {
                  const cell = data.heatmap.find((c: any) => c.day === di && c.hour === hi);
                  return (
                    <div
                      key={hi}
                      className={`flex-1 h-6 rounded ${heatColor(cell?.count || 0)} hover:ring-2 hover:ring-primary cursor-pointer transition-all`}
                      title={`${day} ${hi}:00 — ${cell?.count || 0} حجز`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span>أقل</span>
            <div className="flex gap-1">
              {["bg-muted/30", "bg-primary/20", "bg-primary/40", "bg-primary/70", "bg-primary"].map((c, i) => (
                <div key={i} className={`w-5 h-3 rounded ${c}`} />
              ))}
            </div>
            <span>أكثر</span>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Forecast */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-secondary" />
            توقعات الإيرادات (الـ 3 أشهر القادمة)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.forecast}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" name="فعلي" />
              <Area type="monotone" dataKey="predicted" stroke="hsl(var(--secondary))" fill="url(#predGrad)" strokeDasharray="5 5" name="توقعات AI" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            تحليل ذكي بـ AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiInsight ? (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground/90 leading-relaxed">
              {aiInsight}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">
              احصل على تحليل ذكي لبياناتك مع توصيات لتحسين الأداء وتقليل Churn.
            </p>
          )}
          <Button onClick={generateAIInsight} disabled={aiLoading} className="mt-3 gap-2">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiInsight ? "توليد تحليل جديد" : "توليد تحليل ذكي"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdvancedAnalyticsTab;
