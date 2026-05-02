import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Upload, Mic, Square, FileText, CheckCircle2, Sparkles, Play, Pause } from "lucide-react";
import { toast } from "sonner";

const StudentAssignments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [openSubmit, setOpenSubmit] = useState<any>(null);

  // Submission form
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);

    // تحقق من وجود اشتراك نشط (بدون خصم من الرصيد - فقط للتفعيل)
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id, is_active, remaining_minutes, ends_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gt("remaining_minutes", 0)
      .gte("ends_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    setHasActiveSubscription(!!sub);

    // الواجبات أولاً (الأهم) — استعلام مبسط بدون joins ثقيلة
    const { data: a } = await supabase
      .from("assignments" as any)
      .select("id, title, description, total_points, due_date, questions, attachments, allow_text, allow_image, allow_audio, subject_id, teaching_stage, created_at, student_id")
      .or(`student_id.eq.${user.id},student_id.is.null`)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100);
    setAssignments((a as any[]) || []);
    setLoading(false);

    // الحلول لاحقاً في الخلفية - مع التفاصيل الكاملة
    const { data: subs } = await supabase
      .from("assignment_submissions" as any)
      .select("id, assignment_id, status, ai_score, ai_feedback, ai_breakdown, teacher_score, teacher_feedback, final_score, submitted_at, reviewed_at")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(200);
    const subsList = (subs as any[]) || [];
    // اربط بيانات الواجب
    const titleMap: Record<string, any> = {};
    ((a as any[]) || []).forEach((x: any) => { titleMap[x.id] = x; });
    setSubmissions(subsList.map((s: any) => ({
      ...s,
      assignment: titleMap[s.assignment_id] || null,
    })));
  };

  const submittedIds = new Set(submissions.map(s => s.assignment_id));
  const pending = assignments.filter(a => !submittedIds.has(a.id));

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (e) {
      toast.error("لا يمكن الوصول للميكروفون");
    }
  };

  const stopRecord = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const handleSubmit = async () => {
    if (!user || !openSubmit) return;
    if (!text.trim() && images.length === 0 && !audioBlob && answers.every(a => !a?.trim())) {
      toast.error("أضف إجابة (نص أو صورة أو صوت)");
      return;
    }
    setSubmitting(true);
    try {
      // Upload images
      const imageUrls: string[] = [];
      for (const img of images) {
        const path = `${user.id}/${openSubmit.id}/${Date.now()}-${img.name}`;
        const { error } = await supabase.storage.from("assignment-files").upload(path, img);
        if (error) throw error;
        const { data: signed } = await supabase.storage.from("assignment-files").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signed?.signedUrl) imageUrls.push(signed.signedUrl);
      }

      // Upload audio
      let audioUrl = null;
      if (audioBlob) {
        const path = `${user.id}/${openSubmit.id}/audio-${Date.now()}.webm`;
        const { error } = await supabase.storage.from("assignment-files").upload(path, audioBlob);
        if (error) throw error;
        const { data: signed } = await supabase.storage.from("assignment-files").createSignedUrl(path, 60 * 60 * 24 * 365);
        audioUrl = signed?.signedUrl;
      }

      const { data: subData, error } = await supabase.from("assignment_submissions" as any).insert({
        assignment_id: openSubmit.id,
        student_id: user.id,
        text_answer: text || null,
        image_urls: imageUrls,
        audio_url: audioUrl,
        answers: answers,
        status: "submitted",
      }).select().single();

      if (error) throw error;

      // Trigger AI grading in background
      supabase.functions.invoke("grade-assignment", {
        body: { submission_id: (subData as any).id },
      }).catch(() => {});

      // Notify teacher
      await supabase.from("notifications").insert({
        user_id: openSubmit.teacher_id,
        title: "حل واجب جديد",
        body: `تم تسليم حل لواجب "${openSubmit.title}"`,
        type: "assignment",
        link: "/teacher/assignments",
      });

      toast.success("تم تسليم الحل بنجاح");
      setOpenSubmit(null);
      setText(""); setAnswers([]); setImages([]); setAudioBlob(null);
      fetchAll();
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-black mb-6">واجباتي</h1>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">المطلوبة {pending.length > 0 && <Badge className="mr-1">{pending.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="completed">المُسلَّمة ({submissions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-3 mt-4">
            {pending.length === 0 && <Card className="p-8 text-center text-muted-foreground">لا توجد واجبات مطلوبة</Card>}
            {pending.map(a => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-bold">{a.title}</h3>
                      {a.description && <p className="text-sm text-muted-foreground mt-1">{a.description}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary">{(a.questions || []).length} أسئلة</Badge>
                        <Badge variant="outline">{a.total_points} درجة</Badge>
                        {a.due_date && <Badge variant="outline">حتى {new Date(a.due_date).toLocaleDateString("ar")}</Badge>}
                      </div>
                    </div>
                    <Button onClick={() => {
                      setOpenSubmit(a);
                      setAnswers(new Array((a.questions || []).length).fill(""));
                    }}>
                      حل الواجب
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3 mt-4">
            {submissions.length === 0 && <Card className="p-8 text-center text-muted-foreground">لم تُسلِّم أي واجب بعد</Card>}
            {submissions.map(s => {
              const isFinal = s.final_score != null;
              const totalPts = s.assignment?.total_points || 100;
              const score = s.final_score ?? s.ai_score;
              const pct = score != null ? Math.round((Number(score) / totalPts) * 100) : 0;
              return (
                <Card key={s.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className={`p-4 ${isFinal ? "bg-primary/5" : "bg-muted/30"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold truncate">{s.assignment?.title || "واجب"}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            سُلِّم {new Date(s.submitted_at).toLocaleDateString("ar")}
                            {s.reviewed_at && ` • صُحِّح ${new Date(s.reviewed_at).toLocaleDateString("ar")}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {isFinal ? (
                            <Badge className="text-base"><CheckCircle2 className="h-3 w-3 ml-1" /> {s.final_score} / {totalPts}</Badge>
                          ) : s.ai_score != null ? (
                            <Badge variant="secondary"><Sparkles className="h-3 w-3 ml-1" /> AI: {s.ai_score} / {totalPts}</Badge>
                          ) : (
                            <Badge variant="outline">قيد التصحيح</Badge>
                          )}
                          {score != null && (
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                          )}
                        </div>
                      </div>
                      {/* Progress bar */}
                      {score != null && (
                        <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-destructive"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Teacher feedback */}
                    {s.teacher_feedback && (
                      <div className="p-4 border-t bg-primary/5">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <Label className="text-sm font-bold">ملاحظات المعلم</Label>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.teacher_feedback}</p>
                      </div>
                    )}

                    {/* AI feedback */}
                    {!isFinal && s.ai_feedback && (
                      <div className="p-4 border-t">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-secondary" />
                          <Label className="text-sm font-bold">تقييم AI الأولي</Label>
                          <Badge variant="outline" className="text-[10px]">قبل مراجعة المعلم</Badge>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{s.ai_feedback}</p>
                      </div>
                    )}

                    {/* Per-question breakdown */}
                    {Array.isArray(s.ai_breakdown) && s.ai_breakdown.length > 0 && (
                      <details className="border-t">
                        <summary className="p-4 cursor-pointer hover:bg-muted/50 text-sm font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          تفاصيل التصحيح ({s.ai_breakdown.length} سؤال)
                        </summary>
                        <div className="px-4 pb-4 space-y-2">
                          {s.ai_breakdown.map((b: any, i: number) => {
                            const qPct = b.max_points ? (Number(b.points || 0) / Number(b.max_points)) * 100 : 0;
                            return (
                              <div key={i} className="border rounded-lg p-3 bg-card">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <p className="text-sm font-semibold flex-1">{i + 1}. {b.question}</p>
                                  <Badge variant={qPct >= 75 ? "default" : qPct >= 50 ? "secondary" : "destructive"} className="shrink-0">
                                    {b.points ?? 0} / {b.max_points ?? "?"}
                                  </Badge>
                                </div>
                                {b.student_answer && (
                                  <div className="text-xs mb-1">
                                    <span className="text-muted-foreground">إجابتك: </span>
                                    <span>{b.student_answer}</span>
                                  </div>
                                )}
                                {b.correct_answer && (
                                  <div className="text-xs mb-1">
                                    <span className="text-muted-foreground">الإجابة الصحيحة: </span>
                                    <span className="text-primary font-semibold">{b.correct_answer}</span>
                                  </div>
                                )}
                                {b.comment && (
                                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{b.comment}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        <Dialog open={!!openSubmit} onOpenChange={(o) => !o && setOpenSubmit(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{openSubmit?.title}</DialogTitle></DialogHeader>
            {openSubmit && (
              <div className="space-y-4">
                {openSubmit.description && <p className="text-sm text-muted-foreground">{openSubmit.description}</p>}

                {(openSubmit.attachments || []).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-base">مرفقات الواجب</Label>
                    <div className="space-y-2">
                      {(openSubmit.attachments as any[]).map((f, i) => (
                        <a
                          key={i}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-muted/40 hover:bg-muted/60 rounded-lg p-3 transition"
                        >
                          <FileText className="h-4 w-4 text-secondary shrink-0" />
                          <span className="text-sm flex-1 truncate">{f.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {f.type?.includes("pdf") ? "PDF" : "صورة"}
                          </Badge>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {(openSubmit.questions || []).length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-base">الأسئلة</Label>
                    {(openSubmit.questions as any[]).map((q, i) => (
                      <Card key={i} className="p-3">
                        <p className="font-semibold text-sm mb-2">{i + 1}. {q.text} <Badge variant="outline" className="text-[10px]">{q.points} درجة</Badge></p>
                        {q.type === "multiple_choice" && (q.options || []).length > 0 ? (
                          <div className="space-y-1">
                            {q.options.map((opt: string, oi: number) => (
                              <label key={oi} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="radio" name={`q-${i}`} value={opt} checked={answers[i] === opt} onChange={() => {
                                  const next = [...answers]; next[i] = opt; setAnswers(next);
                                }} />
                                {opt}
                              </label>
                            ))}
                          </div>
                        ) : q.type === "true_false" ? (
                          <div className="flex gap-2">
                            {["صح", "خطأ"].map(v => (
                              <Button key={v} size="sm" variant={answers[i] === v ? "default" : "outline"} onClick={() => {
                                const next = [...answers]; next[i] = v; setAnswers(next);
                              }}>{v}</Button>
                            ))}
                          </div>
                        ) : (
                          <Textarea value={answers[i] || ""} onChange={(e) => {
                            const next = [...answers]; next[i] = e.target.value; setAnswers(next);
                          }} rows={2} />
                        )}
                      </Card>
                    ))}
                  </div>
                )}

                {openSubmit.allow_text !== false && (
                  <div>
                    <Label>إجابة نصية إضافية</Label>
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="اكتب إجابتك هنا..." />
                  </div>
                )}

                {openSubmit.allow_image !== false && (
                  <div>
                    <Label>صور الحل</Label>
                    <Input type="file" multiple accept="image/*,.pdf" onChange={(e) => setImages(Array.from(e.target.files || []))} />
                    {images.length > 0 && <p className="text-xs text-muted-foreground mt-1">{images.length} ملف محدد</p>}
                  </div>
                )}

                {openSubmit.allow_audio !== false && (
                  <div>
                    <Label>تسجيل صوتي</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {!recording && !audioBlob && (
                        <Button type="button" variant="outline" onClick={startRecord} className="gap-2"><Mic className="h-4 w-4" /> ابدأ التسجيل</Button>
                      )}
                      {recording && (
                        <Button type="button" variant="destructive" onClick={stopRecord} className="gap-2"><Square className="h-4 w-4" /> إيقاف</Button>
                      )}
                      {audioBlob && !recording && (
                        <>
                          <audio src={URL.createObjectURL(audioBlob)} controls className="flex-1" />
                          <Button type="button" size="sm" variant="ghost" onClick={() => setAudioBlob(null)}>حذف</Button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  تسليم الحل
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
      <BottomNav />
    </div>
  );
};

export default StudentAssignments;
