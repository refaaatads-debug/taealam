import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Clock, CreditCard, CheckCircle, Users, Star, ArrowRight, Shield, ArrowLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Booking = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const teacherUserId = searchParams.get("teacher");

  const [teacher, setTeacher] = useState<any>(null);
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

  // Generate next 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: d.toLocaleDateString("ar-SA", { weekday: "short" }),
      date: d.getDate().toString(),
      fullDate: d,
    };
  });

  // Generate time slots based on teacher availability
  const generateTimeSlots = () => {
    const from = teacherProfile?.available_from ? parseInt(teacherProfile.available_from) : 15;
    const to = teacherProfile?.available_to ? parseInt(teacherProfile.available_to) : 21;
    const slots: string[] = [];
    for (let h = from; h < to; h++) {
      const hour12 = h > 12 ? h - 12 : h;
      const period = h >= 12 ? "م" : "ص";
      slots.push(`${hour12}:00 ${period}`);
    }
    return slots.length > 0 ? slots : ["3:00 م", "4:00 م", "5:00 م", "6:00 م", "7:00 م", "8:00 م"];
  };

  useEffect(() => {
    if (!teacherUserId) return;
    const fetchTeacher = async () => {
      // Get teacher profile
      const { data: tp } = await supabase
        .from("teacher_profiles")
        .select("*")
        .eq("user_id", teacherUserId)
        .single();
      setTeacherProfile(tp);

      // Get name
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", teacherUserId)
        .single();
      setTeacher(prof);

      // Get subjects
      if (tp) {
        const { data: ts } = await supabase
          .from("teacher_subjects")
          .select("subjects(id, name)")
          .eq("teacher_id", tp.id);
        const subs = (ts ?? []).map((s: any) => s.subjects).filter(Boolean);
        setSubjects(subs);
        if (subs.length === 1) setSelectedSubject(subs[0].id);
      }
    };
    fetchTeacher();
  }, [teacherUserId]);

  const getScheduledAt = () => {
    if (!selectedTime) return null;
    const day = days[selectedDay].fullDate;
    // Parse time like "3:00 م"
    const parts = selectedTime.split(":");
    let hour = parseInt(parts[0]);
    if (selectedTime.includes("م") && hour !== 12) hour += 12;
    if (selectedTime.includes("ص") && hour === 12) hour = 0;
    const scheduled = new Date(day);
    scheduled.setHours(hour, 0, 0, 0);
    return scheduled;
  };

  const handleBooking = async () => {
    if (!user || !teacherUserId || !selectedTime) return;
    setLoading(true);
    try {
      const scheduledAt = getScheduledAt();
      if (!scheduledAt) throw new Error("وقت غير صالح");

      const { data, error } = await supabase.from("bookings").insert({
        student_id: user.id,
        teacher_id: teacherUserId,
        subject_id: selectedSubject,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: 60,
        price: teacherProfile?.hourly_rate || 80,
        status: "pending",
      }).select("id").single();

      if (error) throw error;
      setBookingId(data.id);

      // Send notification to teacher
      await supabase.from("notifications").insert({
        user_id: teacherUserId,
        title: "طلب حجز جديد 📚",
        body: `لديك طلب حجز جديد من ${user.user_metadata?.full_name || "طالب"} يوم ${days[selectedDay].label} الساعة ${selectedTime}`,
        type: "booking",
      });

      // Redirect to Stripe Checkout for payment
      const subjectName = subjects.find(s => s.id === selectedSubject)?.name || "";
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke("create-session-checkout", {
        body: {
          booking_id: data.id,
          amount: rate,
          teacher_name: teacher?.full_name,
          subject_name: subjectName,
        },
      });

      if (checkoutError || !checkoutData?.url) {
        toast.success("تم إرسال طلب الحجز! يمكنك الدفع لاحقاً.");
        setStep(3);
        return;
      }

      // Open Stripe Checkout in new tab
      toast.success("تم إنشاء الحجز! جاري فتح صفحة الدفع...");
      const newWindow = window.open(checkoutData.url, "_blank");
      if (!newWindow) {
        // Popup blocked - fallback to showing link
        toast.info("يرجى السماح بالنوافذ المنبثقة أو انقر الرابط", { duration: 10000 });
        window.location.href = checkoutData.url;
      }
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء الحجز");
    } finally {
      setLoading(false);
    }
  };

  const timeSlots = generateTimeSlots();
  const rate = teacherProfile?.hourly_rate || 80;

  if (!teacherUserId) {
    return (
      <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
        <Navbar />
        <div className="container py-16 text-center">
          <Users className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-black text-foreground mb-2">اختر مدرساً أولاً</h2>
          <p className="text-muted-foreground mb-6">ابحث عن مدرس واضغط "احجز الآن"</p>
          <Button className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
            <Link to="/search">ابحث عن مدرس</Link>
          </Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8 max-w-3xl">
        {/* Steps */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {["اختر الموعد", "التأكيد", "تم"].map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: step >= i + 1 ? 1 : 0.8 }} className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-300 ${step > i + 1 ? "bg-secondary text-secondary-foreground" : step === i + 1 ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground"}`}>
                {step > i + 1 ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </motion.div>
              <span className={`text-sm hidden sm:block mx-1 ${step === i + 1 ? "font-bold text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < 2 && <div className={`w-10 h-0.5 rounded-full transition-colors ${step > i + 1 ? "bg-secondary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Teacher Info */}
        <Card className="border-0 shadow-card mb-6 overflow-hidden">
          <div className="h-2 gradient-cta" />
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center">
              <Users className="h-7 w-7 text-primary-foreground/80" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-foreground">{teacher?.full_name || "جاري التحميل..."}</h3>
              <p className="text-sm text-muted-foreground">
                {subjects.map(s => s.name).join("، ") || "عام"} •{" "}
                <Star className="h-3.5 w-3.5 inline fill-gold text-gold" /> {(teacherProfile?.avg_rating || 0).toFixed(1)} •{" "}
                {teacherProfile?.is_verified && <><Shield className="h-3.5 w-3.5 inline text-secondary" /> معتمد</>}
              </p>
            </div>
            <span className="text-xl font-black text-primary">{rate} <span className="text-xs text-muted-foreground font-normal">ر.س/ساعة</span></span>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                      <CalendarCheck className="h-4 w-4 text-secondary" />
                    </div>
                    اختر الموعد المناسب
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Subject Selection */}
                  {subjects.length > 1 && (
                    <div className="mb-5">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">اختر المادة</p>
                      <div className="flex gap-2 flex-wrap">
                        {subjects.map(s => (
                          <button key={s.id} onClick={() => setSelectedSubject(s.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedSubject === s.id ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Days */}
                  <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                    {days.map((d, i) => (
                      <button key={i} onClick={() => setSelectedDay(i)}
                        className={`flex flex-col items-center px-5 py-3 rounded-2xl text-sm font-medium whitespace-nowrap transition-all duration-200 min-w-[80px] ${selectedDay === i ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        <span className="text-xs opacity-80">{d.label}</span>
                        <span className="text-lg font-black">{d.date}</span>
                      </button>
                    ))}
                  </div>

                  {/* Time Slots */}
                  <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2 font-medium"><Clock className="h-4 w-4" /> الأوقات المتاحة</p>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {timeSlots.map((t) => (
                      <button key={t} onClick={() => setSelectedTime(t)}
                        className={`py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${selectedTime === t ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        {t}
                      </button>
                    ))}
                  </div>

                  <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" disabled={!selectedTime} onClick={() => setStep(2)}>
                    متابعة للتأكيد
                    <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    تأكيد الحجز
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 p-5 rounded-2xl text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">المعلم</span>
                      <span className="text-foreground font-bold">{teacher?.full_name}</span>
                    </div>
                    {selectedSubject && subjects.length > 0 && (
                      <div className="flex justify-between mb-2">
                        <span className="text-muted-foreground">المادة</span>
                        <span className="text-foreground font-bold">{subjects.find(s => s.id === selectedSubject)?.name}</span>
                      </div>
                    )}
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">اليوم</span>
                      <span className="text-foreground font-bold">{days[selectedDay].label} {days[selectedDay].date}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">الوقت</span>
                      <span className="text-foreground font-bold">{selectedTime}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">المدة</span>
                      <span className="text-foreground font-bold">60 دقيقة</span>
                    </div>
                    <div className="flex justify-between border-t pt-3 mt-3">
                      <span className="font-bold text-foreground">المجموع</span>
                      <span className="font-black text-primary text-lg">{rate} ر.س</span>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
                    سيتم إرسال الطلب للمعلم للموافقة عليه. بعد الموافقة يمكنك الدفع وبدء الحصة.
                  </div>

                  <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" onClick={handleBooking} disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "تأكيد الحجز وإرسال للمعلم"}
                  </Button>
                  <Button variant="ghost" className="w-full rounded-xl" onClick={() => setStep(1)}>
                    <ArrowLeft className="ml-2 h-4 w-4" /> رجوع
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="border-0 shadow-card text-center">
                <CardContent className="py-14 px-6">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 15 }} className="w-20 h-20 rounded-2xl bg-secondary/10 mx-auto mb-6 flex items-center justify-center">
                    <CheckCircle className="h-10 w-10 text-secondary" />
                  </motion.div>
                  <h2 className="text-2xl font-black text-foreground mb-2">تم إرسال الطلب! 🎉</h2>
                  <p className="text-muted-foreground mb-1">حصة مع {teacher?.full_name}</p>
                  <p className="text-sm text-muted-foreground mb-1">{days[selectedDay].label} • {selectedTime}</p>
                  <p className="text-xs text-muted-foreground mb-8">سيتم إشعارك عند موافقة المعلم</p>
                  <div className="flex gap-3 justify-center">
                    <Button className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                      <Link to="/student">الذهاب للوحة التحكم</Link>
                    </Button>
                    <Button variant="outline" className="rounded-xl" asChild>
                      <Link to="/search">حجز حصة أخرى</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default Booking;
