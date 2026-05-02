import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const ReviewSubmission = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<any>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch();
  }, [id]);

  const fetch = async () => {
    setLoading(true);
    const { data: subData, error } = await supabase
      .from("assignment_submissions" as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !subData) {
      toast.error("تعذر تحميل الحل");
      setLoading(false);
      return;
    }
    const s: any = subData;
    const [{ data: aData }, { data: pData }] = await Promise.all([
      supabase.from("assignments" as any).select("*").eq("id", s.assignment_id).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("user_id", s.student_id).maybeSingle(),
    ]);
    setSub({ ...s, assignment: aData || null, profiles: pData || null });
    if (s.teacher_score != null) setScore(String(s.teacher_score));
    if (s.teacher_feedback) setFeedback(s.teacher_feedback);
    setLoading(false);
  };

  const runAIGrade = async () => {
    setGrading(true);
    const { data, error } = await supabase.functions.invoke("grade-assignment", {
      body: { submission_id: id },
    });
    setGrading(false);
    if (error) { toast.error("خطأ: " + error.message); return; }
    if ((data as any)?.error) { toast.error((data as any).error); return; }
    toast.success("تم التصحيح بـ AI");
    fetch();
  };

  const saveFinal = async () => {
    if (!score) { toast.error("أدخل الدرجة"); return; }
    setSaving(true);
    const { error } = await supabase.from("assignment_submissions" as any).update({
      teacher_score: Number(score),
      teacher_feedback: feedback,
      final_score: Number(score),
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }

    // Notify student
    if (sub?.student_id) {
      await supabase.from("notifications").insert({
        user_id: sub.student_id,
        title: "تم تصحيح واجبك",
        body: `تم تصحيح "${sub.assignment?.title}" - حصلت على ${score} من ${sub.assignment?.total_points}`,
        type: "assignment",
        link: `/student/assignments`,
      });
    }
    toast.success("تم حفظ التصحيح");
    navigate("/teacher/assignments");
  };

  const sendAIGradeToStudent = async () => {
    if (sub?.ai_score == null) return;
    setSaving(true);
    const aiScore = Number(sub.ai_score);
    const aiFb = sub.ai_feedback || "";
    const { error } = await supabase.from("assignment_submissions" as any).update({
      teacher_score: aiScore,
      teacher_feedback: aiFb,
      final_score: aiScore,
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { setSaving(false); toast.error(error.message); return; }

    if (sub?.student_id) {
      await supabase.from("notifications").insert({
        user_id: sub.student_id,
        title: "تم تصحيح واجبك",
        body: `تم تصحيح "${sub.assignment?.title}" - حصلت على ${aiScore} من ${sub.assignment?.total_points}`,
        type: "assignment",
        link: `/student/assignments`,
      });
    }
    setSaving(false);
    toast.success("تم اعتماد درجة AI وإرسالها للطالب");
    navigate("/teacher/assignments");
  };

  if (loading || !sub) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const a = sub.assignment;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <Button variant="ghost" onClick={() => navigate("/teacher/assignments")} className="mb-4 gap-2">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Button>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{a?.title}</CardTitle>
            <p className="text-sm text-muted-foreground">من: {sub.profiles?.full_name}</p>
          </CardHeader>
          <CardContent>
            {a?.description && <p className="text-sm mb-3">{a.description}</p>}
            <div className="flex gap-2">
              <Badge>{a?.total_points} درجة كلية</Badge>
              <Badge variant="outline">{(a?.questions || []).length} أسئلة</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">إجابة الطالب</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {sub.text_answer && (
              <div>
                <Label className="text-xs">النص</Label>
                <div className="mt-1 p-3 bg-muted/50 rounded-lg whitespace-pre-wrap text-sm">{sub.text_answer}</div>
              </div>
            )}
            {(sub.image_urls || []).length > 0 && (
              <div>
                <Label className="text-xs">الصور</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                  {(sub.image_urls as string[]).map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="" className="rounded-lg w-full h-32 object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {sub.audio_url && (
              <div>
                <Label className="text-xs">التسجيل الصوتي</Label>
                <audio src={sub.audio_url} controls className="w-full mt-1" />
              </div>
            )}
            {(sub.answers || []).length > 0 && (
              <div>
                <Label className="text-xs">إجابات الأسئلة</Label>
                <div className="space-y-2 mt-1">
                  {(sub.answers as any[]).map((ans, i) => (
                    <div key={i} className="p-2 border rounded text-sm">
                      <p className="font-semibold text-xs text-muted-foreground">{a?.questions?.[i]?.text}</p>
                      <p className="mt-1">{ans}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {sub.ai_score != null && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> تقييم AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge className="text-base">الدرجة المقترحة: {sub.ai_score} / {a?.total_points}</Badge>
              {sub.ai_feedback && <p className="text-sm whitespace-pre-wrap">{sub.ai_feedback}</p>}
              {(sub.ai_breakdown || []).length > 0 && (
                <div className="space-y-1 mt-2">
                  {(sub.ai_breakdown as any[]).map((b, i) => (
                    <div key={i} className="text-xs p-2 border rounded">
                      <p className="font-semibold">{b.question}</p>
                      <p className="text-muted-foreground">{b.comment}</p>
                      <Badge variant="outline" className="mt-1 text-[10px]">{b.points} درجة</Badge>
                    </div>
                  ))}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={sendAIGradeToStudent} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                استخدام درجة AI وإرسالها للطالب
              </Button>
            </CardContent>
          </Card>
        )}

        {sub.ai_score == null && (
          <Button onClick={runAIGrade} disabled={grading} variant="secondary" className="mb-4 gap-2">
            {grading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            تصحيح تلقائي بـ AI
          </Button>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">تصحيح المعلم النهائي</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>الدرجة (من {a?.total_points})</Label>
              <Input type="number" value={score} onChange={(e) => setScore(e.target.value)} max={a?.total_points} />
            </div>
            <div>
              <Label>ملاحظات للطالب</Label>
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} />
            </div>
            <Button onClick={saveFinal} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              حفظ التصحيح وإرسال للطالب
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ReviewSubmission;
