import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Eye, EyeOff, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for recovery session in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setValidSession(true);
    }
    // Also check if user has an active session from the recovery link
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success("تم تغيير كلمة المرور بنجاح!");
      setTimeout(() => navigate("/login"), 3000);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
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
              <div className="w-10 h-10 rounded-xl gradient-cta flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-secondary-foreground" />
              </div>
              <span className="font-extrabold text-2xl text-foreground">تعلّم</span>
            </Link>

            {success ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-secondary" />
                </div>
                <h2 className="text-xl font-black text-foreground">تم تغيير كلمة المرور!</h2>
                <p className="text-muted-foreground text-sm">جاري تحويلك لتسجيل الدخول...</p>
              </motion.div>
            ) : !validSession ? (
              <div className="text-center space-y-4">
                <h2 className="text-xl font-black text-foreground">رابط غير صالح</h2>
                <p className="text-muted-foreground text-sm">الرابط منتهي الصلاحية أو غير صحيح</p>
                <Link to="/forgot-password">
                  <Button variant="outline" className="mt-4 rounded-xl">طلب رابط جديد</Button>
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-black text-center text-foreground mb-1">تعيين كلمة مرور جديدة</h2>
                <p className="text-center text-muted-foreground text-sm mb-6">اختر كلمة مرور قوية لحسابك</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <Input type={showPass ? "text" : "password"} placeholder="كلمة المرور الجديدة" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 text-right pl-12 rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required minLength={6} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input type={showPass ? "text" : "password"} placeholder="تأكيد كلمة المرور" value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 text-right rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required minLength={6} />
                  <Button type="submit" disabled={loading} className="w-full h-12 gradient-cta shadow-button text-secondary-foreground text-base rounded-xl font-bold">
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
