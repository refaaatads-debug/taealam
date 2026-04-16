import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserCheck, Phone, GraduationCap, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const STAGES = [
  { value: "kindergarten", label: "رياض الأطفال" },
  { value: "primary", label: "ابتدائي" },
  { value: "middle", label: "متوسط / إعدادي" },
  { value: "high_school", label: "ثانوي" },
  { value: "university", label: "جامعي" },
];

const profileSchema = z.object({
  full_name: z.string().trim().min(2, { message: "الاسم يجب أن يكون حرفين على الأقل" }).max(100, { message: "الاسم طويل جداً" }),
  phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/, { message: "رقم الهاتف غير صالح (8-15 رقم، يبدأ اختيارياً بـ +)" }),
  teaching_stage: z.string().min(1, { message: "اختر المرحلة الدراسية" }),
});

const CompleteProfile = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/student";
  const { user, profile, loading: authLoading, roles } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    // Pre-fill from existing profile
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
    }
    // Fetch stage if exists
    supabase.from("profiles").select("teaching_stage, full_name, phone").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        if (data.full_name) setFullName(data.full_name);
        if (data.phone) setPhone(data.phone);
        if ((data as any).teaching_stage) setStage((data as any).teaching_stage);
        // If already complete, redirect away
        if (data.full_name && data.phone && (data as any).teaching_stage) {
          navigate(redirect, { replace: true });
        }
      }
    });
  }, [user, profile, authLoading, navigate, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = profileSchema.safeParse({ full_name: fullName, phone, teaching_stage: stage });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        phone: parsed.data.phone,
        teaching_stage: parsed.data.teaching_stage,
      } as any)
      .eq("user_id", user.id);

    setSaving(false);

    if (error) {
      toast.error("خطأ في الحفظ: " + error.message);
      return;
    }

    toast.success("تم استكمال بياناتك بنجاح! 🎉");
    // Force a small delay for the AuthContext to refetch
    setTimeout(() => navigate(redirect, { replace: true }), 300);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <UserCheck className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">استكمال البيانات</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            نحتاج بعض المعلومات لإكمال حسابك قبل البدء في التعلم
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name" className="flex items-center gap-1.5 text-sm">
                <User className="h-3.5 w-3.5" />
                الاسم الكامل <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: أحمد محمد"
                className="rounded-lg"
                maxLength={100}
              />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone" className="flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5" />
                رقم الهاتف <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966500000000"
                className="rounded-lg"
                dir="ltr"
                maxLength={20}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <GraduationCap className="h-3.5 w-3.5" />
                المرحلة الدراسية <span className="text-destructive">*</span>
              </Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="اختر مرحلتك الدراسية" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.teaching_stage && <p className="text-xs text-destructive">{errors.teaching_stage}</p>}
            </div>

            <Button type="submit" disabled={saving} className="w-full rounded-lg gap-2 mt-6">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              استكمال البيانات والمتابعة
            </Button>

            <p className="text-[11px] text-muted-foreground text-center mt-2">
              يمكنك تعديل هذه البيانات لاحقاً من صفحة الملف الشخصي
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompleteProfile;
