import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Sparkles, Clock, Package, MessageSquare, AlertTriangle, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface Props {
  bookingId: string;
  existingReport?: string | null;
}

interface StructuredReport {
  summary: string;
  performance_score: number;
  duration_minutes: number;
  total_messages: number;
  teacher_messages: number;
  student_messages: number;
  violations_count: number;
  teacher_speaking_seconds: number;
  student_speaking_seconds: number;
  generated_at: string;
}

export default function SessionReport({ bookingId, existingReport }: Props) {
  const { user } = useAuth();
  const [report, setReport] = useState<StructuredReport | null>(null);
  const [rawReport, setRawReport] = useState(existingReport || "");
  const [loading, setLoading] = useState(false);
  const [sessionsRemaining, setSessionsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (existingReport) {
      try {
        const parsed = JSON.parse(existingReport);
        if (parsed.summary) {
          setReport(parsed);
          return;
        }
      } catch {
        setRawReport(existingReport);
      }
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
      const { data, error } = await supabase.functions.invoke("session-report", {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      if (data.report) {
        setReport(data.report);
      }
    } catch {
      setRawReport("تعذر إنشاء التقرير. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
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
            {/* Performance Score */}
            <div className="bg-muted/50 rounded-2xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">درجة الأداء</p>
              <p className={`text-4xl font-black ${getScoreColor(report.performance_score)}`}>
                {report.performance_score}/100
              </p>
              <Progress value={report.performance_score} className={`mt-2 h-2 ${getScoreBg(report.performance_score)}`} />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Clock className="h-5 w-5 text-secondary mx-auto mb-1" />
                <p className="text-xl font-black text-foreground">{report.duration_minutes}</p>
                <p className="text-xs text-muted-foreground">دقيقة</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <MessageSquare className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-black text-foreground">{report.total_messages}</p>
                <p className="text-xs text-muted-foreground">رسالة</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-1" />
                <p className="text-xl font-black text-foreground">{report.violations_count}</p>
                <p className="text-xs text-muted-foreground">مخالفة</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <TrendingUp className="h-5 w-5 text-green-500 mx-auto mb-1" />
                <p className="text-xl font-black text-foreground">
                  {report.teacher_messages}/{report.student_messages}
                </p>
                <p className="text-xs text-muted-foreground">معلم/طالب</p>
              </div>
            </div>

            {/* AI Summary */}
            <div className="prose prose-sm text-foreground whitespace-pre-wrap text-sm leading-relaxed bg-accent/30 rounded-2xl p-4">
              {report.summary}
            </div>
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
