import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Sparkles, Clock, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

interface Props {
  bookingId: string;
  existingReport?: string | null;
}

export default function SessionReport({ bookingId, existingReport }: Props) {
  const { user } = useAuth();
  const [report, setReport] = useState(existingReport || "");
  const [loading, setLoading] = useState(false);
  const [sessionDuration, setSessionDuration] = useState<number | null>(null);
  const [sessionsRemaining, setSessionsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!bookingId || !user) return;
    const fetchSessionInfo = async () => {
      const [{ data: session }, { data: booking }] = await Promise.all([
        supabase.from("sessions").select("duration_minutes, started_at, ended_at").eq("booking_id", bookingId).maybeSingle(),
        supabase.from("bookings").select("student_id").eq("id", bookingId).maybeSingle(),
      ]);
      if (session?.duration_minutes) setSessionDuration(session.duration_minutes);

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
      setReport(data.report || "");
    } catch {
      setReport("تعذر إنشاء التقرير. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
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
        {/* Session stats */}
        {(sessionDuration !== null || sessionsRemaining !== null) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {sessionDuration !== null && (
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Clock className="h-5 w-5 text-secondary mx-auto mb-1" />
                <p className="text-xl font-black text-foreground">{sessionDuration}</p>
                <p className="text-xs text-muted-foreground">دقيقة (المدة الفعلية)</p>
              </div>
            )}
            {sessionsRemaining !== null && (
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Package className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-black text-foreground">{sessionsRemaining}</p>
                <p className="text-xs text-muted-foreground">حصة متبقية</p>
              </div>
            )}
          </div>
        )}

        {sessionsRemaining !== null && sessionsRemaining <= 1 && (
          <Badge className="mb-3 bg-destructive/10 text-destructive border-0 text-xs w-full justify-center py-1.5">
            ⚠️ {sessionsRemaining === 0 ? "نفد رصيد الحصص - جدد باقتك" : "متبقي حصة واحدة فقط!"}
          </Badge>
        )}

        {report ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-sm text-foreground whitespace-pre-wrap text-sm leading-relaxed bg-accent/30 rounded-2xl p-4">
            {report}
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
