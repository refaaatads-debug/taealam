import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, ChevronDown, ChevronUp, Play, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionVideoPlayer from "./SessionVideoPlayer";

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

export default function SessionMaterials() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<SessionMaterial[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const pendingRecordingsRef = useRef(false);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!user) return;
    void fetchMaterials();
    const channel = supabase
      .channel(`student-session-materials-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "session_materials",
        filter: `student_id=eq.${user.id}`,
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
      .eq("student_id", user.id)
      .eq("is_deleted", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (materialsError) {
      console.error("Failed to load student session materials", materialsError);
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
    // Get AI reports from sessions
    const sessionIds = mats.map(m => m.session_id);
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, ai_report, booking_id, recording_url")
      .in("id", sessionIds);
    const sessionMap = new Map((sessions ?? []).map(s => [s.id, s]));
    pendingRecordingsRef.current = mats.some((material) => {
      const session = sessionMap.get(material.session_id);
      return !(material.recording_url || session?.recording_url);
    });

    // Get subject names from bookings
    const bookingIds = (sessions ?? []).map(s => s.booking_id).filter(Boolean);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, subjects(name)")
      .in("id", bookingIds);
    const bookingMap = new Map((bookings ?? []).map(b => [b.id, (b.subjects as any)?.name || "حصة"]));

    const now = Date.now();
    const enriched = await batchAsync(mats, 3, async (m) => {
      const session = sessionMap.get(m.session_id);
      const subjectName = session ? (bookingMap.get(session.booking_id) || "حصة") : "حصة";

      // Convert public URL to signed URL (bucket is now private)
      let signedUrl: string | null = m.recording_url || session?.recording_url || null;
      if (signedUrl) {
        try {
          const marker = "/session-recordings/";
          const idx = signedUrl.indexOf(marker);
          if (idx !== -1) {
            const path = decodeURIComponent(signedUrl.substring(idx + marker.length).split("?")[0]);
            const { data: signed } = await supabase.storage
              .from("session-recordings")
              .createSignedUrl(path, 60 * 60); // 1 hour
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
        days_remaining: Math.max(0, Math.ceil((new Date(m.expires_at).getTime() - now) / (1000 * 60 * 60 * 24))),
      };
    });
    setMaterials(enriched);
    initialLoadRef.current = false;
    setLoading(false);
  };

  const grouped = materials.reduce<Record<string, SessionMaterial[]>>((acc, m) => {
    if (!acc[m.subject_name]) acc[m.subject_name] = [];
    acc[m.subject_name].push(m);
    return acc;
  }, {});

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
                        <div className="p-4">
                          {m.recording_url ? (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Play className="h-4 w-4 text-primary" />
                                  <span className="text-sm font-bold text-foreground">تسجيل الحصة</span>
                                </div>
                              </div>
                              <SessionVideoPlayer src={m.recording_url} title={m.title} />
                            </div>
                          ) : (
                            <div className="text-center py-6 bg-muted/30 rounded-xl">
                              <VideoOff className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
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
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
