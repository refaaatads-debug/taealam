import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Eye, EyeOff, ArrowRight, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Verify admin role from database
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .single();

      if (roleError || !roleData) {
        await supabase.auth.signOut();
        toast.error("ليس لديك صلاحيات الأدمن");
        setLoading(false);
        return;
      }

      toast.success("مرحباً بك في لوحة التحكم!");
      navigate("/admin");
    } catch (e: any) {
      toast.error(e.message || "بيانات الدخول غير صحيحة");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full border border-white/20 animate-float" />
        <div className="absolute bottom-20 left-20 w-40 h-40 rounded-full border border-white/20 animate-float" style={{ animationDelay: "1s" }} />
      </div>
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden">
          <CardContent className="p-0">
            <div className="p-8 pb-6">
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-black text-center text-white mb-1">
                لوحة التحكم
              </h2>
              <p className="text-center text-slate-400 text-sm">
                دخول المسؤولين فقط
              </p>
            </div>

            <div className="px-8 pb-8">
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6">
                <Lock className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">هذه الصفحة مخصصة لمسؤولي النظام فقط</p>
              </div>

              <form className="space-y-4" onSubmit={handleLogin}>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">البريد الإلكتروني</label>
                  <Input
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 text-right rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">كلمة المرور</label>
                  <div className="relative">
                    <Input
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 text-right pl-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-base rounded-xl font-bold shadow-lg"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      تسجيل الدخول
                      <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link to="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
                  ← العودة لصفحة الدخول الرئيسية
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
