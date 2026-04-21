import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, ChevronDown, ChevronUp, Sparkles, Play, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionVideoPlayer from "@/components/student/SessionVideoPlayer";

interface SessionMaterial {
  id: string;
  session_id: string;
  title: string;
  description: string | null;
  recording_url: string | null;
  duration_minutes: number;
  created_at: string;
  expires_at: string;
  days_remaining: number;
  ai_report: string | null;
  subject_name: string;
  student_name: string;
}

export default function TeacherSessionMaterials() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<SessionMaterial[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
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
      .eq("teacher_id", user.id)
      .eq("is_deleted", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (!mats || mats.length === 0) { setMaterials([]); setLoading(false); return; }

    const sessionIds = mats.map(m => m.session_id);
    const studentIds = [...new Set(mats.map(m => m.student_id))];

    const [{ data: sessions }, { data: profiles }] = await Promise.all([
      supabase.from("sessions").select("id, ai_report, booking_id").in("id", sessionIds),
      supabase.from("public_profiles").select("user_id, full_name").in("user_id", studentIds),
    ]);

    const sessionMap = new Map((sessions ?? []).map(s => [s.id, s]));
    const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));

    const bookingIds = (sessions ?? []).map(s => s.booking_id).filter(Boolean);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, subjects(name)")
      .in("id", bookingIds);
    const bookingMap = new Map((bookings ?? []).map(b => [b.id, (b.subjects as any)?.name || "حصة"]));

    const now = Date.now();
    const result = await Promise.all(mats.map(async (m) => {
      const session = sessionMap.get(m.session_id);
      const subjectName = session ? (bookingMap.get(session.booking_id) || "حصة") : "حصة";

      let signedUrl: string | null = m.recording_url;
      if (m.recording_url) {
        try {
          const marker = "/session-recordings/";
          const idx = m.recording_url.indexOf(marker);
          if (idx !== -1) {
            const path = decodeURIComponent(m.recording_url.substring(idx + marker.length).split("?")[0]);
            const { data: signed } = await supabase.storage
              .from("session-recordings")
              .createSignedUrl(path, 60 * 60);
            if (signed?.signedUrl) signedUrl = signed.signedUrl;
          }
        } catch (e) {
          console.error("Failed to sign recording URL", e);
        }
      }

      return {
        ...m,
        recording_url: signedUrl,
        ai_report: session?.ai_report || null,
        subject_name: subjectName,
        student_name: nameMap.get(m.student_id) || "طالب",
        days_remaining: Math.max(0, Math.ceil((new Date(m.expires_at).getTime() - now) / (1000 * 60 * 60 * 24))),
      };
    }));
    setMaterials(result);
    // Auto-expand first student
    const firstStudent = result[0]?.student_name;
    if (firstStudent) setExpandedStudents(new Set([firstStudent]));
    setLoading(false);
  };

  const grouped = materials.reduce<Record<string, SessionMaterial[]>>((acc, m) => {
    if (!acc[m.student_name]) acc[m.student_name] = [];
    acc[m.student_name].push(m);
    return acc;
  }, {});

  const toggleStudent = (name: string) => {
    setExpandedStudents(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

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
        <p className="text-xs text-muted-foreground">تسجيلات الحصص المكتملة (متاحة لمدة 7 أيام)</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(grouped).map(([studentName, items]) => (
          <div key={studentName} className="rounded-2xl border bg-muted/20 overflow-hidden">
            <button
              onClick={() => toggleStudent(studentName)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{studentName}</p>
                  <p className="text-[11px] text-muted-foreground">{items.length} حصة</p>
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
                    {items.map(m => (
                      <motion.div key={m.id} layout className="rounded-xl border bg-card overflow-hidden">
                        <button
                          onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                          className="w-full flex items-center justify-between p-3 text-right hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                              <FileText className="h-4 w-4 text-secondary" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground">{m.subject_name}</p>
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
                              <div className="p-4">
                                {m.recording_url ? (
                                  <div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Play className="h-4 w-4 text-primary" />
                                      <span className="text-sm font-bold text-foreground">تسجيل الحصة</span>
                                    </div>
                                    <video src={m.recording_url} controls className="w-full rounded-xl max-h-96" preload="metadata" />
                                  </div>
                                ) : (
                                  <div className="text-center py-6 bg-muted/30 rounded-xl">
                                    <p className="text-sm text-muted-foreground">جاري معالجة فيديو الجلسة... قد يستغرق رفعه بضع دقائق</p>
                                  </div>
                                )}
                              </div>
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
        ))}
      </CardContent>
    </Card>
  );
}
