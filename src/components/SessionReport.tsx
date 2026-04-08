import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Sparkles, Clock, MessageSquare, AlertTriangle, TrendingUp, Mic, MicOff, HelpCircle, Quote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
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
}

interface SampleExchange {
  student: string;
  teacher: string;
}

interface StructuredReport {
  summary: string;
  performance_score: number;
  quality_score?: number;
  usefulness_score?: number;
  is_regenerated?: boolean;
  data_level?: "rich" | "moderate" | "minimal" | "none";
  raw_stats?: RawStats;
  sample_exchanges?: SampleExchange[];
  detected_questions?: string[];
  generated_at: string;
  // Legacy fields
  duration_minutes?: number;
  total_messages?: number;
  teacher_messages?: number;
  student_messages?: number;
  violations_count?: number;
  teacher_speaking_seconds?: number;
  student_speaking_seconds?: number;
}

export default function SessionReport({ bookingId, existingReport }: Props) {
  const { user } = useAuth();
  const [report, setReport] = useState<StructuredReport | null>(null);
  const [rawReport, setRawReport] = useState(existingReport || "");
  const [loading, setLoading] = useState(false);
  const [sessionsRemaining, setSessionsRemaining] = useState<number | null>(null);
  const [showRawStats, setShowRawStats] = useState(false);

  useEffect(() => {
    if (existingReport) {
      try {
        const parsed = JSON.parse(existingReport);
        if (parsed.summary) { setReport(parsed); return; }
      } catch { setRawReport(existingReport); }
    }
  }, [existingReport]);

  useEffect(() => {
    if (!bookingId || !user) return;
    const fetchSessionInfo = async () => {
      const { data: booking } = await supabase.from("bookings").select("student_id").eq("id", bookingId).maybeSingle();
      const studentId = booking?.student_id || user.id;
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("sessions_remaining")
        .eq("user_id", studentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
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

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-destructive";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-destructive";
  };

  const getDataLevelBadge = (level?: string) => {
    switch (level) {
      case "rich": return <Badge className="bg-green-100 text-green-700 border-0 text-xs">بيانات غنية</Badge>;
      case "moderate": return <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs">بيانات متوسطة</Badge>;
      case "minimal": return <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">بيانات محدودة</Badge>;
      default: return <Badge className="bg-muted text-muted-foreground border-0 text-xs">غير محدد</Badge>;
    }
  };

  const stats = report?.raw_stats;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-secondary" />
          </div>
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
            {/* Data Level + Regeneration Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              {getDataLevelBadge(report.data_level)}
              {report.is_regenerated && (
                <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">♻️ مُعاد التوليد</Badge>
              )}
              {report.usefulness_score !== undefined && (
                <Badge className={`border-0 text-xs ${report.usefulness_score >= 7 ? 'bg-green-100 text-green-700' : report.usefulness_score >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  جودة: {report.usefulness_score}/10
                </Badge>
              )}
            </div>

            {/* Performance Score */}
            <div className="bg-muted/50 rounded-2xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">درجة الأداء</p>
              <p className={`text-4xl font-black ${getScoreColor(report.performance_score)}`}>
                {report.performance_score}/100
              </p>
              <Progress value={report.performance_score} className={`mt-2 h-2 ${getScoreBg(report.performance_score)}`} />
            </div>

            {/* Real Stats Grid */}
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <Clock className="h-5 w-5 text-secondary mx-auto mb-1" />
                  <p className="text-xl font-black text-foreground">{stats.duration_minutes}</p>
                  <p className="text-xs text-muted-foreground">دقيقة</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <MessageSquare className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-xl font-black text-foreground">{stats.total_messages}</p>
                  <p className="text-xs text-muted-foreground">رسالة</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <Mic className="h-5 w-5 text-green-500 mx-auto mb-1" />
                  <p className="text-lg font-black text-foreground">{stats.teacher_speaking_minutes}د</p>
                  <p className="text-xs text-muted-foreground">كلام المعلم</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <Mic className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                  <p className="text-lg font-black text-foreground">{stats.student_speaking_minutes}د</p>
                  <p className="text-xs text-muted-foreground">كلام الطالب</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <HelpCircle className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                  <p className="text-xl font-black text-foreground">{stats.questions_detected}</p>
                  <p className="text-xs text-muted-foreground">سؤال</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-1" />
                  <p className="text-xl font-black text-foreground">{stats.violations_count}</p>
                  <p className="text-xs text-muted-foreground">مخالفة</p>
                </div>
              </div>
            )}

            {/* Detected Questions */}
            {report.detected_questions && report.detected_questions.length > 0 && (
              <div className="bg-purple-50 dark:bg-purple-950/20 rounded-2xl p-4">
                <p className="text-sm font-bold text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                  <HelpCircle className="h-4 w-4" /> أسئلة الطالب
                </p>
                <ul className="space-y-1.5">
                  {report.detected_questions.map((q, i) => (
                    <li key={i} className="text-sm text-foreground bg-background/60 rounded-lg px-3 py-1.5">
                      "{q}"
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sample Exchanges */}
            {report.sample_exchanges && report.sample_exchanges.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-2xl p-4">
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1">
                  <Quote className="h-4 w-4" /> نماذج من الحوار
                </p>
                <div className="space-y-3">
                  {report.sample_exchanges.map((ex, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-sm text-blue-600 dark:text-blue-400">🎓 الطالب: "{ex.student}"</p>
                      <p className="text-sm text-green-600 dark:text-green-400">👨‍🏫 المعلم: "{ex.teacher}"</p>
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
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowRawStats(!showRawStats)}>
                {showRawStats ? "إخفاء" : "عرض"} الإحصائيات الخام
              </Button>
            )}
            {showRawStats && stats && (
              <div className="bg-muted/30 rounded-xl p-3 text-xs text-muted-foreground space-y-1 font-mono">
                <p>المدة: {stats.duration_minutes} دقيقة</p>
                <p>كلام المعلم: {stats.teacher_speaking_minutes} دقيقة</p>
                <p>كلام الطالب: {stats.student_speaking_minutes} دقيقة</p>
                <p>الصمت: {stats.silence_minutes} دقيقة</p>
                <p>الرسائل: {stats.total_messages} (معلم: {stats.teacher_messages_count}، طالب: {stats.student_messages_count})</p>
                <p>الأسئلة: {stats.questions_detected}</p>
                <p>المخالفات: {stats.violations_count}</p>
              </div>
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
              {loading ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جاري الإنشاء...</>
              ) : (
                <><Sparkles className="h-4 w-4 ml-2" /> إنشاء تقرير AI</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
