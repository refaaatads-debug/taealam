import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SessionMaterial {
  id: string;
  subject_name: string;
  scheduled_at: string;
  ai_report: string | null;
  duration_minutes: number | null;
  student_name: string;
  days_remaining: number;
}

export default function TeacherSessionMaterials() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<SessionMaterial[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchMaterials();
  }, [user]);

  const fetchMaterials = async () => {
    if (!user) return;
    setLoading(true);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, scheduled_at, student_id, duration_minutes, subjects(name)")
      .eq("teacher_id", user.id)
      .eq("status", "completed")
      .gte("scheduled_at", sevenDaysAgo.toISOString())
      .order("scheduled_at", { ascending: false });

    if (!bookings || bookings.length === 0) { setMaterials([]); setLoading(false); return; }

    const bookingIds = bookings.map(b => b.id);
    const studentIds = [...new Set(bookings.map(b => b.student_id))];

    const [{ data: sessions }, { data: profiles }] = await Promise.all([
      supabase.from("sessions").select("booking_id, ai_report, duration_minutes").in("booking_id", bookingIds),
      supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds),
    ]);

    const sessionMap = new Map((sessions ?? []).map(s => [s.booking_id, s]));
    const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
    const now = Date.now();

    setMaterials(bookings.map(b => {
      const session = sessionMap.get(b.id);
      const expiryDate = new Date(b.scheduled_at);
      expiryDate.setDate(expiryDate.getDate() + 7);
      return {
        id: b.id,
        subject_name: (b.subjects as any)?.name || "حصة",
        scheduled_at: b.scheduled_at,
        ai_report: session?.ai_report || null,
        duration_minutes: session?.duration_minutes || b.duration_minutes,
        student_name: nameMap.get(b.student_id) || "طالب",
        days_remaining: Math.max(0, Math.ceil((expiryDate.getTime() - now) / (1000 * 60 * 60 * 24))),
      };
    }));
    setLoading(false);
  };

  const grouped = materials.reduce<Record<string, SessionMaterial[]>>((acc, m) => {
    if (!acc[m.subject_name]) acc[m.subject_name] = [];
    acc[m.subject_name].push(m);
    return acc;
  }, {});

  if (loading || materials.length === 0) return null;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          المواد التعليمية
          <Badge className="mr-auto bg-primary/10 text-primary border-0 text-xs">{materials.length} حصة</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">تقارير وتحليلات الحصص المكتملة (متاحة لمدة 7 أيام)</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(grouped).map(([subjectName, items]) => (
          <div key={subjectName}>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-secondary" />
              <span className="text-sm font-bold text-foreground">{subjectName}</span>
              <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
            </div>
            <div className="space-y-2">
              {items.map(m => (
                <motion.div key={m.id} layout className="rounded-xl border bg-muted/30 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    className="w-full flex items-center justify-between p-3 text-right hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-secondary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">حصة مع {m.student_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.scheduled_at).toLocaleDateString("ar-SA")} • {m.duration_minutes} دقيقة
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500/10 text-orange-600 border-0 text-[10px]">
                        {m.days_remaining} يوم متبقي
                      </Badge>
                      {expandedId === m.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                  <AnimatePresence>
                    {expandedId === m.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t"
                      >
                        <div className="p-4">
                          {m.ai_report ? (
                            <div className="bg-accent/30 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="h-4 w-4 text-gold" />
                                <span className="text-sm font-bold text-foreground">تحليل AI للحصة</span>
                              </div>
                              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{m.ai_report}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">لم يتم إنشاء تقرير لهذه الحصة بعد</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
