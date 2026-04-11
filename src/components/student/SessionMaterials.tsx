import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, ChevronDown, ChevronUp, Sparkles, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SessionMaterial {
  id: string;
  session_id: string;
  title: string;
  description: string | null;
  recording_url: string | null;
  whiteboard_data: any;
  duration_minutes: number;
  created_at: string;
  expires_at: string;
  days_remaining: number;
  ai_report: string | null;
  subject_name: string;
}

export default function SessionMaterials() {
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

    const { data: mats } = await supabase
      .from("session_materials")
      .select("*")
      .eq("student_id", user.id)
      .eq("is_deleted", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (!mats || mats.length === 0) { setMaterials([]); setLoading(false); return; }

    // Get AI reports from sessions
    const sessionIds = mats.map(m => m.session_id);
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, ai_report, booking_id")
      .in("id", sessionIds);
    const sessionMap = new Map((sessions ?? []).map(s => [s.id, s]));

    // Get subject names from bookings
    const bookingIds = (sessions ?? []).map(s => s.booking_id).filter(Boolean);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, subjects(name)")
      .in("id", bookingIds);
    const bookingMap = new Map((bookings ?? []).map(b => [b.id, (b.subjects as any)?.name || "حصة"]));

    const now = Date.now();
    setMaterials(mats.map(m => {
      const session = sessionMap.get(m.session_id);
      const subjectName = session ? (bookingMap.get(session.booking_id) || "حصة") : "حصة";
      return {
        ...m,
        ai_report: session?.ai_report || null,
        subject_name: subjectName,
        days_remaining: Math.max(0, Math.ceil((new Date(m.expires_at).getTime() - now) / (1000 * 60 * 60 * 24))),
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
                        <p className="text-sm font-bold text-foreground">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString("ar-SA")} • {m.duration_minutes} دقيقة
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
                        <div className="p-4 space-y-3">
                          {m.recording_url && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Play className="h-4 w-4 text-primary" />
                                <span className="text-sm font-bold text-foreground">تسجيل الحصة</span>
                              </div>
                              <video src={m.recording_url} controls className="w-full rounded-xl max-h-64" preload="metadata" />
                            </div>
                          )}
                          {m.ai_report ? (
                            <div className="bg-accent/30 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="h-4 w-4 text-yellow-500" />
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
