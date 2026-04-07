import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileText, Search, Clock, MessageSquare, AlertTriangle, Sparkles, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import DateFilter from "./DateFilter";

interface ReportEntry {
  booking_id: string;
  teacher_name: string;
  student_name: string;
  subject_name: string;
  scheduled_at: string;
  duration_minutes: number;
  report: {
    summary: string;
    performance_score: number;
    total_messages: number;
    violations_count: number;
    teacher_messages: number;
    student_messages: number;
    generated_at: string;
  } | null;
  raw_report: string | null;
}

export default function SessionReportsTab() {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);

    const { data: completedBookings } = await supabase
      .from("bookings")
      .select("id, scheduled_at, student_id, teacher_id, duration_minutes, subjects(name)")
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false })
      .limit(100);

    if (!completedBookings || completedBookings.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    const bookingIds = completedBookings.map(b => b.id);
    const allUserIds = [...new Set(completedBookings.flatMap(b => [b.student_id, b.teacher_id]))];

    const [{ data: sessions }, { data: profiles }] = await Promise.all([
      supabase.from("sessions").select("id, booking_id, ai_report, duration_minutes").in("booking_id", bookingIds),
      supabase.from("profiles").select("user_id, full_name").in("user_id", allUserIds),
    ]);

    const sessionMap = new Map((sessions ?? []).map(s => [s.booking_id, s]));
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name || "مستخدم"]));

    const result: ReportEntry[] = completedBookings.map(b => {
      const session = sessionMap.get(b.id);
      let parsed = null;
      let raw = null;
      if (session?.ai_report) {
        try {
          parsed = JSON.parse(session.ai_report);
          if (!parsed.summary) { raw = session.ai_report; parsed = null; }
        } catch { raw = session.ai_report; }
      }
      return {
        booking_id: b.id,
        teacher_name: profileMap.get(b.teacher_id) || "معلم",
        student_name: profileMap.get(b.student_id) || "طالب",
        subject_name: b.subjects?.name || "مادة عامة",
        scheduled_at: b.scheduled_at,
        duration_minutes: session?.duration_minutes || b.duration_minutes || 45,
        report: parsed,
        raw_report: raw,
      };
    });

    setReports(result);
    setLoading(false);
  };

  const filtered = reports.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.teacher_name.toLowerCase().includes(q) && !r.student_name.toLowerCase().includes(q) && !r.subject_name.toLowerCase().includes(q)) return false;
    }
    if (dateFrom && new Date(r.scheduled_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(r.scheduled_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const avgScore = filtered.filter(r => r.report).reduce((sum, r) => sum + (r.report?.performance_score || 0), 0) / (filtered.filter(r => r.report).length || 1);
  const totalViolations = filtered.reduce((sum, r) => sum + (r.report?.violations_count || 0), 0);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-destructive";
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 text-center">
            <FileText className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black text-foreground">{filtered.length}</p>
            <p className="text-xs text-muted-foreground">تقرير</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-secondary mx-auto mb-2" />
            <p className={`text-2xl font-black ${getScoreColor(avgScore)}`}>{Math.round(avgScore)}</p>
            <p className="text-xs text-muted-foreground">متوسط الأداء</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
            <p className="text-2xl font-black text-foreground">{totalViolations}</p>
            <p className="text-xs text-muted-foreground">مخالفة</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black text-foreground">
              {filtered.reduce((s, r) => s + r.duration_minutes, 0)}
            </p>
            <p className="text-xs text-muted-foreground">دقيقة تدريس</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو المادة..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-10 rounded-xl"
          />
        </div>
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
      </div>

      {/* Reports List */}
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-bold">
            <Sparkles className="h-5 w-5 text-gold" />
            تقارير الحصص المكتملة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد تقارير</p>
          ) : (
            filtered.map(r => (
              <motion.div key={r.booking_id} className="bg-muted/50 rounded-2xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-right"
                  onClick={() => setExpandedId(expandedId === r.booking_id ? null : r.booking_id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">
                        {r.teacher_name} ← {r.student_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.subject_name} • {new Date(r.scheduled_at).toLocaleDateString("ar-SA")} • {r.duration_minutes} دقيقة
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.report ? (
                      <>
                        <Badge variant="outline" className={`${getScoreColor(r.report.performance_score)} border-0 font-black`}>
                          {r.report.performance_score}/100
                        </Badge>
                        {r.report.violations_count > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            {r.report.violations_count} مخالفة
                          </Badge>
                        )}
                      </>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground border-0">—</Badge>
                    )}
                    {expandedId === r.booking_id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedId === r.booking_id && (r.report || r.raw_report) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4"
                    >
                      {r.report ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Progress value={r.report.performance_score} className="h-2 flex-1" />
                            <span className={`text-sm font-black ${getScoreColor(r.report.performance_score)}`}>
                              {r.report.performance_score}%
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-xs">
                            <div className="bg-card rounded-lg p-2">
                              <p className="font-bold text-foreground">{r.report.total_messages}</p>
                              <p className="text-muted-foreground">رسالة</p>
                            </div>
                            <div className="bg-card rounded-lg p-2">
                              <p className="font-bold text-foreground">{r.report.teacher_messages}</p>
                              <p className="text-muted-foreground">معلم</p>
                            </div>
                            <div className="bg-card rounded-lg p-2">
                              <p className="font-bold text-foreground">{r.report.student_messages}</p>
                              <p className="text-muted-foreground">طالب</p>
                            </div>
                            <div className="bg-card rounded-lg p-2">
                              <p className="font-bold text-destructive">{r.report.violations_count}</p>
                              <p className="text-muted-foreground">مخالفة</p>
                            </div>
                          </div>
                          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-accent/30 rounded-xl p-3 max-h-[300px] overflow-y-auto">
                            {r.report.summary}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-accent/30 rounded-xl p-3">
                          {r.raw_report}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
