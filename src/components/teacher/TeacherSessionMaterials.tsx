import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, ChevronDown, ChevronUp, Sparkles, Play, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionVideoPlayer from "@/components/student/SessionVideoPlayer";
import CallStudentButton from "@/components/teacher/CallStudentButton";
import { toast } from "sonner";

interface SessionMaterial {
  id: string;
  session_id: string;
  student_id: string;
  title: string;
  description: string | null;
  recording_url: string | null;
  duration_minutes: number;
  created_at: string;
  expires_at: string;
  booking_id: string | null;
  days_remaining: number;
  ai_report: string | null;
  subject_name: string;
  student_name: string;
}


// Limit concurrent signed-URL requests to avoid ERR_HTTP2_PROTOCOL_ERROR
async function batchAsync<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export default function TeacherSessionMaterials() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<SessionMaterial[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const pendingRecordingsRef = useRef(false);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!user) return;
    void fetchMaterials();
    const channel = supabase
      .channel(`teacher-session-materials-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "session_materials",
        filter: `teacher_id=eq.${user.id}`,
      }, () => { void fetchMaterials(); })
      .subscribe();
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void fetchMaterials();
    };
    const poll = window.setInterval(() => {
      if (pendingRecordingsRef.current && document.visibilityState === "visible") {
        void fetchMaterials();
      }
    }, 15_000);
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchMaterials = async () => {
    if (!user) return;
    if (initialLoadRef.current) setLoading(true);

    const { data: mats, error: materialsError } = await supabase
      .from("session_materials")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("is_deleted", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (materialsError) {
      console.error("Failed to load teacher session materials", materialsError);
      setLoadError(true);
      pendingRecordingsRef.current = false;
      initialLoadRef.current = false;
      setLoading(false);
      return;
    }
    setLoadError(false);
    if (!mats || mats.length === 0) {
      setMaterials([]);
      pendingRecordingsRef.current = false;
      initialLoadRef.current = false;
      setLoading(false);
      return;
    }
    const sessionIds = mats.map(m => m.session_id);
    const studentIds = [...new Set(mats.map(m => m.student_id))];

    const [{ data: sessions }, { data: profiles }] = await Promise.all([
      supabase.from("sessions").select("id, ai_report, booking_id, recording_url, ended_at").in("id", sessionIds),
      supabase.from("public_profiles").select("user_id, full_name").in("user_id", studentIds),
    ]);

    const sessionMap = new Map((sessions ?? []).map(s => [s.id, s]));
    pendingRecordingsRef.current = mats.some((material) => {
      const session = sessionMap.get(material.session_id);
      return !(material.recording_url || session?.recording_url);
    });
    const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));

    const bookingIds = (sessions ?? []).map(s => s.booking_id).filter(Boolean);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, subjects(name)")
      .in("id", bookingIds);
    const bookingMap = new Map((bookings ?? []).map(b => [b.id, (b.subjects as any)?.name || "حصة"]));

    const now = Date.now();
    const result = await batchAsync(mats, 3, async (m) => {
      const session = sessionMap.get(m.session_id);
      const subjectName = session ? (bookingMap.get(session.booking_id) || "حصة") : "حصة";

      let signedUrl: string | null = m.recording_url || session?.recording_url || null;
      if (signedUrl) {
        try {
          const marker = "/session-recordings/";
          const idx = signedUrl.indexOf(marker);
          if (idx !== -1) {
            const path = decodeURIComponent(signedUrl.substring(idx + marker.length).split("?")[0]);
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
        booking_id: session?.booking_id || null,
        ai_report: session?.ai_report || null,
        subject_name: subjectName,
        student_name: nameMap.get(m.student_id) || "طالب",
        days_remaining: Math.max(0, Math.ceil((new Date(m.expires_at).getTime() - now) / (1000 * 60 * 60 * 24))),
      };
    });
    setMaterials(result);
    // Auto-expand first student
    const firstStudent = result[0]?.student_name;
    if (firstStudent) setExpandedStudents(new Set([firstStudent]));
    initialLoadRef.current = false;
    setLoading(false);
  };

  const recoverRecording = async (material: SessionMaterial) => {
    if (!user || !material.booking_id) {
      toast.error("تعذر تحديد الحجز المرتبط بالتسجيل");
      return;
    }

    setRecoveringId(material.id);
    try {
      const { getRecordingBackup, clearRecordingBackup } = await import("@/lib/recordingBackup");
      const backup = await getRecordingBackup(material.booking_id);
      let fileName: string | null = null;

      if (backup?.userId === user.id) {
        const { error } = await supabase.storage
          .from("session-recordings")
          .upload(backup.fileName, backup.blob, { contentType: "video/webm", upsert: true });
        if (error) throw error;
        fileName = backup.fileName;
      } else {
        const { data: files, error } = await supabase.storage
          .from("session-recordings")
          .list(user.id, { search: `${material.booking_id}_`, limit: 100 });
        if (error) throw error;
        const match = (files ?? [])
          .filter((file) => file.name.startsWith(`${material.booking_id}_`) && file.name.endsWith(".webm"))
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
        if (match) fileName = `${user.id}/${match.name}`;
      }

      if (!fileName) {
        throw new Error("لم نعثر على نسخة محلية أو ملف مرفوع لهذا الحجز");
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from("session-recordings")
        .createSignedUrl(fileName, 60 * 60 * 24 * 7);
      if (signedError) throw signedError;
      if (!signedData?.signedUrl) throw new Error("تعذر إنشاء رابط آمن للتسجيل");

      const { error: saveError } = await supabase.functions.invoke("save-session-recording", {
        body: { booking_id: material.booking_id, recording_url: signedData.signedUrl },
      });
      if (saveError) throw saveError;

      if (backup?.userId === user.id) await clearRecordingBackup(material.booking_id);
      toast.success("تم استعادة التسجيل وربطه بالحصة");
      await fetchMaterials();
    } catch (error) {
      console.error("[recording-recovery] Failed to recover session recording", error);
      const message = error instanceof Error ? error.message : "تحقق من اتصال الحساب وحاول مرة أخرى";
      toast.error(`تعذر استعادة التسجيل: ${message}`);
    } finally {
      setRecoveringId(null);
    }
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

  if (loading) return null;
  if (loadError) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">تعذر تحميل تسجيلات الحصص.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchMaterials()}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    );
  }
  if (materials.length === 0) return null;

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
            <div className="flex items-center gap-2 p-2">
              <button
                onClick={() => toggleStudent(studentName)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-right hover:bg-muted/40 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 text-right">
                  <p className="truncate text-sm font-bold text-foreground">{studentName}</p>
                  <p className="text-[11px] text-muted-foreground">{items.length} حصة</p>
                </div>
                {expandedStudents.has(studentName)
                  ? <ChevronUp className="mr-auto h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="mr-auto h-4 w-4 text-muted-foreground" />}
              </button>
              <CallStudentButton
                studentId={items[0].student_id}
                studentName={studentName}
                variant="outline"
                size="sm"
                iconOnly
                className="h-8 w-8 shrink-0 rounded-lg p-0 border-secondary/30 text-secondary hover:bg-secondary/10"
              />
            </div>
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
                                    <SessionVideoPlayer src={m.recording_url} title={`${m.subject_name} • ${m.student_name}`} />
                                  </div>
                                ) : (
                                  <div className="text-center py-6 bg-muted/30 rounded-xl">
                                    <p className="text-sm text-muted-foreground">جاري معالجة فيديو الجلسة... قد يستغرق رفعه بضع دقائق</p>
                                    {m.booking_id && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="mt-3"
                                        disabled={recoveringId === m.id}
                                        onClick={() => void recoverRecording(m)}
                                      >
                                        {recoveringId === m.id ? "جارٍ استعادة التسجيل..." : "إعادة محاولة حفظ التسجيل"}
                                      </Button>
                                    )}
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
