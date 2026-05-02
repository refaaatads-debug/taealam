import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, TrendingUp, TrendingDown, Award } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const StudentPerformanceTab = ({ data }: { data: StudentBundle }) => {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!data.profile?.user_id) return;
    supabase
      .from("assignment_submissions")
      .select("*, assignments(title, total_points)")
      .eq("student_id", data.profile.user_id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data: rows }) => { setSubmissions(rows || []); setLoading(false); });
  }, [data.profile?.user_id]);

  const completed = data.bookings.filter((b: any) => b.status === "completed");
  const total = data.bookings.length;
  const completionRate = total > 0 ? (completed.length / total) * 100 : 0;
  const avgScore = submissions.filter((s: any) => s.final_score != null).reduce((sum: number, s: any) => sum + Number(s.final_score), 0) / Math.max(1, submissions.filter((s: any) => s.final_score != null).length);

  // Monthly bookings chart
  const monthly: Record<string, number> = {};
  data.bookings.forEach((b: any) => {
    const m = new Date(b.scheduled_at).toLocaleDateString("ar-SA", { month: "short" });
    monthly[m] = (monthly[m] || 0) + 1;
  });
  const chartData = Object.entries(monthly).slice(-6).map(([month, count]) => ({ month, count }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3 w-3" />نسبة الإنجاز</div><div className="text-2xl font-bold text-emerald-600">{completionRate.toFixed(0)}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Award className="h-3 w-3" />متوسط الدرجات</div><div className="text-2xl font-bold">{isNaN(avgScore) ? "—" : avgScore.toFixed(1)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ClipboardList className="h-3 w-3" />الواجبات المرسلة</div><div className="text-2xl font-bold">{submissions.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingDown className="h-3 w-3" />الإلغاءات</div><div className="text-2xl font-bold text-amber-600">{data.bookings.filter((b: any) => b.status === "cancelled").length}</div></CardContent></Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold mb-3 text-sm">نشاط الحصص (آخر 6 أشهر)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="font-bold mb-3 text-sm">آخر الواجبات</h3>
          {loading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">جاري التحميل...</div>
          ) : submissions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">لا توجد واجبات مسجلة</div>
          ) : (
            <ul className="space-y-2">
              {submissions.slice(0, 8).map((s: any) => (
                <li key={s.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.assignments?.title || "واجب"}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(s.submitted_at).toLocaleDateString("ar-SA")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.final_score != null && <Badge variant="outline">{s.final_score}/{s.assignments?.total_points || 100}</Badge>}
                    <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentPerformanceTab;
