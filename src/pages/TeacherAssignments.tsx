import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Library, Loader2, Trash2, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Question {
  id: string;
  text: string;
  type: "multiple_choice" | "text" | "true_false";
  options?: string[];
  correct?: string;
  points: number;
}

const TeacherAssignments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [bank, setBank] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  // Submissions filters
  const [subFilter, setSubFilter] = useState<"all" | "submitted" | "ai_graded" | "reviewed">("all");
  const [subSearch, setSubSearch] = useState("");

  // New assignment form
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [studentId, setStudentId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [stage, setStage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [saving, setSaving] = useState(false);

  // Question bank
  const [qOpen, setQOpen] = useState(false);
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState<"multiple_choice" | "text" | "true_false">("text");
  const [qOptions, setQOptions] = useState("");
  const [qCorrect, setQCorrect] = useState("");
  const [qExplanation, setQExplanation] = useState("");
  const [qStage, setQStage] = useState("");
  const [qSubject, setQSubject] = useState("");
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    const [
      { data: a },
      { data: qb },
      { data: subj },
      { data: realBookings },
    ] = await Promise.all([
      supabase.from("assignments" as any).select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      supabase.from("question_bank" as any).select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      supabase.from("subjects").select("*"),
      // فقط الطلاب الذين تمت معهم حصص فعلية (مؤكدة أو منتهية)
      supabase.from("bookings").select("student_id, status").eq("teacher_id", user.id).in("status", ["confirmed", "completed"]),
    ]);
    const assignmentsList = (a as any[]) || [];
    setAssignments(assignmentsList);
    setBank((qb as any[]) || []);
    setSubjects(subj || []);

    // جلب الحلول الواردة لواجبات هذا المعلم فقط مع بيانات الطالب
    const assignmentIds = assignmentsList.map((x: any) => x.id);
    if (assignmentIds.length > 0) {
      const { data: subs } = await supabase
        .from("assignment_submissions" as any)
        .select("*")
        .in("assignment_id", assignmentIds)
        .order("submitted_at", { ascending: false });
      const subsList = (subs as any[]) || [];
      const studentIdsSubs = Array.from(new Set(subsList.map((s: any) => s.student_id).filter(Boolean)));
      let profMap: Record<string, string> = {};
      if (studentIdsSubs.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIdsSubs);
        (profs || []).forEach((p: any) => { profMap[p.user_id] = p.full_name || "طالب"; });
      }
      const titleMap: Record<string, string> = {};
      assignmentsList.forEach((x: any) => { titleMap[x.id] = x.title; });
      setSubmissions(subsList.map((s: any) => ({
        ...s,
        assignment: { title: titleMap[s.assignment_id] || "واجب" },
        profiles: { full_name: profMap[s.student_id] || "طالب" },
      })));
    } else {
      setSubmissions([]);
    }

    const studentIds = Array.from(new Set(((realBookings as any[]) || []).map(b => b.student_id).filter(Boolean)));
    let list: { id: string; name: string }[] = [];
    if (studentIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds);
      list = (profs || [])
        .map((p: any) => ({ id: p.user_id, name: p.full_name || "طالب" }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    }
    setStudents(list);
    setLoading(false);
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      id: crypto.randomUUID(),
      text: "",
      type: "text",
      points: 10,
    }]);
  };

  const updateQ = (id: string, patch: Partial<Question>) => {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q));
  };

  const removeQ = (id: string) => setQuestions(qs => qs.filter(q => q.id !== id));

  const importFromBank = (q: any) => {
    setQuestions(qs => [...qs, {
      id: crypto.randomUUID(),
      text: q.question_text,
      type: q.question_type,
      options: q.options,
      correct: q.correct_answer,
      points: q.points || 10,
    }]);
    toast.success("تم إضافة السؤال");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: الحجم يتجاوز 10MB`);
          continue;
        }
        const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) {
          toast.error(`${file.name}: نوع غير مدعوم (PDF/JPG/PNG فقط)`);
          continue;
        }
        const ext = file.name.split(".").pop();
        const path = `${user.id}/assignments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("assignment-files").upload(path, file);
        if (upErr) { toast.error(upErr.message); continue; }
        const { data: signed } = await supabase.storage.from("assignment-files").createSignedUrl(path, 60 * 60 * 24 * 365);
        setAttachments(prev => [...prev, {
          name: file.name,
          url: signed?.signedUrl || path,
          type: file.type,
        }]);
      }
      toast.success("تم رفع المرفقات");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const saveAssignment = async () => {
    if (!user || !title.trim()) { toast.error("العنوان مطلوب"); return; }
    setSaving(true);
    const total = questions.reduce((s, q) => s + (q.points || 0), 0) || 100;
    const { data: created, error } = await supabase.from("assignments" as any).insert({
      teacher_id: user.id,
      student_id: studentId || null,
      title, description,
      subject_id: subjectId || null,
      teaching_stage: stage || null,
      questions: questions as any,
      attachments: attachments as any,
      total_points: total,
      due_date: dueDate || null,
    }).select().single();
    setSaving(false);
    if (error) { toast.error("خطأ: " + error.message); return; }

    // إرسال إشعار + رسالة محادثة تلقائية
    try {
      const link = `/student/assignments`;
      const chatLink = (a_studentId: string, a_link: string) => `[[ASSIGNMENT:${a_link}]]\n📝 واجب جديد: ${title}${description ? "\n" + description : ""}\n${(questions || []).length} أسئلة • ${total} درجة${dueDate ? " • حتى " + new Date(dueDate).toLocaleDateString("ar") : ""}`;

      const sendChatToStudent = async (sId: string) => {
        // ابحث عن أي حجز بين المعلم والطالب لربط الرسالة
        const { data: bk } = await supabase.from("bookings")
          .select("id")
          .eq("teacher_id", user.id)
          .eq("student_id", sId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bk?.id) {
          await supabase.from("chat_messages").insert({
            booking_id: bk.id,
            sender_id: user.id,
            content: chatLink(sId, link),
          });
        }
      };

      if (studentId) {
        await Promise.all([
          supabase.from("notifications").insert({
            user_id: studentId,
            title: "📝 واجب جديد",
            body: `تم إسناد واجب: ${title}`,
            type: "assignment",
            link,
          }),
          sendChatToStudent(studentId),
        ]);
      } else {
        // واجب عام: أرسل لجميع الطلاب الذين لديهم حصص فعلية مع المعلم
        const { data: bks } = await supabase.from("bookings")
          .select("student_id")
          .eq("teacher_id", user.id)
          .in("status", ["confirmed", "completed"]);
        let ids = Array.from(new Set((bks || []).map((b: any) => b.student_id).filter(Boolean)));
        // فلترة: فقط الطلاب الذين لديهم اشتراك نشط
        if (ids.length > 0) {
          const { data: activeSubs } = await supabase
            .from("user_subscriptions")
            .select("user_id")
            .in("user_id", ids)
            .eq("is_active", true)
            .gt("remaining_minutes", 0)
            .gte("ends_at", new Date().toISOString());
          const activeIds = new Set((activeSubs || []).map((s: any) => s.user_id));
          ids = ids.filter(id => activeIds.has(id));
        }
        if (ids.length > 0) {
          await Promise.all([
            supabase.from("notifications").insert(
              ids.map(uid => ({ user_id: uid, title: "📝 واجب جديد", body: `واجب جديد: ${title}`, type: "assignment", link }))
            ),
            ...ids.map(uid => sendChatToStudent(uid)),
          ]);
        }
      }
    } catch (e) { console.warn("notif failed", e); }

    toast.success("تم إنشاء الواجب وإرسال إشعار للطالب");
    setOpen(false);
    setTitle(""); setDescription(""); setStudentId(""); setSubjectId(""); setStage(""); setDueDate(""); setQuestions([]); setAttachments([]);
    fetchAll();
  };

  const saveQuestion = async () => {
    if (!user || !qText.trim()) { toast.error("نص السؤال مطلوب"); return; }
    const opts = qType === "multiple_choice" ? qOptions.split("\n").filter(Boolean) : [];
    const { error } = await supabase.from("question_bank" as any).insert({
      teacher_id: user.id,
      question_text: qText,
      question_type: qType,
      options: opts,
      correct_answer: qCorrect,
      explanation: qExplanation,
      teaching_stage: qStage || null,
      subject_id: qSubject || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ السؤال");
    setQOpen(false);
    setQText(""); setQOptions(""); setQCorrect(""); setQExplanation("");
    fetchAll();
  };

  const deleteQ = async (id: string) => {
    await supabase.from("question_bank" as any).delete().eq("id", id);
    toast.success("تم الحذف");
    fetchAll();
  };

  const extractFromFile = async (file: File) => {
    if (!user) return;
    setExtracting(true);
    try {
      const path = `${user.id}/bank-imports/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("assignment-files").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("assignment-files").createSignedUrl(path, 60 * 60);
      if (!signed?.signedUrl) throw new Error("تعذر إنشاء رابط الملف");

      toast.info("جاري استخراج الأسئلة بـ AI...");
      const { data, error } = await supabase.functions.invoke("extract-questions-from-file", {
        body: {
          file_url: signed.signedUrl,
          file_type: file.type,
          subject_id: qSubject || null,
          teaching_stage: qStage || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const count = (data as any)?.count || 0;
      if (count === 0) {
        toast.warning("لم يتم العثور على أسئلة في الملف");
      } else {
        toast.success(`تم استخراج ${count} سؤال وإضافتها للبنك`);
      }
      fetchAll();
    } catch (e: any) {
      toast.error("خطأ: " + (e.message || "تعذر استخراج الأسئلة"));
    } finally {
      setExtracting(false);
    }
  };

  const reviewSubmission = (id: string) => {
    navigate(`/teacher/assignments/review/${id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black">الواجبات والاختبارات</h1>
            <p className="text-sm text-muted-foreground mt-1">أنشئ واجبات وراجع حلول الطلاب</p>
          </div>
        </div>

        <Tabs defaultValue="assignments" className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full md:w-auto">
            <TabsTrigger value="assignments"><FileText className="h-4 w-4 ml-1" /> الواجبات</TabsTrigger>
            <TabsTrigger value="submissions">الحلول الواردة {submissions.length > 0 && <Badge className="mr-1">{submissions.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="bank"><Library className="h-4 w-4 ml-1" /> بنك الأسئلة</TabsTrigger>
          </TabsList>

          {/* Assignments */}
          <TabsContent value="assignments" className="space-y-4">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> إنشاء واجب جديد</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>واجب جديد</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>العنوان *</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثل: مراجعة الدرس الأول" />
                  </div>
                  <div>
                    <Label>الوصف</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>الطالب</Label>
                      <Select value={studentId || "__all__"} onValueChange={(v) => setStudentId(v === "__all__" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="عام لجميع الطلاب" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">📢 عام — لجميع الطلاب</SelectItem>
                          {students.map(s => <SelectItem key={s.id} value={s.id}>👤 {s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {students.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">لا يوجد طلاب لديك حجوزات معهم بعد</p>
                      )}
                    </div>
                    <div>
                      <Label>المادة</Label>
                      <Select value={subjectId} onValueChange={setSubjectId}>
                        <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>
                          {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>المرحلة</Label>
                      <Input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="ابتدائي / متوسط / ثانوي" />
                    </div>
                    <div>
                      <Label>تاريخ التسليم</Label>
                      <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                  </div>

                  {/* Attachments */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-base">مرفقات الواجب (PDF / صور)</Label>
                      <Button size="sm" variant="outline" asChild disabled={uploadingFile}>
                        <label className="cursor-pointer">
                          {uploadingFile ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Plus className="h-3 w-3 ml-1" />}
                          إضافة ملف
                          <input
                            type="file"
                            multiple
                            accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                        </label>
                      </Button>
                    </div>
                    {attachments.length > 0 ? (
                      <div className="space-y-2">
                        {attachments.map((f, i) => (
                          <div key={i} className="flex items-center justify-between bg-muted/40 rounded-lg p-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-4 w-4 text-secondary shrink-0" />
                              <span className="text-sm truncate">{f.name}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {f.type.includes("pdf") ? "PDF" : "صورة"}
                              </Badge>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => removeAttachment(i)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">PDF أو JPG/PNG — حتى 10MB لكل ملف</p>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-base">الأسئلة</Label>
                      <Button size="sm" variant="outline" onClick={addQuestion}><Plus className="h-3 w-3 ml-1" /> سؤال</Button>
                    </div>
                    {questions.length > 0 && (
                      <div className="space-y-3">
                        {questions.map((q, idx) => (
                          <Card key={q.id} className="p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span className="text-xs font-bold">سؤال {idx + 1}</span>
                              <Button size="icon" variant="ghost" onClick={() => removeQ(q.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                            <Textarea value={q.text} onChange={(e) => updateQ(q.id, { text: e.target.value })} placeholder="نص السؤال" rows={2} className="mb-2" />
                            <div className="grid grid-cols-2 gap-2">
                              <Select value={q.type} onValueChange={(v: any) => updateQ(q.id, { type: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">نص حر</SelectItem>
                                  <SelectItem value="multiple_choice">اختيار من متعدد</SelectItem>
                                  <SelectItem value="true_false">صح/خطأ</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input type="number" value={q.points} onChange={(e) => updateQ(q.id, { points: Number(e.target.value) })} placeholder="الدرجة" />
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button onClick={saveAssignment} disabled={saving} className="w-full">
                    {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                    حفظ ونشر
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid gap-3">
              {assignments.length === 0 && (
                <Card className="p-8 text-center text-muted-foreground">لا توجد واجبات بعد</Card>
              )}
              {assignments.map(a => (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold">{a.title}</h3>
                        {a.description && <p className="text-sm text-muted-foreground mt-1">{a.description}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="secondary">{a.questions?.length || 0} أسئلة</Badge>
                          <Badge variant="outline">{a.total_points} درجة</Badge>
                          {a.teaching_stage && <Badge variant="outline">{a.teaching_stage}</Badge>}
                          {a.student_id ? (
                            <Badge className="bg-secondary/15 text-secondary border-secondary/30">
                              👤 {students.find(s => s.id === a.student_id)?.name || "طالب محدد"}
                            </Badge>
                          ) : (
                            <Badge className="bg-primary/10 text-primary border-primary/30">📢 عام</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Submissions */}
          <TabsContent value="submissions" className="space-y-3">
            {submissions.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">لا توجد حلول واردة</Card>
            )}
            {submissions.map(s => (
              <Card key={s.id} className="cursor-pointer hover:shadow-md transition" onClick={() => reviewSubmission(s.id)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold">{s.assignment?.title}</h4>
                    <p className="text-sm text-muted-foreground">{s.profiles?.full_name || "طالب"} • {new Date(s.submitted_at).toLocaleDateString("ar")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.ai_score != null && <Badge variant="secondary"><Sparkles className="h-3 w-3 ml-1" /> AI: {s.ai_score}</Badge>}
                    {s.final_score != null ? (
                      <Badge>{s.final_score} درجة</Badge>
                    ) : (
                      <Badge variant="outline">قيد المراجعة</Badge>
                    )}
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Question bank */}
          <TabsContent value="bank" className="space-y-3">
            {/* استيراد أسئلة من ملف */}
            <Card className="border-dashed border-2 border-secondary/40 bg-secondary/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-secondary shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-bold text-sm">استيراد أسئلة من ملف بالذكاء الاصطناعي</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      ارفع ملف PDF / Word / صورة وسيقوم AI باستخراج الأسئلة وتنسيقها وإضافتها للبنك تلقائياً.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        disabled={extracting}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) extractFromFile(f);
                          e.target.value = "";
                        }}
                        className="max-w-xs"
                      />
                      {extracting && (
                        <span className="flex items-center gap-2 text-xs text-secondary">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          جارٍ الاستخراج...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Dialog open={qOpen} onOpenChange={setQOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة سؤال</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>سؤال جديد</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>نص السؤال *</Label>
                    <Textarea value={qText} onChange={(e) => setQText(e.target.value)} rows={2} />
                  </div>
                  <div>
                    <Label>النوع</Label>
                    <Select value={qType} onValueChange={(v: any) => setQType(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">نص حر</SelectItem>
                        <SelectItem value="multiple_choice">اختيار من متعدد</SelectItem>
                        <SelectItem value="true_false">صح/خطأ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {qType === "multiple_choice" && (
                    <div>
                      <Label>الخيارات (سطر لكل خيار)</Label>
                      <Textarea value={qOptions} onChange={(e) => setQOptions(e.target.value)} rows={3} />
                    </div>
                  )}
                  <div>
                    <Label>الإجابة الصحيحة</Label>
                    <Input value={qCorrect} onChange={(e) => setQCorrect(e.target.value)} />
                  </div>
                  <div>
                    <Label>شرح الإجابة</Label>
                    <Textarea value={qExplanation} onChange={(e) => setQExplanation(e.target.value)} rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={qStage} onChange={(e) => setQStage(e.target.value)} placeholder="المرحلة" />
                    <Select value={qSubject} onValueChange={setQSubject}>
                      <SelectTrigger><SelectValue placeholder="المادة" /></SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={saveQuestion} className="w-full">حفظ</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid gap-2">
              {bank.length === 0 && <Card className="p-8 text-center text-muted-foreground">بنك الأسئلة فارغ</Card>}
              {bank.map(q => (
                <Card key={q.id}>
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{q.question_text}</p>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px]">{q.question_type}</Badge>
                        {q.teaching_stage && <Badge variant="outline" className="text-[10px]">{q.teaching_stage}</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{q.points} درجة</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => importFromBank(q)}>إضافة لواجب</Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteQ(q.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <BottomNav />
    </div>
  );
};

export default TeacherAssignments;
