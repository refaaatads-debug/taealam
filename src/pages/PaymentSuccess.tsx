import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, BookOpen, ArrowLeft, Sparkles, Calendar, Users, Clock } from "lucide-react";
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
  const bookingId = searchParams.get("booking");
  const [subscription, setSubscription] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  const [subjectName, setSubjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      if (bookingId) {
        // Fetch booking details
        const { data: b } = await supabase
          .from("bookings")
          .select("*, subjects(name)")
          .eq("id", bookingId)
          .single();

        if (b) {
          setBooking(b);
          setSubjectName((b as any).subjects?.name || "");

          // Get teacher name
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", b.teacher_id)
            .single();
          if (prof) setTeacherName(prof.full_name);
        }
      } else {
        // Fetch subscription details
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
      }
      setLoading(false);
    };
    fetchData();
  }, [user, bookingId]);

  const isBookingPayment = !!bookingId;

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
              <p className="text-white/80">
                {isBookingPayment ? "تم تأكيد حجز الحصة بنجاح" : "تم تفعيل اشتراكك بنجاح"}
              </p>
            </div>

            <CardContent className="p-6 space-y-6">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : isBookingPayment ? (
                /* Booking Payment Confirmation */
                <>
                  <div className="bg-muted/50 rounded-xl p-5 space-y-3">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      تفاصيل الحجز
                    </h3>
                    <div className="space-y-3 text-sm">
                      {teacherName && (
                        <div className="flex justify-between items-center bg-background rounded-lg p-3">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Users className="w-4 h-4" /> المعلم
                          </span>
                          <span className="font-bold">{teacherName}</span>
                        </div>
                      )}
                      {subjectName && (
                        <div className="flex justify-between items-center bg-background rounded-lg p-3">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> المادة
                          </span>
                          <span className="font-bold">{subjectName}</span>
                        </div>
                      )}
                      {booking && (
                        <>
                          <div className="flex justify-between items-center bg-background rounded-lg p-3">
                            <span className="text-muted-foreground flex items-center gap-2">
                              <Calendar className="w-4 h-4" /> الموعد
                            </span>
                            <span className="font-bold">
                              {new Date(booking.scheduled_at).toLocaleDateString("ar-SA", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center bg-background rounded-lg p-3">
                            <span className="text-muted-foreground flex items-center gap-2">
                              <Clock className="w-4 h-4" /> الوقت
                            </span>
                            <span className="font-bold">
                              {new Date(booking.scheduled_at).toLocaleTimeString("ar-SA", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center bg-background rounded-lg p-3">
                            <span className="text-muted-foreground">المبلغ</span>
                            <span className="font-bold text-primary">{booking.price} ر.س</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-3 text-sm text-green-700 dark:text-green-400 text-center">
                    ✅ سيتم إشعار المعلم بالحجز. ستتلقى إشعاراً عند موافقته.
                  </div>
                </>
              ) : subscription && plan ? (
                /* Subscription Confirmation */
                <>
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
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    تم الدفع بنجاح. سيتم التفعيل خلال لحظات.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3">
                {isBookingPayment ? (
                  <>
                    <Button asChild size="lg" className="w-full">
                      <Link to="/student">
                        <Calendar className="w-5 h-5 ml-2" />
                        لوحة التحكم
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="w-full">
                      <Link to="/search">
                        <BookOpen className="w-5 h-5 ml-2" />
                        حجز حصة أخرى
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
