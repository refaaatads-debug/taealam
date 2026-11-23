import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Sparkles, TrendingUp, AlertTriangle, Lightbulb, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const StudentAIInsightsTab = ({ data, studentId }: { data: StudentBundle; studentId: string }) => {
  const [analysis, setAnalysis] = useState<{
    summary: string;
    churn_risk: string;
    suggestions: string[];
    strengths: string[];
    weaknesses: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("student-ai-summary", {
        body: {
          student_id: studentId,
          full: true,
          stats: {
            total_bookings: data.bookings.length,
            completed: data.bookings.filter((b: any) => b.status === "completed").length,
            cancelled: data.bookings.filter((b: any) => b.status === "cancelled").length,
            active_sub: data.subscriptions.find((s: any) => s.is_active),
            open_tickets: data.tickets.filter((t: any) => t.status !== "closed").length,
            unpaid_payments: data.payments.filter((p: any) => p.status === "pending").length,
            warnings: data.warnings.length,
            points: data.points?.total_points || 0,
            reviews_avg: data.reviews.length > 0 ? data.reviews.reduce((s: number, r: any) => s + r.rating, 0) / data.reviews.length : null,
            last_activity: data.lastLogin,
          },
        },
      });
      if (error) throw error;
      setAnalysis(res);
    } catch (e: any) {
      toast.error("تعذر إجراء التحليل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <Brain className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-lg">تحليل ذكي شامل للطالب</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  يحلل AI سلوك الطالب، مخاطر الإلغاء، فرص الترقية، ومستوى الأداء بناءً على البيانات المتاحة.
                </p>
              </div>
            </div>
            <Button onClick={runAnalysis} disabled={loading} className="gap-1.5">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "جاري التحليل..." : analysis ? "إعادة التحليل" : "بدء التحليل"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {analysis ? (
        <>
          <Card>
            <CardContent className="p-5">
              <h4 className="font-bold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> الملخص الذكي</h4>
              <p className="text-sm leading-relaxed whitespace-pre-line">{analysis.summary}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <h4 className="font-bold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> احتمالية الإلغاء</h4>
                <Badge className={
                  analysis.churn_risk === "high" ? "bg-destructive/15 text-destructive border-destructive/30" :
                  analysis.churn_risk === "medium" ? "bg-amber-500/15 text-amber-600 border-amber-500/30" :
                  "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                }>
                  {analysis.churn_risk === "high" ? "مرتفعة" : analysis.churn_risk === "medium" ? "متوسطة" : "منخفضة"}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h4 className="font-bold mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /> اقتراحات ذكية</h4>
                <ul className="space-y-2 text-sm">
                  {analysis.suggestions?.map((s, i) => (
                    <li key={i} className="flex items-start gap-2"><TrendingUp className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />{s}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <h4 className="font-bold mb-3 text-emerald-600">نقاط القوة</h4>
                <ul className="space-y-1 text-sm">
                  {analysis.strengths?.map((s, i) => <li key={i}>✓ {s}</li>)}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h4 className="font-bold mb-3 text-amber-600">نقاط للتحسين</h4>
                <ul className="space-y-1 text-sm">
                  {analysis.weaknesses?.map((s, i) => <li key={i}>! {s}</li>)}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            اضغط "بدء التحليل" لتشغيل المحرك الذكي
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StudentAIInsightsTab;
