import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Mail, ArrowRight, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("تم إرسال رابط إعادة التعيين!");
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

            {sent ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-secondary" />
                </div>
                <h2 className="text-xl font-black text-foreground">تحقق من بريدك الإلكتروني</h2>
                <p className="text-muted-foreground text-sm">أرسلنا رابط إعادة تعيين كلمة المرور إلى <strong className="text-foreground">{email}</strong></p>
                <Link to="/login">
                  <Button variant="outline" className="mt-4 rounded-xl">العودة لتسجيل الدخول</Button>
                </Link>
              </motion.div>
            ) : (
              <>
                <h2 className="text-2xl font-black text-center text-foreground mb-1">نسيت كلمة المرور؟</h2>
                <p className="text-center text-muted-foreground text-sm mb-6">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="h-12 text-right pr-10 rounded-xl bg-muted/30 border-border/50 focus:border-secondary" required />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full h-12 gradient-cta shadow-button text-secondary-foreground text-base rounded-xl font-bold">
                    {loading ? <div className="w-5 h-5 border-2 border-secondary-foreground border-t-transparent rounded-full animate-spin" /> : (
                      <>إرسال رابط التعيين <ArrowRight className="mr-2 h-4 w-4 rotate-180" /></>
                    )}
                  </Button>
                </form>
                <p className="text-center text-sm text-muted-foreground mt-4">
                  <Link to="/login" className="text-secondary font-bold hover:underline">العودة لتسجيل الدخول</Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
