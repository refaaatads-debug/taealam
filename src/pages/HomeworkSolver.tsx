import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Upload, Sparkles, ArrowRight, Loader2, X, BookOpen, Lightbulb, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Step { title: string; explanation: string }
interface Solution {
  subject?: string;
  question?: string;
  steps?: Step[];
  rule?: string;
  final_answer?: string;
  tip?: string;
  error?: string;
}

const HomeworkSolver = () => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [imageBase64, setImageBase64] = useState<string>("");
  const [extraQuestion, setExtraQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [tierBlocked, setTierBlocked] = useState<{ msg: string; code: string } | null>(null);

  const handleFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("حجم الصورة كبير. الحد الأقصى 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageBase64(reader.result as string);
      setSolution(null);
    };
    reader.readAsDataURL(file);
  };

  const solve = async () => {
    if (!imageBase64) { toast.error("الرجاء رفع صورة الواجب أولاً"); return; }
    setLoading(true);
    setSolution(null);
    setTierBlocked(null);
    try {
      const { data, error } = await supabase.functions.invoke("solve-homework", {
        body: { imageBase64, extraQuestion },
      });
      // Tier/subscription block (403 from edge function)
      const reasonCode = (data as any)?.reason_code;
      if (reasonCode && (data as any)?.error) {
        setTierBlocked({ msg: (data as any).error, code: reasonCode });
        toast.error((data as any).error);
        return;
      }
      if (error) throw error;
      if (data?.error && !data?.final_answer) {
        toast.error(data.error);
        setSolution(data);
      } else {
        setSolution(data);
      }
    } catch (e: any) {
      toast.error(e?.message || "تعذر حل الواجب. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImageBase64("");
    setExtraQuestion("");
    setSolution(null);
  };

  return (
    <div className="min-h-screen bg-background pb-32" dir="rtl">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-secondary mb-3 shadow-lg">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">مساعد الواجبات البصري</h1>
          <p className="text-sm text-muted-foreground mt-1">صوّر واجبك (حتى بخط اليد) واحصل على الحل خطوة بخطوة</p>
        </div>

        {/* Image upload */}
        {!imageBase64 ? (
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                size="lg"
                variant="outline"
                className="h-32 flex-col gap-2 rounded-2xl border-dashed"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="h-8 w-8 text-primary" />
                <span className="font-bold">التقط صورة</span>
                <span className="text-xs text-muted-foreground">من الكاميرا مباشرة</span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-32 flex-col gap-2 rounded-2xl border-dashed"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-primary" />
                <span className="font-bold">ارفع صورة</span>
                <span className="text-xs text-muted-foreground">من معرض الجهاز</span>
              </Button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <img src={imageBase64} alt="الواجب" className="w-full max-h-80 object-contain rounded-xl bg-muted" />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 left-2 h-8 w-8 rounded-full"
                  onClick={reset}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                placeholder="(اختياري) أضف ملاحظة أو سؤالاً محدداً عن الصورة..."
                value={extraQuestion}
                onChange={(e) => setExtraQuestion(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button onClick={solve} disabled={loading} size="lg" className="flex-1 gap-2 rounded-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "جاري الحل..." : "احصل على الحل"}
                </Button>
                {solution && (
                  <Button onClick={solve} disabled={loading} variant="outline" size="lg" className="rounded-full gap-2">
                    <RefreshCw className="h-4 w-4" /> أعد الحل
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Solution */}
        {solution && !solution.error && (
          <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
            {solution.subject && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-bold">
                <BookOpen className="h-4 w-4" /> {solution.subject}
              </div>
            )}

            {solution.question && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">السؤال:</p>
                  <p className="font-bold leading-relaxed">{solution.question}</p>
                </CardContent>
              </Card>
            )}

            {solution.steps && solution.steps.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <h2 className="font-black text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" /> خطوات الحل
                  </h2>
                  {solution.steps.map((step, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-sm">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm">{step.title}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-1 whitespace-pre-wrap">{step.explanation}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {solution.rule && (
              <Card className="border-secondary/30 bg-secondary/5">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-secondary mb-1">📐 القاعدة المستخدمة</p>
                  <p className="text-sm leading-relaxed">{solution.rule}</p>
                </CardContent>
              </Card>
            )}

            {solution.final_answer && (
              <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-secondary/5">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-primary mb-2 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> الإجابة النهائية
                  </p>
                  <p className="text-lg font-black leading-relaxed whitespace-pre-wrap">{solution.final_answer}</p>
                </CardContent>
              </Card>
            )}

            {solution.tip && (
              <Card className="border-accent/30 bg-accent/5">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-accent-foreground mb-1 flex items-center gap-1">
                    <Lightbulb className="h-4 w-4" /> نصيحة للمذاكرة
                  </p>
                  <p className="text-sm leading-relaxed">{solution.tip}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {solution?.error && (
          <Card className="mt-6 border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-center">
              <p className="text-sm font-bold text-destructive">{solution.error}</p>
              <p className="text-xs text-muted-foreground mt-1">جرّب صورة أوضح أو أضف ملاحظة توضيحية.</p>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          💡 الذكاء الاصطناعي للمساعدة في الفهم — حاول الحل بنفسك أولاً!
        </p>
      </main>
      <BottomNav />
    </div>
  );
};

export default HomeworkSolver;
