import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Mail, Phone, Eye, EyeOff, ArrowRight, User, BookOpen, Users as UsersIcon, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

type Role = "student" | "teacher";

const roles: { id: Role; label: string; icon: typeof User; desc: string }[] = [
  { id: "student", label: "طالب", icon: User, desc: "أبحث عن مدرس" },
  { id: "teacher", label: "معلم", icon: BookOpen, desc: "أريد التدريس" },
];

const Login = () => {
  const { user, roles: userRoles, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<Role>("student");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();

  // After OAuth callback, assign saved role if user is new
  useEffect(() => {
    const applyPendingRole = async () => {
      if (!user) return;
      const pendingRole = localStorage.getItem("pending_role");
      if (!pendingRole) return;
      localStorage.removeItem("pending_role");

      if (pendingRole === "teacher") {
        try {
          // Use secure server-side function to update role
          const { error } = await supabase.rpc("set_new_user_role", { _role: "teacher" });
          if (error) {
            console.log("Role update skipped:", error.message);
          } else {
            toast.success("تم إنشاء حسابك كمعلم! سيتم مراجعته والموافقة عليه قريباً", { duration: 6000 });
            window.location.href = "/teacher";
            return;
          }
        } catch (e) {
          console.error("Error setting role:", e);
        }
      }
    };
    applyPendingRole();
  }, [user]);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (!authLoading && user && userRoles.length > 0) {
      // Don't redirect if there's a pending role being applied
      if (localStorage.getItem("pending_role")) return;
      if (userRoles.includes("admin")) navigate("/admin");
      else if (userRoles.includes("teacher")) navigate("/teacher");
      else if (userRoles.includes("parent")) navigate("/parent");
      else navigate("/student");
    }
  }, [user, userRoles, authLoading, navigate]);

  const redirectByRole = (userRole?: string) => {
    switch (userRole) {
      case "admin": navigate("/admin"); break;
      case "teacher": navigate("/teacher"); break;
      case "parent": navigate("/parent"); break;
      default: navigate("/student");
    }
  };

  const handleEmailAuth = async () => {
    setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Fetch role to redirect correctly
        const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).limit(1).single();
        toast.success("تم تسجيل الدخول بنجاح!");
        redirectByRole(roleData?.role);
      } else {
        if (!fullName.trim()) { toast.error("الرجاء إدخال الاسم الكامل"); setLoading(false); return; }
        if (password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); setLoading(false); return; }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        // Role is assigned automatically by DB trigger from metadata
        if (role === "teacher") {
          toast.success("تم إنشاء حسابك كمعلم! سيتم مراجعته والموافقة عليه قريباً", { duration: 6000 });
        } else {
          toast.success("تم إنشاء الحساب! تحقق من بريدك الإلكتروني");
        }
      }
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneAuth = async () => {
    setLoading(true);
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+966${phone.replace(/^0/, "")}`;
      if (!otpSent) {
        const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
        if (error) throw error;
        setOtpSent(true);
        toast.success("تم إرسال رمز التحقق!");
      } else {
        const { data, error } = await supabase.auth.verifyOtp({ phone: formattedPhone, token: otp, type: "sms" });
        if (error) throw error;
        toast.success("تم التحقق بنجاح!");
        if (data.user) {
          const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).limit(1).single();
          redirectByRole(roleData?.role);
        }
      }
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
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
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
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
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full border border-primary-foreground/20 animate-float" />
        <div className="absolute bottom-20 left-20 w-40 h-40 rounded-full border border-primary-foreground/20 animate-float" style={{ animationDelay: "1s" }} />
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md relative z-10">
        <Card className="border-0 shadow-card-hover overflow-hidden">
          <CardContent className="p-0">
            <div className="p-8 pb-6">
              <Link to="/" className="flex items-center justify-center gap-2.5 mb-6">
                <div className="w-10 h-10 rounded-xl gradient-cta flex items-center justify-center">
                  <GraduationCap className="h-5 w-5 text-secondary-foreground" />
                </div>
                <span className="font-extrabold text-2xl text-foreground">تعلّم</span>
              </Link>
              <h2 className="text-2xl font-black text-center text-foreground mb-1">
                {isLogin ? "مرحباً بعودتك! 👋" : "انضم لمجتمع تعلّم"}
              </h2>
              <p className="text-center text-muted-foreground text-sm">
                {isLogin ? "سجّل دخولك للمتابعة" : "أكثر من 10,000 طالب يثقون بنا"}
              </p>
            </div>

            <div className="px-8 pb-8">
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
                  <Input type="tel" placeholder="05X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12 text-right rounded-xl bg-muted/30 border-border/50 focus:border-secondary" dir="ltr" required />
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
    </div>
  );
};

export default Login;
