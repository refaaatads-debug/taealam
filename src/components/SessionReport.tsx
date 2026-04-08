import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Sparkles, Clock, MessageSquare, AlertTriangle, Mic, HelpCircle, Quote, BookOpen, Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface Props {
  bookingId: string;
  existingReport?: string | null;
}

interface RawStats {
  duration_minutes: number;
  teacher_speaking_minutes: number;
  student_speaking_minutes: number;
  silence_minutes: number;
  total_messages: number;
  teacher_messages_count: number;
  student_messages_count: number;
  questions_detected: number;
  violations_count: number;
  explanations_count?: number;
  answers_count?: number;
  confusion_count?: number;
  silence_events?: number;
  total_silence_seconds?: number;
}

interface TimelineEvent {
  type: "explanation" | "question" | "answer" | "confusion" | "silence" | "violation" | "greeting";
  time: string;
  content: string;
  sender?: "teacher" | "student";
  duration_seconds?: number;
}

interface GapWarning {
  type: "no_interaction" | "unanswered_question" | "long_silence" | "confusion_ignored";
  description: string;
  time: string;
}

interface SampleExchange { student: string; teacher: string; }

interface StructuredReport {
  summary: string;
  performance_score: number;
  quality_score?: number;
  usefulness_score?: number;
  is_regenerated?: boolean;
  data_level?: "rich" | "moderate" | "minimal" | "none";
  raw_stats?: RawStats;
  timeline?: TimelineEvent[];
  timeline_stats?: { explanations_count: number; questions_count: number; answers_count: number; confusion_count: number; silence_events: number; total_silence_seconds: number };
  gap_warnings?: GapWarning[];
  extracted_topics?: string[];
  sample_exchanges?: SampleExchange[];
  detected_questions?: string[];
  generated_at: string;
}

const eventConfig: Record<string, { icon: string; label: string; color: string; dot: string }> = {
  explanation: { icon: "📖", label: "شرح", color: "text-green-700 dark:text-green-400", dot: "bg-green-500" },
  question: { icon: "❓", label: "سؤال", color: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  answer: { icon: "💡", label: "إجابة", color: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  confusion: { icon: "😕", label: "عدم فهم", color: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  silence: { icon: "🔇", label: "صمت", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  violation: { icon: "⚠️", label: "مخالفة", color: "text-destructive", dot: "bg-destructive" },
  greeting: { icon: "👋", label: "تحية", color: "text-muted-foreground", dot: "bg-muted-foreground/50" },
};

export default function SessionReport({ bookingId, existingReport }: Props) {
  const { user } = useAuth();
  const [report, setReport] = useState<StructuredReport | null>(null);
  const [rawReport, setRawReport] = useState(existingReport || "");
  const [loading, setLoading] = useState(false);
  const [sessionsRemaining, setSessionsRemaining] = useState<number | null>(null);
  const [showRawStats, setShowRawStats] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showGaps, setShowGaps] = useState(false);

  useEffect(() => {
    if (existingReport) {
      try { const parsed = JSON.parse(existingReport); if (parsed.summary) { setReport(parsed); return; } } catch { setRawReport(existingReport); }
    }
  }, [existingReport]);

  useEffect(() => {
    if (!bookingId || !user) return;
    const fetchSessionInfo = async () => {
      const { data: booking } = await supabase.from("bookings").select("student_id").eq("id", bookingId).maybeSingle();
      const studentId = booking?.student_id || user.id;
      const { data: sub } = await supabase.from("user_subscriptions").select("sessions_remaining").eq("user_id", studentId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (sub) setSessionsRemaining(sub.sessions_remaining);
    };
    fetchSessionInfo();
  }, [bookingId, user]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("session-report", { body: { booking_id: bookingId } });
      if (error) throw error;
      if (data.report) setReport(data.report);
    } catch { setRawReport("تعذر إنشاء التقرير. حاول مرة أخرى."); }
    finally { setLoading(false); }
  };

  const getScoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-destructive";
  const getScoreBg = (s: number) => s >= 80 ? "bg-green-500" : s >= 60 ? "bg-yellow-500" : "bg-destructive";
  const getDataLevelBadge = (level?: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      rich: { cls: "bg-green-100 text-green-700", label: "بيانات غنية" },
      moderate: { cls: "bg-yellow-100 text-yellow-700", label: "بيانات متوسطة" },
      minimal: { cls: "bg-orange-100 text-orange-700", label: "بيانات محدودة" },
    };
    const m = map[level || ""] || { cls: "bg-muted text-muted-foreground", label: "غير محدد" };
    return <Badge className={`${m.cls} border-0 text-xs`}>{m.label}</Badge>;
  };

  const stats = report?.raw_stats;
  const timeline = report?.timeline || [];
  const gaps = report?.gap_warnings || [];
  const topics = report?.extracted_topics || [];
  const tStats = report?.timeline_stats;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center"><FileText className="h-4 w-4 text-secondary" /></div>
          تقرير الحصة
          <Sparkles className="h-4 w-4 text-gold" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessionsRemaining !== null && sessionsRemaining <= 1 && (
          <Badge className="mb-3 bg-destructive/10 text-destructive border-0 text-xs w-full justify-center py-1.5">
            ⚠️ {sessionsRemaining === 0 ? "نفد رصيد الحصص - جدد باقتك" : "متبقي حصة واحدة فقط!"}
          </Badge>
        )}

        {report ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {getDataLevelBadge(report.data_level)}
              {report.is_regenerated && <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">♻️ مُعاد التوليد</Badge>}
              {report.usefulness_score !== undefined && (
                <Badge className={`border-0 text-xs ${report.usefulness_score >= 7 ? 'bg-green-100 text-green-700' : report.usefulness_score >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  جودة: {report.usefulness_score}/10
                </Badge>
              )}
            </div>

            {/* Performance Score */}
            <div className="bg-muted/50 rounded-2xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">درجة الأداء</p>
              <p className={`text-4xl font-black ${getScoreColor(report.performance_score)}`}>{report.performance_score}/100</p>
              <Progress value={report.performance_score} className={`mt-2 h-2 ${getScoreBg(report.performance_score)}`} />
            </div>

            {/* Timeline Stats Chips */}
            {tStats && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs gap-1">📖 {tStats.explanations_count} شرح</Badge>
                <Badge variant="outline" className="text-xs gap-1">❓ {tStats.questions_count} سؤال</Badge>
                <Badge variant="outline" className="text-xs gap-1">💡 {tStats.answers_count} إجابة</Badge>
                {tStats.confusion_count > 0 && <Badge variant="outline" className="text-xs gap-1 border-orange-300 text-orange-600">😕 {tStats.confusion_count} عدم فهم</Badge>}
                {tStats.silence_events > 0 && <Badge variant="outline" className="text-xs gap-1">🔇 {tStats.silence_events} صمت</Badge>}
              </div>
            )}

            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                  <Clock className="h-4 w-4 text-secondary mx-auto mb-0.5" />
                  <p className="text-lg font-black text-foreground">{stats.duration_minutes}</p>
                  <p className="text-[10px] text-muted-foreground">دقيقة</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                  <Mic className="h-4 w-4 text-green-500 mx-auto mb-0.5" />
                  <p className="text-lg font-black text-foreground">{stats.teacher_speaking_minutes}د</p>
                  <p className="text-[10px] text-muted-foreground">كلام المعلم</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                  <Mic className="h-4 w-4 text-blue-500 mx-auto mb-0.5" />
                  <p className="text-lg font-black text-foreground">{stats.student_speaking_minutes}د</p>
                  <p className="text-[10px] text-muted-foreground">كلام الطالب</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                  <MessageSquare className="h-4 w-4 text-primary mx-auto mb-0.5" />
                  <p className="text-lg font-black text-foreground">{stats.total_messages}</p>
                  <p className="text-[10px] text-muted-foreground">رسالة</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                  <HelpCircle className="h-4 w-4 text-purple-500 mx-auto mb-0.5" />
                  <p className="text-lg font-black text-foreground">{stats.questions_detected}</p>
                  <p className="text-[10px] text-muted-foreground">سؤال</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                  <Volume2 className="h-4 w-4 text-muted-foreground mx-auto mb-0.5" />
                  <p className="text-lg font-black text-foreground">{stats.silence_minutes}د</p>
                  <p className="text-[10px] text-muted-foreground">صمت</p>
                </div>
              </div>
            )}

            {/* Extracted Topics */}
            {topics.length > 0 && (
              <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl p-3">
                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2 flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> المواضيع المشروحة
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-indigo-200 text-indigo-600 dark:border-indigo-700 dark:text-indigo-300">{t}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Visual Timeline */}
            {timeline.length > 0 && (
              <div>
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground flex items-center gap-1" onClick={() => setShowTimeline(!showTimeline)}>
                  {showTimeline ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showTimeline ? "إخفاء" : "عرض"} مسار الجلسة ({timeline.length} حدث)
                </Button>
                <AnimatePresence>
                  {showTimeline && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="relative pr-4 mt-2 space-y-0">
                        {/* Vertical line */}
                        <div className="absolute right-[7px] top-2 bottom-2 w-0.5 bg-border" />
                        {timeline.map((ev, i) => {
                          const cfg = eventConfig[ev.type] || eventConfig.greeting;
                          return (
                            <div key={i} className="relative flex items-start gap-3 py-1.5">
                              {/* Dot */}
                              <div className={`w-3.5 h-3.5 rounded-full ${cfg.dot} ring-2 ring-background flex-shrink-0 mt-1 z-10`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[10px] text-muted-foreground font-mono">[{ev.time}]</span>
                                  <span className="text-[10px]">{cfg.icon}</span>
                                  <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                                  {ev.sender && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {ev.sender === "teacher" ? "👨‍🏫" : "🎓"}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-foreground/80 truncate">{ev.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Gap Warnings */}
            {gaps.length > 0 && (
              <div>
                <Button variant="ghost" size="sm" className="w-full text-xs text-orange-600 flex items-center gap-1" onClick={() => setShowGaps(!showGaps)}>
                  <AlertTriangle className="h-3 w-3" />
                  {showGaps ? "إخفاء" : "عرض"} الفجوات التعليمية ({gaps.length})
                </Button>
                <AnimatePresence>
                  {showGaps && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl p-3 mt-1 space-y-2">
                        {gaps.map((g, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                            <div>
                              {g.time && <span className="text-[10px] font-mono text-muted-foreground">[{g.time}] </span>}
                              <span className="text-xs text-orange-700 dark:text-orange-300">{g.description}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Sample Exchanges */}
            {report.sample_exchanges && report.sample_exchanges.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-2xl p-3">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1"><Quote className="h-3.5 w-3.5" /> نماذج من الحوار</p>
                <div className="space-y-2">
                  {report.sample_exchanges.map((ex, i) => (
                    <div key={i} className="space-y-0.5">
                      <p className="text-xs text-blue-600 dark:text-blue-400">🎓 "{ex.student}"</p>
                      <p className="text-xs text-green-600 dark:text-green-400">👨‍🏫 "{ex.teacher}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            <div className="prose prose-sm text-foreground whitespace-pre-wrap text-sm leading-relaxed bg-accent/30 rounded-2xl p-4">
              {report.summary}
            </div>

            {/* Raw Stats Toggle */}
            {stats && (
              <>
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowRawStats(!showRawStats)}>
                  {showRawStats ? "إخفاء" : "عرض"} الإحصائيات الخام
                </Button>
                {showRawStats && (
                  <div className="bg-muted/30 rounded-xl p-3 text-xs text-muted-foreground space-y-1 font-mono">
                    <p>المدة: {stats.duration_minutes} دقيقة</p>
                    <p>كلام المعلم: {stats.teacher_speaking_minutes} دقيقة</p>
                    <p>كلام الطالب: {stats.student_speaking_minutes} دقيقة</p>
                    <p>الصمت: {stats.silence_minutes} دقيقة</p>
                    <p>الرسائل: {stats.total_messages} (معلم: {stats.teacher_messages_count}، طالب: {stats.student_messages_count})</p>
                    <p>الأسئلة: {stats.questions_detected} | المخالفات: {stats.violations_count}</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        ) : rawReport ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-sm text-foreground whitespace-pre-wrap text-sm leading-relaxed bg-accent/30 rounded-2xl p-4">
            {rawReport}
          </motion.div>
        ) : (
          <div className="text-center py-6">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">أنشئ تقرير ذكي عن هذه الحصة</p>
            <Button onClick={generateReport} disabled={loading} className="gradient-cta text-secondary-foreground rounded-xl shadow-button">
              {loading ? <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جاري الإنشاء...</> : <><Sparkles className="h-4 w-4 ml-2" /> إنشاء تقرير AI</>}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
