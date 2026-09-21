import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, Eye, EyeOff, ArrowRight, User, BookOpen, ShieldCheck, Sparkles, Star, CheckCircle2 } from "lucide-react";
import brandLogo from "@/assets/logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getAuthErrorMessage, withAuthTimeout } from "@/lib/auth-timeout";
import { toast } from "sonner";
import loginHero from "@/assets/login-hero.jpg";
import TurnstileWidget from "@/components/auth/TurnstileWidget";

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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const navigate = useNavigate();

  const isInIframe = () => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  };

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
    // Let AuthContext own post-auth redirects to avoid race conditions and wrong fallbacks.
    if (userRoles.length > 0) {
      const r = userRoles.includes("admin") ? "admin"
        : userRoles.includes("teacher") ? "teacher"
        : userRoles.includes("parent") ? "parent"
        : "student";
      goToDashboard(r);
    }
  }, [user, userRoles, authLoading]);

  useEffect(() => {
    const oauthProvider = searchParams.get("oauth");
    if (oauthProvider !== "google" && oauthProvider !== "apple") return;

    const url = new URL(window.location.href);
    url.searchParams.delete("oauth");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);

    void handleSocialLogin(oauthProvider, true);
  }, []);

  // Pick the highest-privileged role among all user_roles rows
  const pickPrimaryRole = async (userId: string): Promise<string | undefined> => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = (data ?? []).map((r) => r.role);
    if (list.includes("admin")) return "admin";
    if (list.includes("teacher")) return "teacher";
    if (list.includes("parent")) return "parent";
    if (list.includes("student")) return "student";
    return list[0];
  };

  const redirectByRole = (userRole?: string) => goToDashboard(userRole);

  const handleEmailAuth = async () => {
    if (!captchaToken) {
      toast.error("يرجى إكمال التحقق الأمني أولاً");
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await withAuthTimeout(supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        }));
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
        if (password.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); setLoading(false); return; }

        const { data, error } = await withAuthTimeout(supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role },
            emailRedirectTo: window.location.origin,
            captchaToken,
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
      setCaptchaToken(null);
      setCaptchaKey((key) => key + 1);
    }
  };

  const handlePhoneAuth = async () => {
    if (!captchaToken) {
      toast.error("يرجى إكمال التحقق الأمني أولاً");
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+966${phone.replace(/^0/, "")}`;
      if (!otpSent) {
        const { error } = await withAuthTimeout(supabase.auth.signInWithOtp({
          phone: formattedPhone,
          options: { captchaToken },
        }));
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
      setCaptchaToken(null);
      setCaptchaKey((key) => key + 1);
    }
  };

  const handleSocialLogin = async (provider: "google" | "apple", skipIframeFallback = false) => {
    setLoading(true);
    try {
      // Save selected role before OAuth redirect (for new users)
      if (!isLogin) {
        localStorage.setItem("pending_role", role);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        toast.error(getAuthErrorMessage(error));
        return;
      }
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
    <div className="min-h-screen bg-[#f7f9f8] text-[#102f50]" dir="rtl">
      <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[#102f50] lg:flex lg:w-[46%]">
        <img
          src={loginHero}
          alt="طالب سعودي يتعلم عبر منصة أجيال المعرفة"
          width={1024}
          height={1536}
          className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#102f50]/95 via-[#102f50]/80 to-[#188779]/80" />
        <div className="absolute -left-16 top-16 h-72 w-72 rounded-full bg-[#188779]/25 blur-3xl" />
        <div className="absolute -bottom-20 right-10 h-96 w-96 rounded-full bg-[#b9e4dc]/10 blur-3xl" />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 text-white xl:p-16">
          <Link to="/" className="group flex w-fit items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 p-2 backdrop-blur-md transition-transform group-hover:scale-105">
              <img src={brandLogo} alt="logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="block text-xl font-black leading-none">منصة أجيال المعرفة</span>
              <span className="mt-1 block text-[10px] font-bold tracking-[0.18em] text-[#b9e4dc]">تعلم بثقة</span>
            </div>
          </Link>

          <div className="max-w-lg space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#b9e4dc]/20 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-[#b9e4dc]" />
                تعلم أقرب إلى هدفك
              </span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-4xl xl:text-5xl font-black leading-tight">
              ابدأ رحلتك التعليمية
              <br />
              <span className="text-[#b9e4dc]">مع مدرسك المناسب</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-base leading-8 text-white/70">
              حصص مباشرة، متابعة واضحة، وجدولة مرنة — كل ما تحتاجه لتتقدم بثقة في مكان واحد.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="grid gap-3 pt-2">
              {["مدرسون معتمدون", "حجز مرن للحصص المباشرة", "دعم مستمر أثناء رحلتك"].map((f) => (
                <div key={f} className="flex items-center gap-3 text-sm text-white/85">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#b9e4dc]" />
                  <span>{f}</span>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-4 w-4 fill-current text-[#e9a536]" />
              ))}
            </div>
            <p className="text-xs text-white/65">تجربة يثق بها الطلاب وأولياء الأمور</p>
          </motion.div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="absolute inset-x-0 top-0 h-36 bg-[#e8f1ef] lg:hidden" />
        <motion.div initial={{ opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative z-10 w-full max-w-md">
        <Card className="overflow-hidden rounded-[2rem] border border-[#102f50]/10 bg-white shadow-2xl shadow-[#102f50]/10">
          <CardContent className="p-0">
            <div className="border-b border-[#102f50]/10 p-6 pb-5 sm:p-8 sm:pb-6">
              <Link to="/" className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
                <img src={brandLogo} alt="logo" className="h-12 w-12 object-contain" />
                <span className="text-xl font-black text-[#102f50]">منصة أجيال المعرفة</span>
              </Link>
              <div className="text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#188779]">أجيال المعرفة</p>
                <h2 className="mt-3 text-2xl font-black text-[#102f50] sm:text-3xl">
                  {isLogin ? "مرحباً بعودتك" : "انضم إلينا اليوم"}
                </h2>
                <p className="mt-2 text-sm text-[#102f50]/55">
                  {isLogin ? "سجّل دخولك للمتابعة في رحلتك" : "ابدأ تجربة تعليمية أوضح وأكثر مرونة"}
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <AnimatePresence>
                {!isLogin && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5">
                    <p className="mb-2 text-xs font-black text-[#102f50]/60">أنا...</p>
                    <div className="grid grid-cols-2 gap-2">
                      {roles.map((r) => (
                        <button key={r.id} onClick={() => setRole(r.id)}
                          className={`rounded-xl border-2 p-3 text-center transition-all duration-200 ${role === r.id ? "border-[#188779] bg-[#e8f1ef] shadow-sm" : "border-[#102f50]/10 bg-[#f7f9f8] hover:border-[#188779]/40"}`}>
                          <r.icon className={`mx-auto mb-1.5 h-5 w-5 ${role === r.id ? "text-[#188779]" : "text-[#102f50]/45"}`} />
                          <p className={`text-xs font-bold ${role === r.id ? "text-[#188779]" : "text-[#102f50]"}`}>{r.label}</p>
                          <p className="text-[10px] text-[#102f50]/50">{r.desc}</p>
                        </button>
                      ))}
                    </div>
                    {role === "teacher" && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-center gap-2 rounded-lg border border-[#e9a536]/30 bg-[#fff7e8] p-2.5">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-[#c98519]" />
                        <p className="text-[11px] text-[#9b6714]">حساب المعلم يحتاج موافقة الإدارة قبل التفعيل</p>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Social Login */}
              <div className="mb-5 flex gap-3">
                <Button variant="outline" className="h-11 flex-1 gap-2 rounded-xl border-[#102f50]/15 bg-white text-[#102f50] hover:bg-[#f7f9f8]" onClick={() => handleSocialLogin("google")} disabled={loading}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google
                </Button>
                <Button variant="outline" className="h-11 flex-1 gap-2 rounded-xl border-[#102f50]/15 bg-white text-[#102f50] hover:bg-[#f7f9f8]" onClick={() => handleSocialLogin("apple")} disabled={loading}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  Apple
                </Button>
              </div>

              <div className="mb-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#102f50]/10" />
                <span className="text-xs text-[#102f50]/45">أو</span>
                <div className="h-px flex-1 bg-[#102f50]/10" />
              </div>

              {/* Method Toggle */}
              <div className="mb-5 flex rounded-xl bg-[#f7f9f8] p-1">
                {([
                  { key: "email" as const, icon: Mail, label: "البريد الإلكتروني" },
                  { key: "phone" as const, icon: Phone, label: "رقم الجوال" },
                ] as const).map((m) => (
                  <button key={m.key} onClick={() => { setMethod(m.key); setOtpSent(false); setCaptchaToken(null); setCaptchaKey((key) => key + 1); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all duration-200 ${method === m.key ? "bg-white text-[#188779] shadow-sm" : "text-[#102f50]/50 hover:text-[#102f50]"}`}>
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>

              <form className="space-y-3.5" onSubmit={handleSubmit}>
                {!isLogin && method === "email" && (
                  <Input placeholder="الاسم الكامل" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 rounded-xl border-[#102f50]/15 bg-[#f7f9f8] text-right placeholder:text-[#102f50]/35 focus:border-[#188779] focus:ring-[#188779]/20" required />
                )}
                {method === "email" ? (
                  <Input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl border-[#102f50]/15 bg-[#f7f9f8] text-right placeholder:text-[#102f50]/35 focus:border-[#188779] focus:ring-[#188779]/20" required />
                ) : (
                  <Input type="tel" placeholder="966 5X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12 rounded-xl border-[#102f50]/15 bg-[#f7f9f8] text-right placeholder:text-[#102f50]/35 focus:border-[#188779] focus:ring-[#188779]/20" dir="ltr" required />
                )}

                {method === "email" && (
                  <div className="relative">
                    <Input type={showPass ? "text" : "password"} placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)}
                      className="h-12 rounded-xl border-[#102f50]/15 bg-[#f7f9f8] pl-12 text-right placeholder:text-[#102f50]/35 focus:border-[#188779] focus:ring-[#188779]/20" required minLength={8} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#102f50]/45 transition-colors hover:text-[#188779]">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}

                {method === "phone" && otpSent && (
                  <Input type="text" placeholder="رمز التحقق" value={otp} onChange={(e) => setOtp(e.target.value)} className="h-12 rounded-xl border-[#102f50]/15 bg-[#f7f9f8] text-center text-lg tracking-[0.5em] focus:border-[#188779] focus:ring-[#188779]/20" dir="ltr" maxLength={6} />
                )}

                {isLogin && method === "email" && (
                  <Link to="/forgot-password" className="block cursor-pointer text-left text-sm font-bold text-[#188779] hover:underline">نسيت كلمة المرور؟</Link>
                )}

                <TurnstileWidget key={`${captchaKey}-${method}-${isLogin}`} onToken={setCaptchaToken} />

                <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-[#188779] text-base font-black text-white shadow-lg shadow-[#188779]/20 transition hover:bg-[#147568]">
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      {method === "phone" && otpSent ? "تحقق" : isLogin ? "تسجيل الدخول" : "إنشاء حساب"}
                      <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-[#102f50]/55">
                {isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
                <button onClick={() => setIsLogin(!isLogin)} className="font-black text-[#188779] hover:underline">
                  {isLogin ? "إنشاء حساب" : "تسجيل الدخول"}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      </main>
      </div>
    </div>
  );
};

export default Login;
