import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, BookOpen, ArrowLeft, Sparkles, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";

const PaymentSuccess = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [subscription, setSubscription] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchSubscription = async () => {
      const { data: subs } = await supabase
        .from("user_subscriptions")
        .select("*, subscription_plans(*)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (subs && subs.length > 0) {
        setSubscription(subs[0]);
        setPlan(subs[0].subscription_plans);
      }
      setLoading(false);
    };
    fetchSubscription();
  }, [user]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <main className="container mx-auto px-4 py-20 flex items-center justify-center min-h-[70vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-lg w-full"
        >
          <Card className="border-0 shadow-2xl overflow-hidden">
            {/* Success Header */}
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-8 text-center text-white">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                <CheckCircle className="w-20 h-20 mx-auto mb-4" />
              </motion.div>
              <h1 className="text-3xl font-bold mb-2">تم الدفع بنجاح! 🎉</h1>
              <p className="text-white/80">تم تفعيل اشتراكك بنجاح</p>
            </div>

            <CardContent className="p-6 space-y-6">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : subscription && plan ? (
                <>
                  {/* Plan Details */}
                  <div className="bg-muted/50 rounded-xl p-5 space-y-3">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      تفاصيل الاشتراك
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-background rounded-lg p-3 text-center">
                        <p className="text-muted-foreground mb-1">الباقة</p>
                        <p className="font-bold text-primary">{plan.name_ar}</p>
                      </div>
                      <div className="bg-background rounded-lg p-3 text-center">
                        <p className="text-muted-foreground mb-1">السعر</p>
                        <p className="font-bold">{plan.price} ر.س</p>
                      </div>
                      <div className="bg-background rounded-lg p-3 text-center">
                        <p className="text-muted-foreground mb-1">رصيد الحصص</p>
                        <p className="font-bold text-green-600">{subscription.sessions_remaining} حصة</p>
                      </div>
                      <div className="bg-background rounded-lg p-3 text-center">
                        <p className="text-muted-foreground mb-1">ينتهي في</p>
                        <p className="font-bold text-sm">
                          {new Date(subscription.ends_at).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-2">
                    <h3 className="font-bold">مميزات باقتك:</h3>
                    <ul className="space-y-2 text-sm">
                      {plan.has_ai_tutor && (
                        <li className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" /> مدرس ذكي AI
                        </li>
                      )}
                      {plan.has_recording && (
                        <li className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" /> تسجيل الحصص
                        </li>
                      )}
                      {plan.has_priority_booking && (
                        <li className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" /> أولوية الحجز
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">
                    تم الدفع بنجاح. سيتم تفعيل اشتراكك خلال لحظات.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <Button asChild size="lg" className="w-full">
                  <Link to="/search">
                    <BookOpen className="w-5 h-5 ml-2" />
                    احجز حصتك الأولى
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="w-full">
                  <Link to="/student">
                    <Calendar className="w-5 h-5 ml-2" />
                    لوحة التحكم
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/">
                    <ArrowLeft className="w-4 h-4 ml-2" />
                    الصفحة الرئيسية
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
};

export default PaymentSuccess;
