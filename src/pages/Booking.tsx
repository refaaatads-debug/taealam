import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, Clock, CheckCircle, BookOpen, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const WEEKDAYS = [
  { key: "saturday", label: "السبت" },
  { key: "sunday", label: "الأحد" },
  { key: "monday", label: "الاثنين" },
  { key: "tuesday", label: "الثلاثاء" },
  { key: "wednesday", label: "الأربعاء" },
  { key: "thursday", label: "الخميس" },
  { key: "friday", label: "الجمعة" },
];

const Booking = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [teacherCount, setTeacherCount] = useState(0);

  // Generate next 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: d.toLocaleDateString("ar-SA", { weekday: "short" }),
      date: d.getDate().toString(),
      fullDate: d,
      dayKey: WEEKDAYS[d.getDay() === 0 ? 1 : d.getDay() === 6 ? 0 : d.getDay()].key,
    };
  });

  // Time slots
  const timeSlots = ["3:00 م", "4:00 م", "5:00 م", "6:00 م", "7:00 م", "8:00 م", "9:00 م"];

  useEffect(() => {
    const fetchSubjects = async () => {
      const { data } = await supabase.from("subjects").select("id, name").order("name");
      if (data) setSubjects(data);
    };
    fetchSubjects();
  }, []);

  // Count available teachers for selected subject
  useEffect(() => {
    if (!selectedSubject) { setTeacherCount(0); return; }
    const countTeachers = async () => {
      const { count } = await supabase
        .from("teacher_subjects")
        .select("teacher_id", { count: "exact", head: true })
        .eq("subject_id", selectedSubject);
      setTeacherCount(count || 0);
    };
    countTeachers();
  }, [selectedSubject]);

  const getScheduledAt = () => {
    if (!selectedTime) return null;
    const day = days[selectedDay].fullDate;
    const parts = selectedTime.split(":");
    let hour = parseInt(parts[0]);
    if (selectedTime.includes("م") && hour !== 12) hour += 12;
    if (selectedTime.includes("ص") && hour === 12) hour = 0;
    const scheduled = new Date(day);
    scheduled.setHours(hour, 0, 0, 0);
    return scheduled;
  };

  const handleSubmitRequest = async () => {
    if (!user || !selectedSubject || !selectedTime) return;
    setLoading(true);
    try {
      const scheduledAt = getScheduledAt();
      if (!scheduledAt) throw new Error("وقت غير صالح");

      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

      // Create open booking request with expiry
      const { data: request, error } = await supabase.from("booking_requests" as any).insert({
        student_id: user.id,
        subject_id: selectedSubject,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: 60,
        status: "open",
        expires_at: expiresAt,
      } as any).select("id").single();

      if (error) throw error;

      // Get all teachers for this subject and notify them
      const { data: teacherSubjects } = await supabase
        .from("teacher_subjects")
        .select("teacher_id, teacher_profiles!inner(user_id, is_approved)")
        .eq("subject_id", selectedSubject);

      const subjectName = subjects.find(s => s.id === selectedSubject)?.name || "مادة";
      const dayLabel = days[selectedDay].label;

      if (teacherSubjects) {
        const notifications = (teacherSubjects as any[])
          .filter((ts: any) => ts.teacher_profiles?.is_approved)
          .map((ts: any) => ({
            user_id: ts.teacher_profiles.user_id,
            title: `📚 طلب حصة جديد - ${subjectName}`,
            body: `طالب يبحث عن معلم ${subjectName} يوم ${dayLabel} الساعة ${selectedTime}. سارع بالقبول!`,
            type: "booking_request",
          }));

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      toast.success("تم إرسال طلبك لجميع المعلمين المتخصصين! 🎉");
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء إرسال الطلب");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8 max-w-3xl">
        {/* Steps */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {["اختر المادة والموعد", "التأكيد", "تم"].map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: step >= i + 1 ? 1 : 0.8 }} className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-300 ${step > i + 1 ? "bg-secondary text-secondary-foreground" : step === i + 1 ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground"}`}>
                {step > i + 1 ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </motion.div>
              <span className={`text-sm hidden sm:block mx-1 ${step === i + 1 ? "font-bold text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < 2 && <div className={`w-10 h-0.5 rounded-full transition-colors ${step > i + 1 ? "bg-secondary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                      <CalendarCheck className="h-4 w-4 text-secondary" />
                    </div>
                    اختر المادة والموعد المناسب
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">سيتم إرسال طلبك لجميع المعلمين المتخصصين وأول معلم يقبل سيكون معلمك</p>
                </CardHeader>
                <CardContent>
                  {/* Subject Selection */}
                  <div className="mb-5">
                    <p className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <BookOpen className="h-4 w-4" /> اختر المادة
                    </p>
                    <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="اختر المادة الدراسية" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedSubject && teacherCount > 0 && (
                      <p className="text-xs text-secondary mt-2 font-semibold">✅ {teacherCount} معلم متخصص متاح</p>
                    )}
                  </div>

                  {/* Days */}
                  <p className="text-sm font-semibold text-muted-foreground mb-2">اختر اليوم</p>
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
                  <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2 font-medium"><Clock className="h-4 w-4" /> اختر الساعة</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
                    {timeSlots.map((t) => (
                      <button key={t} onClick={() => setSelectedTime(t)}
                        className={`py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${selectedTime === t ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        {t}
                      </button>
                    ))}
                  </div>

                  <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" disabled={!selectedTime || !selectedSubject} onClick={() => setStep(2)}>
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
                      <CheckCircle className="h-4 w-4 text-primary" />
                    </div>
                    تأكيد الطلب
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 p-5 rounded-2xl text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">المادة</span>
                      <span className="text-foreground font-bold">{subjects.find(s => s.id === selectedSubject)?.name}</span>
                    </div>
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
                      <span className="text-muted-foreground">المعلمون المتاحون</span>
                      <Badge className="bg-secondary/10 text-secondary border-0">{teacherCount} معلم</Badge>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400">
                    سيتم إرسال طلبك لجميع المعلمين المتخصصين في هذه المادة. أول معلم يقبل الطلب سيكون معلمك وسيتم إنشاء رابط Zoom تلقائياً.
                  </div>

                  <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" onClick={handleSubmitRequest} disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "إرسال الطلب للمعلمين"}
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
                  <p className="text-muted-foreground mb-1">تم إرسال طلبك لـ {teacherCount} معلم متخصص</p>
                  <p className="text-sm text-muted-foreground mb-1">{days[selectedDay].label} • {selectedTime}</p>
                  <p className="text-xs text-muted-foreground mb-8">سيتم إشعارك فور قبول أحد المعلمين</p>
                  <div className="flex gap-3 justify-center">
                    <Button className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                      <Link to="/student">الذهاب للوحة التحكم</Link>
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => { setStep(1); setSelectedTime(null); }}>
                      طلب حصة أخرى
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
