import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Mail, Phone, Eye, EyeOff, ArrowRight, User, BookOpen, Users as UsersIcon, ShieldCheck, Sparkles, Star, CheckCircle2 } from "lucide-react";
import brandLogo from "@/assets/logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getAuthErrorMessage, withAuthTimeout } from "@/lib/auth-timeout";
import { toast } from "sonner";
import loginHero from "@/assets/login-hero.jpg";

type Role = "student" | "teacher";

const roles: { id: Role; label: string; icon: typeof User; desc: string }[] = [
  { id: "student", label: "طالب", icon: User, desc: "أبحث عن مدرس" },
  { id: "teacher", label: "معلم", icon: BookOpen, desc: "أريد التدريس" },
];

const Login = () => {
  const { user, roles: userRoles, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const initialRole: Role = searchParams.get("role") === "teacher" ? "teacher" : "student";
  const initialIsLogin = searchParams.get("signup") !== "1" && searchParams.get("role") !== "teacher";
  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();

  // Role application after OAuth is handled in AuthContext

  const goToDashboard = (userRole?: string) => {
    // Honor explicit ?redirect= param (e.g. deep-link from "احجز الآن")
    const redirectTo = searchParams.get("redirect");
    if (redirectTo && redirectTo.startsWith("/")) {
      window.location.replace(redirectTo);
      return;
    }
    let path = "/student";
    if (userRole === "admin") path = "/admin";
    else if (userRole === "teacher") path = "/teacher";
    else if (userRole === "parent") path = "/parent";
    // Full reload to ensure no other page renders in background
    window.location.replace(path);
  };

  // Auto-redirect if already logged in
  useEffect(() => {
    if (authLoading || !user) return;
    if (localStorage.getItem("pending_role")) return;
    // If roles loaded → use highest privilege; else fall back to student after short wait
    if (userRoles.length > 0) {
      const r = userRoles.includes("admin") ? "admin"
        : userRoles.includes("teacher") ? "teacher"
        : userRoles.includes("parent") ? "parent"
        : "student";
      goToDashboard(r);
      return;
    }
    // No roles yet — wait briefly then default to student
    const t = setTimeout(() => goToDashboard("student"), 1500);
    return () => clearTimeout(t);
  }, [user, userRoles, authLoading]);

  // Pick the highest-privileged role among all user_roles rows
  const pickPrimaryRole = async (userId: string): Promise<string | undefined> => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = (data || []).map((r: any) => r.role);
    if (list.includes("admin")) return "admin";
    if (list.includes("teacher")) return "teacher";
    if (list.includes("parent")) return "parent";
    if (list.includes("student")) return "student";
    return list[0];
  };

  const redirectByRole = (userRole?: string) => goToDashboard(userRole);

  const handleEmailAuth = async () => {
    setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
        if (error) throw error;

        toast.success("تم تسجيل الدخول بنجاح!");
        // Fetch role with timeout fallback to prevent hanging
        try {
          const primaryRole = await Promise.race([
            pickPrimaryRole(data.user.id),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000)),
          ]);
          redirectByRole(primaryRole);
        } catch {
          redirectByRole();
        }
      } else {
        if (!fullName.trim()) { toast.error("الرجاء إدخال الاسم الكامل"); setLoading(false); return; }
        if (password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); setLoading(false); return; }

        const { data, error } = await withAuthTimeout(supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role },
            emailRedirectTo: window.location.origin,
          },
        }));
        if (error) throw error;

        // Role is assigned automatically by DB trigger from metadata
        if (role === "teacher") {
          toast.success("تم إنشاء حسابك كمعلم! سيتم مراجعته والموافقة عليه قريباً", { duration: 6000 });
        } else {
          toast.success("تم إنشاء الحساب! تحقق من بريدك الإلكتروني");
        }
      }
    } catch (e) {
      toast.error(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneAuth = async () => {
    setLoading(true);
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+966${phone.replace(/^0/, "")}`;
      if (!otpSent) {
        const { error } = await withAuthTimeout(supabase.auth.signInWithOtp({ phone: formattedPhone }));
        if (error) throw error;
        setOtpSent(true);
        toast.success("تم إرسال رمز التحقق!");
      } else {
        const { data, error } = await withAuthTimeout(supabase.auth.verifyOtp({ phone: formattedPhone, token: otp, type: "sms" }));
        if (error) throw error;
        toast.success("تم التحقق بنجاح!");
        if (data.user) {
          const primaryRole = await pickPrimaryRole(data.user.id);
          redirectByRole(primaryRole);
        }
      }
    } catch (e) {
      toast.error(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "apple") => {
    setLoading(true);
    try {
      // Save selected role before OAuth redirect (for new users)
      if (!isLogin) {
        localStorage.setItem("pending_role", role);
      }
      const result = await withAuthTimeout(lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      }));
      if (result.error) throw result.error;
    } catch (e) {
      toast.error(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === "email") handleEmailAuth();
    else handlePhoneAuth();
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background relative overflow-hidden">
      {/* Left: Hero panel (desktop only) */}
      <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden gradient-hero">
        <img
          src={loginHero}
          alt="طالب سعودي يتعلم عبر منصة أجيال المعرفة"
          width={1024}
          height={1536}
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/80 via-primary/50 to-secondary/40" />
        <div className="absolute top-16 left-16 w-72 h-72 rounded-full bg-secondary/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-16 right-16 w-96 h-96 rounded-full bg-primary-foreground/10 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-primary-foreground w-full">
          <Link to="/" className="flex items-center gap-3 group w-fit">
            <div className="w-20 h-20 rounded-2xl bg-primary-foreground/15 backdrop-blur-md border border-primary-foreground/20 flex items-center justify-center group-hover:scale-110 transition-transform p-1.5">
              <img src={brandLogo} alt="logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="font-extrabold text-2xl block leading-none">منصة أجيال المعرفة</span>
              <span className="text-xs text-primary-foreground/70">Ajyal Al-Maarefa</span>
            </div>
          </Link>

          <div className="space-y-6 max-w-lg">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-foreground/15 backdrop-blur-md border border-primary-foreground/20 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                المنصة الأولى للتعليم الذكي
              </span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-4xl xl:text-5xl font-black leading-tight">
              ابدأ رحلتك التعليمية<br />
              <span className="text-secondary-foreground/95">مع نخبة المعلمين</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-lg text-primary-foreground/85 leading-relaxed">
              حصص مباشرة، مدرس ذكي بالذكاء الاصطناعي، وجدولة مرنة — كل ما تحتاجه للتفوق في مكان واحد.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="grid gap-3 pt-4">
              {["أكثر من 10,000 طالب نشط", "معلمون معتمدون ومراجعون يدوياً", "حصص مسجّلة وتقارير تفصيلية"].map((f) => (
                <div key={f} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-secondary-foreground shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-4 w-4 fill-current text-amber-300" />
              ))}
            </div>
            <p className="text-xs text-primary-foreground/80">تقييم 4.9 من آلاف الطلاب</p>
          </motion.div>
        </div>
      </aside>

      {/* Right: Form panel */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative">
        <div className="lg:hidden absolute inset-0 gradient-hero opacity-90" />
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md relative z-10">
        <Card className="border-0 shadow-card-hover overflow-hidden glass-strong lg:bg-card lg:backdrop-blur-none">
          <CardContent className="p-0">
            <div className="p-6 sm:p-8 pb-4 sm:pb-6">
              <Link to="/" className="flex lg:hidden items-center justify-center gap-2.5 mb-6">
                <img src={brandLogo} alt="logo" className="w-14 h-14 object-contain" />
                <span className="font-extrabold text-2xl text-foreground">منصة أجيال المعرفة</span>
              </Link>
              <h2 className="text-2xl sm:text-3xl font-black text-center text-foreground mb-1">
                {isLogin ? "مرحباً بعودتك! 👋" : "انضم إلينا اليوم"}
              </h2>
              <p className="text-center text-muted-foreground text-sm">
                {isLogin ? "سجّل دخولك للمتابعة في رحلتك" : "أكثر من 10,000 طالب يثقون بنا"}
              </p>
            </div>

            <div className="px-6 sm:px-8 pb-6 sm:pb-8">
              <AnimatePresence>
                {!isLogin && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">أنا...</p>
                    <div className="grid grid-cols-2 gap-2">
                      {roles.map((r) => (
                        <button key={r.id} onClick={() => setRole(r.id)}
                          className={`p-3 rounded-xl text-center transition-all duration-200 border-2 ${role === r.id ? "border-secondary bg-accent shadow-sm" : "border-border hover:border-secondary/30 bg-muted/30"}`}>
                          <r.icon className={`h-5 w-5 mx-auto mb-1.5 ${role === r.id ? "text-secondary" : "text-muted-foreground"}`} />
                          <p className={`text-xs font-bold ${role === r.id ? "text-secondary" : "text-foreground"}`}>{r.label}</p>
                          <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                        </button>
                      ))}
                    </div>
                    {role === "teacher" && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                        <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">حساب المعلم يحتاج موافقة الإدارة قبل التفعيل</p>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Social Login */}
              <div className="flex gap-3 mb-5">
                <Button variant="outline" className="flex-1 gap-2 h-11 rounded-xl" onClick={() => handleSocialLogin("google")} disabled={loading}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google
                </Button>
                <Button variant="outline" className="flex-1 gap-2 h-11 rounded-xl" onClick={() => handleSocialLogin("apple")} disabled={loading}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  Apple
                </Button>
              </div>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">أو</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Method Toggle */}
              <div className="flex bg-muted rounded-xl p-1 mb-5">
                {([
                  { key: "email" as const, icon: Mail, label: "البريد الإلكتروني" },
                  { key: "phone" as const, icon: Phone, label: "رقم الجوال" },
                ] as const).map((m) => (
                  <button key={m.key} onClick={() => { setMethod(m.key); setOtpSent(false); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${method === m.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>

              <form className="space-y-3.5" onSubmit={handleSubmit}>
                {!isLogin && method === "email" && (
                  <Input placeholder="الاسم الكامل" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 text-right rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required />
                )}
                {method === "email" ? (
                  <Input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-right rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required />
                ) : (
                  <Input type="tel" placeholder="966 5X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12 text-right rounded-xl bg-muted/30 border-border/50 focus:border-secondary" dir="ltr" required />
                )}

                {method === "email" && (
                  <div className="relative">
                    <Input type={showPass ? "text" : "password"} placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)}
                      className="h-12 text-right pl-12 rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required minLength={6} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}

                {method === "phone" && otpSent && (
                  <Input type="text" placeholder="رمز التحقق" value={otp} onChange={(e) => setOtp(e.target.value)} className="h-12 text-center rounded-xl bg-muted/30 border-border/50 focus:border-secondary tracking-[0.5em] text-lg" dir="ltr" maxLength={6} />
                )}

                {isLogin && method === "email" && (
                  <Link to="/forgot-password" className="text-sm text-secondary text-left block cursor-pointer hover:underline font-medium">نسيت كلمة المرور؟</Link>
                )}

                <Button type="submit" disabled={loading} className="w-full h-12 gradient-cta shadow-button text-secondary-foreground text-base rounded-xl font-bold">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-secondary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      {method === "phone" && otpSent ? "تحقق" : isLogin ? "تسجيل الدخول" : "إنشاء حساب"}
                      <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                {isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
                <button onClick={() => setIsLogin(!isLogin)} className="text-secondary font-bold hover:underline">
                  {isLogin ? "إنشاء حساب" : "تسجيل الدخول"}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      </main>
    </div>
  );
};

export default Login;
