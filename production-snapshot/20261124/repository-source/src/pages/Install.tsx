import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Download, CheckCircle2, Apple, Chrome, Share2, ArrowRight } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | "unknown">("unknown");

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) setPlatform("ios");
    else if (/Android/i.test(ua)) setPlatform("android");
    else setPlatform("desktop");

    // Already installed?
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone) {
      setInstalled(true);
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowRight className="h-4 w-4" /> العودة للرئيسية
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-secondary mb-4 shadow-xl">
            <Smartphone className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-2">ثبّت التطبيق</h1>
          <p className="text-muted-foreground">احصل على تجربة كاملة كأنه تطبيق أصلي على هاتفك</p>
        </div>

        {installed ? (
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
              <h2 className="text-xl font-bold mb-2">التطبيق مثبت بالفعل! 🎉</h2>
              <p className="text-muted-foreground">يمكنك تشغيله من الشاشة الرئيسية لجهازك.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Auto install button (Android/Desktop Chrome) */}
            {deferred && (
              <Card className="border-primary/40 bg-primary/5 mb-4">
                <CardContent className="p-6 text-center">
                  <Download className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h2 className="text-xl font-bold mb-2">جاهز للتثبيت</h2>
                  <p className="text-sm text-muted-foreground mb-4">اضغط الزر أدناه لتثبيت التطبيق على جهازك مباشرةً.</p>
                  <Button size="lg" onClick={handleInstall} className="w-full md:w-auto gap-2">
                    <Download className="h-5 w-5" /> تثبيت الآن
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* iOS instructions */}
            {platform === "ios" && (
              <Card className="mb-4">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Apple className="h-8 w-8" />
                    <h3 className="text-lg font-bold">على iPhone / iPad</h3>
                  </div>
                  <ol className="space-y-3 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">1</span>
                      <span>افتح هذه الصفحة في متصفح <strong>Safari</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">2</span>
                      <span className="flex items-center gap-2 flex-wrap">اضغط زر المشاركة <Share2 className="h-4 w-4 inline" /> في شريط الأدوات بالأسفل</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">3</span>
                      <span>اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">4</span>
                      <span>اضغط <strong>"إضافة"</strong> في الأعلى</span>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {/* Android instructions */}
            {(platform === "android" || platform === "desktop") && !deferred && (
              <Card className="mb-4">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Chrome className="h-8 w-8" />
                    <h3 className="text-lg font-bold">على Android / Chrome</h3>
                  </div>
                  <ol className="space-y-3 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">1</span>
                      <span>افتح القائمة <strong>⋮</strong> في أعلى المتصفح</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">2</span>
                      <span>اختر <strong>"تثبيت التطبيق"</strong> أو <strong>"إضافة إلى الشاشة الرئيسية"</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">3</span>
                      <span>اضغط <strong>"تثبيت"</strong> للتأكيد</span>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {/* Benefits */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-bold mb-4">مميزات التثبيت</h3>
                <ul className="space-y-3 text-sm">
                  {[
                    "🚀 وصول سريع من الشاشة الرئيسية",
                    "📱 تجربة كاملة بدون شريط المتصفح",
                    "🔔 إشعارات فورية للحصص والرسائل",
                    "⚡ تحميل أسرع وأداء أفضل",
                    "💾 يستهلك مساحة أقل بكثير من التطبيقات العادية",
                  ].map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {b}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Install;
