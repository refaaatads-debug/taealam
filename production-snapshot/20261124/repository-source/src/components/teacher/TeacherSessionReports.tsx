import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles, Clock, MessageSquare, AlertTriangle, ChevronDown, ChevronUp, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface SessionReportData {
  booking_id: string;
  session_id: string;
  subject_name: string;
  student_name: string;
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

export default function TeacherSessionReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<SessionReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    fetchReports();
  }, [user]);

  const fetchReports = async () => {
    if (!user) return;
    setLoading(true);

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, scheduled_at, student_id, duration_minutes, subjects(name)")
      .eq("teacher_id", user.id)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false })
      .limit(20);

    if (!bookings || bookings.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    const bookingIds = bookings.map(b => b.id);
    const studentIds = [...new Set(bookings.map(b => b.student_id))];

    const [{ data: sessions }, { data: profiles }] = await Promise.all([
      supabase.from("sessions").select("id, booking_id, ai_report, duration_minutes").in("booking_id", bookingIds),
      supabase.from("public_profiles").select("user_id, full_name").in("user_id", studentIds),
    ]);

    const sessionMap = new Map((sessions ?? []).map(s => [s.booking_id, s]));
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));

    const result: SessionReportData[] = bookings.map(b => {
      const session = sessionMap.get(b.id);
      let parsed = null;
      let raw = null;
      if (session?.ai_report) {
        try {
          parsed = JSON.parse(session.ai_report);
          if (!parsed.summary) {
            raw = session.ai_report;
            parsed = null;
          }
        } catch {
          raw = session.ai_report;
        }
      }
      return {
        booking_id: b.id,
        session_id: session?.id || "",
        subject_name: b.subjects?.name || "مادة عامة",
        student_name: profileMap.get(b.student_id) || "طالب",
        scheduled_at: b.scheduled_at,
        duration_minutes: session?.duration_minutes || b.duration_minutes || 45,
        report: parsed,
        raw_report: raw,
      };
    });

    setReports(result);
    // Auto-expand first student
    const firstStudent = result[0]?.student_name;
    if (firstStudent) setExpandedStudents(new Set([firstStudent]));
    setLoading(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-destructive";
  };

  const grouped = reports.reduce<Record<string, SessionReportData[]>>((acc, r) => {
    if (!acc[r.student_name]) acc[r.student_name] = [];
    acc[r.student_name].push(r);
    return acc;
  }, {});

  const toggleStudent = (name: string) => {
    setExpandedStudents(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-secondary" />
          </div>
          تقارير الحصص
          <Sparkles className="h-4 w-4 text-gold" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">جاري التحميل...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد تقارير بعد</p>
        ) : (
          Object.entries(grouped).map(([studentName, items]) => (
            <div key={studentName} className="rounded-2xl border bg-muted/20 overflow-hidden">
              <button
                onClick={() => toggleStudent(studentName)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-secondary" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{studentName}</p>
                    <p className="text-[11px] text-muted-foreground">{items.length} تقرير</p>
                  </div>
                </div>
                {expandedStudents.has(studentName)
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              <AnimatePresence>
                {expandedStudents.has(studentName) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t"
                  >
                    <div className="p-3 space-y-2">
                      {items.map((r) => (
                        <motion.div
                          key={r.booking_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-card rounded-xl overflow-hidden border"
                        >
                          <button
                            className="w-full flex items-center justify-between p-3 text-right hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedId(expandedId === r.booking_id ? null : r.booking_id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                                <FileText className="h-4 w-4 text-secondary" />
                              </div>
                              <div>
                                <p className="font-bold text-sm text-foreground">{r.subject_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(r.scheduled_at).toLocaleDateString("ar-SA")} • {r.duration_minutes} دقيقة
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {r.report ? (
                                <Badge variant="outline" className={`${getScoreColor(r.report.performance_score)} border-0 font-black`}>
                                  {r.report.performance_score}/100
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground border-0">بدون تقرير</Badge>
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
                                className="px-4 pb-4 border-t"
                              >
                                {r.report ? (
                                  <div className="space-y-3 pt-3">
                                    <div className="flex items-center gap-2 justify-center">
                                      <Progress value={r.report.performance_score} className="h-2 flex-1" />
                                      <span className={`text-sm font-black ${getScoreColor(r.report.performance_score)}`}>
                                        {r.report.performance_score}%
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                      <div className="bg-muted/50 rounded-xl p-2">
                                        <MessageSquare className="h-4 w-4 text-primary mx-auto mb-1" />
                                        <p className="text-sm font-bold">{r.report.total_messages}</p>
                                        <p className="text-[10px] text-muted-foreground">رسالة</p>
                                      </div>
                                      <div className="bg-muted/50 rounded-xl p-2">
                                        <Clock className="h-4 w-4 text-secondary mx-auto mb-1" />
                                        <p className="text-sm font-bold">{r.duration_minutes}</p>
                                        <p className="text-[10px] text-muted-foreground">دقيقة</p>
                                      </div>
                                      <div className="bg-muted/50 rounded-xl p-2">
                                        <AlertTriangle className="h-4 w-4 text-destructive mx-auto mb-1" />
                                        <p className="text-sm font-bold">{r.report.violations_count}</p>
                                        <p className="text-[10px] text-muted-foreground">مخالفة</p>
                                      </div>
                                    </div>
                                    <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-accent/30 rounded-xl p-3">
                                      {r.report.summary}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-accent/30 rounded-xl p-3 mt-3">
                                    {r.raw_report}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
