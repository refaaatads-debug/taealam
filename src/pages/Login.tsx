import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Mail, Phone, Eye, EyeOff } from "lucide-react";

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [showPass, setShowPass] = useState(false);

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-card-hover animate-scale-in">
        <CardContent className="p-8">
          <Link to="/" className="flex items-center justify-center gap-2 text-primary font-bold text-2xl mb-8">
            <GraduationCap className="h-8 w-8" />
            <span>تعلّم</span>
          </Link>

          <h2 className="text-2xl font-bold text-center text-foreground mb-2">
            {isLogin ? "تسجيل الدخول" : "إنشاء حساب جديد"}
          </h2>
          <p className="text-center text-muted-foreground text-sm mb-6">
            {isLogin ? "أهلاً بعودتك! سجّل دخولك للمتابعة" : "انضم لأكثر من 10,000 طالب"}
          </p>

          {/* Social Login */}
          <div className="flex gap-3 mb-6">
            <Button variant="outline" className="flex-1 gap-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google
            </Button>
            <Button variant="outline" className="flex-1 gap-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">أو</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Method Toggle */}
          <div className="flex bg-muted rounded-lg p-1 mb-6">
            <button
              onClick={() => setMethod("email")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${method === "email" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <Mail className="h-4 w-4" />
              البريد الإلكتروني
            </button>
            <button
              onClick={() => setMethod("phone")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${method === "phone" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <Phone className="h-4 w-4" />
              رقم الجوال
            </button>
          </div>

          <form className="space-y-4">
            {!isLogin && (
              <Input placeholder="الاسم الكامل" className="h-12 text-right" />
            )}
            {method === "email" ? (
              <Input type="email" placeholder="البريد الإلكتروني" className="h-12 text-right" />
            ) : (
              <Input type="tel" placeholder="05X XXX XXXX" className="h-12 text-right" dir="ltr" />
            )}
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                placeholder="كلمة المرور"
                className="h-12 text-right pl-12"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {isLogin && (
              <p className="text-sm text-secondary text-left cursor-pointer hover:underline">نسيت كلمة المرور؟</p>
            )}

            <Button type="button" className="w-full h-12 gradient-cta shadow-button text-secondary-foreground text-base">
              {isLogin ? "تسجيل الدخول" : "إنشاء حساب"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-secondary font-semibold hover:underline">
              {isLogin ? "إنشاء حساب" : "تسجيل الدخول"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
