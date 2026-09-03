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
import { Loader2, Upload, Mic, Square, FileText, CheckCircle2, Sparkles, Play, Pause, Lock, ListChecks, Clock3, Trophy } from "lucide-react";
import { toast } from "sonner";

const isQuiz = (item: any) => item?.content_type === "quiz";

const StudentAssignments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [openSubmit, setOpenSubmit] = useState<any>(null);
  const [resultType, setResultType] = useState<"all" | "assignment" | "quiz">("all");

  // Submission form
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<any[]>([]);
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
      .select("id, title, description, total_points, due_date, questions, attachments, allow_text, allow_image, allow_audio, subject_id, teaching_stage, created_at, student_id, teacher_id, content_type")
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
  const pendingHomework = pending.filter((assignment) => !isQuiz(assignment));
  const pendingQuizzes = pending.filter(isQuiz);
  const gradedCount = submissions.filter(s => s.final_score != null || s.ai_score != null).length;
  const pendingReviewCount = submissions.filter(s => s.final_score == null).length;
  const totalEarned = submissions.reduce((sum, s) => sum + Number(s.final_score ?? s.ai_score ?? 0), 0);
  const totalAvailable = submissions.reduce((sum, s) => sum + Number(s.assignment?.total_points || 100), 0);
  const hasAnswer = (answer: any) => Array.isArray(answer) ? answer.length > 0 : Boolean(String(answer ?? "").trim());
  const visibleSubmissions = submissions.filter((submission) => resultType === "all" || (isQuiz(submission.assignment) ? "quiz" : "assignment") === resultType);
  const renderPendingCard = (assignment: any) => (
    <Card key={assignment.id} className={`border-r-4 ${isQuiz(assignment) ? "border-r-secondary/60" : "border-r-primary/60"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold">{assignment.title}</h3>
              <Badge variant={isQuiz(assignment) ? "secondary" : "outline"}>{isQuiz(assignment) ? "اختبار" : "واجب"}</Badge>
            </div>
            {assignment.description && <p className="text-sm text-muted-foreground mt-1">{assignment.description}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary">{(assignment.questions || []).length} أسئلة</Badge>
              {(assignment.questions || []).some((question: any) => question.type === "multiple_choice" || question.type === "multiple_select") && <Badge variant="outline">MCQ / MSQ</Badge>}
              <Badge variant="outline">{assignment.total_points} درجة</Badge>
              {assignment.due_date && <Badge variant="outline">حتى {new Date(assignment.due_date).toLocaleDateString("ar")}</Badge>}
            </div>
          </div>
          <Button
            disabled={!hasActiveSubscription}
            onClick={() => {
              if (!hasActiveSubscription) {
                toast.error("تحتاج إلى اشتراك نشط لحل الواجبات والاختبارات");
                return;
              }
              setOpenSubmit(assignment);
              setAnswers(new Array((assignment.questions || []).length).fill(""));
            }}
          >
            {hasActiveSubscription ? (isQuiz(assignment) ? "ابدأ الاختبار" : "حل الواجب") : <><Lock className="h-3 w-3 ml-1" /> مقفل</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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
    const questions = Array.isArray(openSubmit.questions) ? openSubmit.questions : [];
    const missingQuestion = questions.findIndex((question: any, index: number) => !hasAnswer(answers[index]));
    if (questions.length > 0 && missingQuestion !== -1) {
      toast.error(`أجب عن السؤال ${missingQuestion + 1} قبل التسليم`);
      return;
    }
    if (!text.trim() && images.length === 0 && !audioBlob && answers.every(a => !hasAnswer(a))) {
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
        title: "📥 حل واجب جديد",
        body: `تم تسليم حل لواجب "${openSubmit.title}"`,
        type: "submission",
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
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black">واجباتي واختباراتي</h1>
          <p className="text-sm text-muted-foreground mt-1">حل المطلوب، تابع التصحيح، وراجع أخطاءك لتحسين مستواك</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Card className="border-primary/15 bg-primary/[0.04]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-primary"><ListChecks className="h-4 w-4" /><span className="text-xs font-semibold">متاحة للحل</span></div>
              <p className="text-2xl font-black mt-2">{pending.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-amber-600"><Clock3 className="h-4 w-4" /><span className="text-xs font-semibold">قيد التصحيح</span></div>
              <p className="text-2xl font-black mt-2">{pendingReviewCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /><span className="text-xs font-semibold">تم تقييمها</span></div>
              <p className="text-2xl font-black mt-2">{gradedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-secondary"><Trophy className="h-4 w-4" /><span className="text-xs font-semibold">متوسط الإنجاز</span></div>
              <p className="text-2xl font-black mt-2">{totalAvailable ? `${Math.round((totalEarned / totalAvailable) * 100)}%` : "—"}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="homework">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="homework">الواجبات {pendingHomework.length > 0 && <Badge className="mr-1">{pendingHomework.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="quizzes">الاختبارات {pendingQuizzes.length > 0 && <Badge className="mr-1">{pendingQuizzes.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="completed">النتائج والمراجعة ({submissions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="homework" className="space-y-3 mt-4">
            {!hasActiveSubscription && pendingHomework.length > 0 && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-bold text-foreground">حل الواجبات يتطلب اشتراكاً نشطاً</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      يمكنك تصفح الواجبات، ولكن لتسليم الإجابات تحتاج إلى باقة نشطة. لا يتم خصم أي دقائق من رصيدك عند حل الواجبات.
                    </p>
                    <Button size="sm" className="mt-2" onClick={() => navigate("/pricing")}>
                      عرض الباقات
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {pendingHomework.length === 0 && <Card className="p-8 text-center text-muted-foreground">لا توجد واجبات مطلوبة</Card>}
            {pendingHomework.map(renderPendingCard)}
          </TabsContent>

          <TabsContent value="quizzes" className="space-y-3 mt-4">
            <div className="rounded-xl border border-secondary/20 bg-secondary/[0.04] p-4">
              <p className="font-semibold text-sm">قسم الاختبارات</p>
              <p className="text-xs text-muted-foreground mt-1">ابدأ الاختبار، أجب عن MCQ باختيار واحد وMSQ بأكثر من إجابة، ثم تابع نتيجتك بعد التصحيح.</p>
            </div>
            {!hasActiveSubscription && pendingQuizzes.length > 0 && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div><h4 className="font-bold text-foreground">بدء الاختبار يتطلب اشتراكاً نشطاً</h4><p className="text-sm text-muted-foreground mt-1">يمكنك مشاهدة الاختبارات، ويُفتح الحل عند توفر اشتراك نشط.</p></div>
                </CardContent>
              </Card>
            )}
            {pendingQuizzes.length === 0 && <Card className="p-8 text-center text-muted-foreground">لا توجد اختبارات متاحة</Card>}
            {pendingQuizzes.map(renderPendingCard)}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3 mt-4">
            <div className="flex flex-wrap gap-2">
              {([
                { value: "all", label: "الكل", count: submissions.length },
                { value: "assignment", label: "📘 الواجبات", count: submissions.filter((submission) => !isQuiz(submission.assignment)).length },
                { value: "quiz", label: "🧠 الاختبارات", count: submissions.filter((submission) => isQuiz(submission.assignment)).length },
              ] as const).map((filter) => (
                <Button key={filter.value} type="button" size="sm" variant={resultType === filter.value ? "default" : "outline"} onClick={() => setResultType(filter.value)}>
                  {filter.label} ({filter.count})
                </Button>
              ))}
            </div>
            {visibleSubmissions.length === 0 && <Card className="p-8 text-center text-muted-foreground">لا توجد نتائج في هذا القسم بعد</Card>}
            {visibleSubmissions.map(s => {
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
                           <div className="flex items-center gap-2">
                             <h4 className="font-bold truncate">{s.assignment?.title || "محتوى تعليمي"}</h4>
                             <Badge variant={isQuiz(s.assignment) ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                               {isQuiz(s.assignment) ? "اختبار" : "واجب"}
                             </Badge>
                           </div>
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
                         <p className="font-semibold text-sm mb-2">
                           {i + 1}. {q.text}
                           <Badge variant="outline" className="text-[10px] mr-2">
                             {q.points} درجة
                           </Badge>
                           {(q.type === "multiple_choice" || q.type === "multiple_select") && (
                             <Badge variant="secondary" className="text-[10px]">
                               {q.type === "multiple_choice" ? "MCQ" : "MSQ"}
                             </Badge>
                           )}
                         </p>
                         {q.type === "multiple_choice" && (q.options || []).length > 0 ? (
                          <div className="space-y-1">
                            {q.options.map((opt: string, oi: number) => (
                               <label key={oi} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1 hover:bg-muted/60">
                                <input type="radio" name={`q-${i}`} value={opt} checked={answers[i] === opt} onChange={() => {
                                  const next = [...answers]; next[i] = opt; setAnswers(next);
                                }} />
                                {opt}
                              </label>
                            ))}
                          </div>
                         ) : q.type === "multiple_select" && (q.options || []).length > 0 ? (
                           <div className="space-y-1">
                             <p className="text-xs text-muted-foreground mb-2">يمكن اختيار أكثر من إجابة</p>
                             {q.options.map((opt: string, oi: number) => {
                               const selected = Array.isArray(answers[i]) ? answers[i] : [];
                               return (
                                 <label key={oi} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1 hover:bg-muted/60">
                                   <input
                                     type="checkbox"
                                     value={opt}
                                     checked={selected.includes(opt)}
                                     onChange={(e) => {
                                       const nextSelected = e.target.checked
                                         ? [...selected, opt]
                                         : selected.filter((value: string) => value !== opt);
                                       const next = [...answers]; next[i] = nextSelected; setAnswers(next);
                                     }}
                                   />
                                   {opt}
                                 </label>
                               );
                             })}
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
