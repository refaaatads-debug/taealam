import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import brandLogo from "@/assets/logo.png";
import { BRAND_NAME } from "@/lib/brand";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import { saveRecoveryPassword, verifyPasswordRecovery, type VerifiedPasswordRecovery } from "@/lib/passwordRecovery";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [recovery, setRecovery] = useState<VerifiedPasswordRecovery | null>(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const recoveryRequest = useRef<Promise<VerifiedPasswordRecovery> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    recoveryRequest.current ??= verifyPasswordRecovery(supabase.auth, window.location.href, () => {
      window.history.replaceState(window.history.state, "", "/reset-password");
    });
    recoveryRequest.current.then((verified) => {
      if (active) setRecovery(verified);
    }).catch((error: unknown) => {
      if (active) setRecoveryError(error instanceof Error ? error.message : "تعذر التحقق من رابط الاستعادة");
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recovery || !accountConfirmed) {
      toast.error("تحقق من الحساب الظاهر وأكّد أنه الحساب المطلوب أولًا");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    if (password.length < 8) {
      toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    setLoading(true);
    try {
      const recoveryClient = createClient(
        import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        { auth: { storageKey: "ajyal-password-recovery-isolated", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      );
      await saveRecoveryPassword(supabase.auth, recoveryClient.auth, recovery, password);
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      toast.success("تم تغيير كلمة المرور بنجاح!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    setLoading(false);
    if (error) {
      toast.error("حُفظت كلمة المرور، لكن تعذر إنهاء جلسة المتصفح. أعد محاولة تسجيل الخروج.");
      return;
    }
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full border border-primary-foreground/20 animate-float" />
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-md relative z-10">
        <Card className="border-0 shadow-card-hover overflow-hidden">
          <CardContent className="p-8">
            <Link to="/" className="flex items-center justify-center gap-2.5 mb-6">
              <img src={brandLogo} alt={BRAND_NAME} className="h-10 w-10 object-contain" />
              <span className="font-extrabold text-2xl text-foreground">{BRAND_NAME}</span>
            </Link>

            {checking ? (
              <p role="status" className="text-center text-muted-foreground py-8">جارٍ التحقق من رابط الاستعادة والحساب...</p>
            ) : success ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-secondary" />
                </div>
                <h2 className="text-xl font-black text-foreground">تم تغيير كلمة المرور!</h2>
                <p dir="ltr" className="text-sm font-bold">{recovery?.email}</p>
                <p className="text-muted-foreground text-sm">سجّل الدخول مجددًا بالبريد وكلمة المرور الجديدة. سينتهي تسجيل الدخول الحالي في هذا المتصفح.</p>
                <Button onClick={() => void goToLogin()} disabled={loading}>تسجيل الدخول بالكلمة الجديدة</Button>
              </motion.div>
            ) : !recovery ? (
              <div className="text-center space-y-4">
                <h2 className="text-xl font-black text-foreground">رابط غير صالح</h2>
                <p className="text-muted-foreground text-sm">{recoveryError}</p>
                <Link to="/forgot-password">
                  <Button variant="outline" className="mt-4 rounded-xl">طلب رابط جديد</Button>
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-black text-center text-foreground mb-1">تعيين كلمة مرور جديدة</h2>
                <p className="text-center text-muted-foreground text-sm mb-6">اختر كلمة مرور قوية لحسابك</p>
                <div className="rounded-xl border border-border bg-muted/30 p-3 mb-4 text-center">
                  <p className="text-xs text-muted-foreground">سيتم تغيير كلمة المرور لهذا الحساب فقط</p>
                  <p dir="ltr" className="font-bold text-sm break-all mt-1">{recovery.email}</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <Input type={showPass ? "text" : "password"} placeholder="كلمة المرور الجديدة" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password" className="h-12 text-right pl-12 rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required minLength={8} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input type={showPass ? "text" : "password"} placeholder="تأكيد كلمة المرور" value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password" className="h-12 text-right rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required minLength={8} />
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={accountConfirmed} onChange={(e) => setAccountConfirmed(e.target.checked)} required className="mt-1" />
                    أؤكد أن البريد الظاهر هو الحساب الذي أريد تغيير كلمة مروره.
                  </label>
                  <Button type="submit" disabled={loading || !accountConfirmed} className="w-full h-12 gradient-cta shadow-button text-secondary-foreground text-base rounded-xl font-bold">
                    {loading ? <div className="w-5 h-5 border-2 border-secondary-foreground border-t-transparent rounded-full animate-spin" /> : "تعيين كلمة المرور"}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
