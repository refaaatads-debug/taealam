import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, Clock, CheckCircle, BookOpen, ArrowRight, ArrowLeft, Loader2, AlertCircle, X, Package, CreditCard, Sparkles, Timer, Wallet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const WEEKDAYS_MAP: Record<number, string> = {
  0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
  4: "thursday", 5: "friday", 6: "saturday",
};

const WEEKDAY_LABELS: Record<string, string> = {
  saturday: "السبت", sunday: "الأحد", monday: "الاثنين",
  tuesday: "الثلاثاء", wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة",
};

const Booking = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const directTeacherId = searchParams.get("teacher");
  const prefilledSubjectParam = searchParams.get("subject"); // id or name
  const prefilledDayParam = searchParams.get("day"); // index 0..13

  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDay, setSelectedDay] = useState<number | null>(
    prefilledDayParam !== null && !isNaN(Number(prefilledDayParam)) ? Math.max(0, Math.min(13, Number(prefilledDayParam))) : null
  );
  const [selectedSlots, setSelectedSlots] = useState<{ dayIndex: number; time: string }[]>([]);
  const [step, setStep] = useState(prefilledSubjectParam || prefilledDayParam ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState(0);
    const SESSION_MINUTES = 30;
  const MIN_SESSION_MINUTES = 10;
  const maxBookableSlots = Math.max(1, Math.floor(remainingMinutes / SESSION_MINUTES));
  const canBook = remainingMinutes >= MIN_SESSION_MINUTES;
  const [teacherCount, setTeacherCount] = useState(0);
  const [directTeacherName, setDirectTeacherName] = useState("");
  const [existingBookings, setExistingBookings] = useState<Date[]>([]);
  const [conflictKey, setConflictKey] = useState<string | null>(null);

  // Teacher availability
  const [teacherAvailableDays, setTeacherAvailableDays] = useState<string[]>([]);
  const [teacherAvailableFrom, setTeacherAvailableFrom] = useState<string | null>(null);
  const [teacherAvailableTo, setTeacherAvailableTo] = useState<string | null>(null);
  const [teacherSubjects, setTeacherSubjects] = useState<{ id: string; name: string }[]>([]);

  // Generate next 14 days
  const allDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: d.toLocaleDateString("ar-SA", { weekday: "short" }),
      date: d.getDate().toString(),
      fullDate: d,
      dayKey: WEEKDAYS_MAP[d.getDay()],
    };
  });

  // Filter days based on teacher availability for direct booking
  const days = directTeacherId
    ? (teacherAvailableDays.length > 0
      ? allDays.filter(d => teacherAvailableDays.includes(d.dayKey))
      : allDays.slice(0, 14))
    : allDays.slice(0, 7);

  // Generate time slots from teacher's available hours
  const generateTimeSlots = () => {
    if (directTeacherId && teacherAvailableFrom && teacherAvailableTo) {
      const fromHour = parseInt(teacherAvailableFrom.split(":")[0]);
      const toHour = parseInt(teacherAvailableTo.split(":")[0]);
      const slots: string[] = [];
      for (let h = fromHour; h < toHour; h++) {
        const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
        const period = h >= 12 ? "م" : "ص";
        slots.push(`${displayHour}:00 ${period}`);
      }
      return slots;
    }
    return ["3:00 م", "4:00 م", "5:00 م", "6:00 م", "7:00 م", "8:00 م", "9:00 م"];
  };

  const timeSlots = generateTimeSlots();

  useEffect(() => {
    // Smooth scroll to top on load
    window.scrollTo({ top: 0, behavior: "smooth" });

    const fetchSubjects = async () => {
      const { data } = await supabase.from("subjects").select("id, name").order("name");
      if (data) {
        setSubjects(data);
        // Auto-fill subject from URL (accept id or name)
        if (prefilledSubjectParam) {
          const match = data.find(
            (s) => s.id === prefilledSubjectParam || s.name === prefilledSubjectParam
          );
          if (match) setSelectedSubject(match.id);
        }
      }
    };
    fetchSubjects();

    // Enforce profile completeness for students before booking
    if (user) {
      supabase
        .from("profiles")
        .select("full_name, phone, teaching_stage")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          const complete = !!(data?.full_name && data?.phone && (data as any)?.teaching_stage);
          if (!complete) {
            toast.error("يجب استكمال بياناتك أولاً قبل الحجز");
            navigate(`/complete-profile?redirect=${encodeURIComponent("/booking" + window.location.search)}`);
          }
        });
    }

    // Fetch remaining minutes
    if (user) {
      supabase
        .from("user_subscriptions")
        .select("sessions_remaining, remaining_minutes")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          const remainMin = (data as any)?.remaining_minutes ?? (data?.sessions_remaining || 0) * 45;
          setRemainingMinutes(Math.max(0, remainMin));
        });
    }

    // Fetch existing bookings for conflict detection
    if (user) {
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      Promise.all([
        supabase.from("bookings").select("scheduled_at").eq("student_id", user.id).gte("scheduled_at", now).lte("scheduled_at", future),
        supabase.from("booking_requests").select("scheduled_at").eq("student_id", user.id).in("status", ["open", "accepted"]).gte("scheduled_at", now).lte("scheduled_at", future),
      ]).then(([b, r]) => {
        const all: Date[] = [];
        (b.data || []).forEach((x: any) => x.scheduled_at && all.push(new Date(x.scheduled_at)));
        (r.data || []).forEach((x: any) => x.scheduled_at && all.push(new Date(x.scheduled_at)));
        setExistingBookings(all);
      });
    }

    if (directTeacherId) {
      Promise.all([
        supabase.from("public_profiles").select("full_name").eq("user_id", directTeacherId).single(),
        supabase.from("public_teacher_profiles").select("available_days, available_from, available_to, id").eq("user_id", directTeacherId).single(),
      ]).then(([profileRes, teacherRes]) => {
        if (profileRes.data) setDirectTeacherName(profileRes.data.full_name);
        if (teacherRes.data) {
          setTeacherAvailableDays((teacherRes.data as any).available_days || []);
          setTeacherAvailableFrom(teacherRes.data.available_from);
          setTeacherAvailableTo(teacherRes.data.available_to);
          supabase.from("teacher_subjects").select("subject_id, subjects(id, name)")
            .eq("teacher_id", teacherRes.data.id)
            .then(({ data: ts }) => {
              if (ts) {
                setTeacherSubjects((ts as any[]).map((t: any) => ({
                  id: t.subjects.id,
                  name: t.subjects.name,
                })));
              }
            });
        }
      });
    }
  }, [directTeacherId, user, prefilledSubjectParam]);

  // Count available teachers for broadcast mode
  useEffect(() => {
    if (directTeacherId || !selectedSubject) { setTeacherCount(0); return; }
    const countTeachers = async () => {
      const { count } = await supabase
        .from("teacher_subjects")
        .select("teacher_id", { count: "exact", head: true })
        .eq("subject_id", selectedSubject);
      setTeacherCount(count || 0);
    };
    countTeachers();
  }, [selectedSubject, directTeacherId]);

  const parseTimeHour = (time: string): number => {
    const parts = time.split(":");
    let hour = parseInt(parts[0]);
    if (time.includes("م") && hour !== 12) hour += 12;
    if (time.includes("ص") && hour === 12) hour = 0;
    return hour;
  };

  const formatMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} س ${m} د`;
    if (h > 0) return `${h} س`;
    return `${m} د`;
  };

  const toggleSlot = (dayIndex: number, time: string) => {
    setSelectedSlots(prev => {
      const exists = prev.some(s => s.dayIndex === dayIndex && s.time === time);
      if (exists) return prev.filter(s => !(s.dayIndex === dayIndex && s.time === time));
      if (remainingMinutes < MIN_SESSION_MINUTES) {
        toast.error(`المتبقي في باقتك ${formatMinutes(remainingMinutes)} فقط - الحد الأدنى للحجز ${MIN_SESSION_MINUTES} د.`);
        return prev;
      }
      return [...prev, { dayIndex, time }];
    });
  };

  const removeSlot = (dayIndex: number, time: string) => {
    setSelectedSlots(prev => prev.filter(s => !(s.dayIndex === dayIndex && s.time === time)));
  };

  const handleSubmitRequest = async () => {
    if (!user || !selectedSubject || selectedSlots.length === 0) return;

    // If no subscription, redirect to pricing
    // If insufficient remaining time, redirect to pricing
    if (!canBook) {
      toast.error(`رصيد باقتك أقل من ${MIN_SESSION_MINUTES} دقائق. اشترك أو جدّد الباقة لحجز الحصص.`);
      navigate("/pricing");
      return;
    }

    setLoading(true);
    try {
      // Allow booking shorter sessions if remaining < SESSION_MINUTES (min 10 min)
      if (remainingMinutes < MIN_SESSION_MINUTES) {
        toast.error(`المتبقي في باقتك ${formatMinutes(remainingMinutes)} فقط - الحد الأدنى ${MIN_SESSION_MINUTES} د.`);
        setLoading(false);
        return;
      }

      const scheduledDates = selectedSlots.map(slot => {
        const day = days[slot.dayIndex].fullDate;
        const hour = parseTimeHour(slot.time);
        const scheduled = new Date(day);
        scheduled.setHours(hour, 0, 0, 0);
        return { ...slot, scheduled };
      });

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const subjectName = (directTeacherId ? teacherSubjects : subjects).find(s => s.id === selectedSubject)?.name || "مادة";

      // Group all requests from one form-submission into a single group_id
      const groupId = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const requests = scheduledDates.map(sd => ({
        student_id: user.id,
        subject_id: selectedSubject,
        scheduled_at: sd.scheduled.toISOString(),
        duration_minutes: 60,
        status: "open",
        expires_at: expiresAt,
        group_id: groupId,
        ...(directTeacherId ? { accepted_by: null } : {}),
      }));

      const { error } = await supabase.from("booking_requests").insert(requests as any);
      if (error) throw error;

      const slotsText = scheduledDates.map(sd => `${days[sd.dayIndex].label} ${sd.time}`).join(" • ");

      if (directTeacherId) {
        await supabase.from("notifications").insert({
          user_id: directTeacherId,
          title: `📚 ${selectedSlots.length} طلب حصة - ${subjectName}`,
          body: `طالب يرغب بحجز ${selectedSlots.length} حصة ${subjectName}: ${slotsText}. سارع بالقبول!`,
          type: "booking_request",
        });

        // First-impression reminder — only if never sent before for this teacher+student pair
        try {
          const studentTag = `[ref:${user.id.slice(0, 8)}]`;
          const [{ count: bookingsCount }, { count: requestsCount }, { count: impressionCount }] = await Promise.all([
            supabase
              .from("bookings")
              .select("id", { count: "exact", head: true })
              .eq("teacher_id", directTeacherId)
              .eq("student_id", user.id),
            supabase
              .from("booking_requests")
              .select("id", { count: "exact", head: true })
              .eq("accepted_by", directTeacherId)
              .eq("student_id", user.id),
            supabase
              .from("notifications")
              .select("id", { count: "exact", head: true })
              .eq("user_id", directTeacherId)
              .eq("type", "first_impression")
              .ilike("body", `%${studentTag}%`),
          ]);
          const isFirstBooking = (bookingsCount || 0) === 0 && (requestsCount || 0) <= scheduledDates.length;
          const alreadySent = (impressionCount || 0) > 0;
          if (isFirstBooking && !alreadySent) {
            await supabase.from("notifications").insert({
              user_id: directTeacherId,
              title: "✨ تذكير مهم: الانطباع الأول",
              body: `الجلسة الأولى تترك أثرًا دائمًا — كن إيجابيًا، مهنيًا، ولطيفًا. كل طالب هو عميل مهم، تصرّف باحتراف والتزام. كن جاهزًا قبل الجلسة، وحدّد المادة أو الموضوع المطلوب، وراجع أي ملاحظات أو أهداف خاصة (مثل: امتحان قريب أو مهارة يحتاج دعم فيها). ابدأ على الموعد تمامًا. ${studentTag}`,
              type: "first_impression",
            });
          }
        } catch {}

        toast.success(`تم إرسال ${selectedSlots.length} طلب للمعلم ${directTeacherName}! ⏳`);
      } else {
        const { data: teacherSubjectsData } = await supabase
          .from("teacher_subjects")
          .select("teacher_id, teacher_profiles!inner(user_id, is_approved)")
          .eq("subject_id", selectedSubject);

        if (teacherSubjectsData) {
          const notifications = (teacherSubjectsData as any[])
            .filter((ts: any) => ts.teacher_profiles?.is_approved)
            .map((ts: any) => ({
              user_id: ts.teacher_profiles.user_id,
              title: `📚 ${selectedSlots.length} طلب حصة - ${subjectName}`,
              body: `طالب يبحث عن معلم ${subjectName}: ${slotsText}. سارع بالقبول!`,
              type: "booking_request",
            }));
          if (notifications.length > 0) await supabase.from("notifications").insert(notifications);
        }
        toast.success(`تم إرسال ${selectedSlots.length} طلب لجميع المعلمين! 🎉`);
      }
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء إرسال الطلب");
    } finally {
      setLoading(false);
    }
  };

  const availableSubjects = directTeacherId ? teacherSubjects : subjects;
  const noAvailability = directTeacherId && teacherAvailableDays.length === 0 && !teacherAvailableFrom && !teacherAvailableTo;

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

        {/* Live Preview Card */}
        {step === 1 && (selectedSubject || selectedDay !== null || selectedSlots.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6"
          >
            <Card className="border-0 shadow-lg overflow-hidden relative bg-gradient-to-br from-primary/5 via-secondary/5 to-primary/5">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary animate-[shimmer_3s_linear_infinite] bg-[length:200%_100%]" />
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm">معاينة فورية</h3>
                    <p className="text-[11px] text-muted-foreground">يتم تحديثها مع كل اختيار</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  {/* Subject */}
                  <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                      <BookOpen className="h-3 w-3" /> المادة
                    </div>
                    <p className="font-bold text-sm truncate">
                      {selectedSubject
                        ? availableSubjects.find(s => s.id === selectedSubject)?.name || "—"
                        : <span className="text-muted-foreground/60 font-normal">لم تُحدد</span>}
                    </p>
                  </div>

                  {/* Day(s) */}
                  <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                      <CalendarCheck className="h-3 w-3" /> اليوم
                    </div>
                    <p className="font-bold text-sm truncate">
                      {selectedSlots.length > 0
                        ? `${new Set(selectedSlots.map(s => s.dayIndex)).size} يوم`
                        : selectedDay !== null && days[selectedDay]
                        ? `${days[selectedDay].label} ${days[selectedDay].date}`
                        : <span className="text-muted-foreground/60 font-normal">لم يُحدد</span>}
                    </p>
                  </div>

                  {/* Time slots count */}
                  <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                      <Clock className="h-3 w-3" /> الحصص
                    </div>
                    <p className="font-bold text-sm">
                      {selectedSlots.length > 0
                        ? `${selectedSlots.length} × ${SESSION_MINUTES} د`
                        : <span className="text-muted-foreground/60 font-normal">لم تُحدد</span>}
                    </p>
                  </div>

                  {/* Total minutes / cost */}
                  <div className="bg-gradient-to-br from-secondary/15 to-primary/15 backdrop-blur rounded-xl p-3 border border-secondary/30">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                      <Timer className="h-3 w-3" /> الإجمالي
                    </div>
                    <p className="font-black text-sm text-secondary">
                      {selectedSlots.length > 0
                        ? formatMinutes(selectedSlots.length * SESSION_MINUTES)
                        : <span className="text-muted-foreground/60 font-normal">0 د</span>}
                    </p>
                  </div>
                </div>

                {/* Balance after */}
                {selectedSlots.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-card/60 border border-border/40"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <Wallet className="h-3.5 w-3.5 text-primary" />
                      <span className="text-muted-foreground">رصيدك بعد الحجز:</span>
                      <span className={`font-black ${remainingMinutes - selectedSlots.length * SESSION_MINUTES < 0 ? "text-destructive" : "text-foreground"}`}>
                        {formatMinutes(Math.max(0, remainingMinutes - selectedSlots.length * SESSION_MINUTES))}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      من أصل {formatMinutes(remainingMinutes)}
                    </span>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                      <CalendarCheck className="h-4 w-4 text-secondary" />
                    </div>
                    {directTeacherId ? `حجز حصة مع ${directTeacherName || "المعلم"}` : "اختر المادة والموعد المناسب"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {directTeacherId
                      ? "اختر المادة والموعد من الأوقات المتاحة للمعلم - يتطلب موافقة المعلم"
                      : "سيتم إرسال طلبك لجميع المعلمين المتخصصين وأول معلم يقبل سيكون معلمك"}
                  </p>
                </CardHeader>
                <CardContent>
                  {noAvailability ? (
                    <div className="text-center py-8">
                      <AlertCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="font-bold text-foreground mb-1">المعلم لم يحدد مواعيد متاحة بعد</p>
                      <p className="text-sm text-muted-foreground mb-4">لا يمكن الحجز حتى يحدد المعلم أيام وأوقات التوفر</p>
                      <Button variant="outline" className="rounded-xl" onClick={() => navigate("/search")}>
                        <ArrowLeft className="ml-2 h-4 w-4" /> العودة للبحث
                      </Button>
                    </div>
                  ) : (
                    <>
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
                            {availableSubjects.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!directTeacherId && selectedSubject && teacherCount > 0 && (
                          <p className="text-xs text-secondary mt-2 font-semibold">✅ {teacherCount} معلم متخصص متاح</p>
                        )}
                      </div>

                      {/* Days */}
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        اختر الأيام {directTeacherId && <span className="text-xs text-primary">(الأيام المتاحة فقط)</span>}
                      </p>
                      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                        {days.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3">لا توجد أيام متاحة</p>
                        ) : (
                          days.map((d, i) => {
                            const daySlotCount = selectedSlots.filter(s => s.dayIndex === i).length;
                            return (
                              <button key={i} onClick={() => setSelectedDay(i)}
                                className={`flex flex-col items-center px-5 py-3 rounded-2xl text-sm font-medium whitespace-nowrap transition-all duration-200 min-w-[80px] relative ${selectedDay === i ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                                <span className="text-xs opacity-80">{d.label}</span>
                                <span className="text-lg font-black">{d.date}</span>
                                {daySlotCount > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-black flex items-center justify-center">{daySlotCount}</span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Time Slots */}
                      <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2 font-medium">
                        <Clock className="h-4 w-4" /> اختر الساعات
                        {directTeacherId && <span className="text-xs text-primary">(ساعات المعلم المتاحة)</span>}
                        <Badge className={`mr-auto border-0 text-xs ${canBook ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                          <Clock className="h-3 w-3 ml-1" />
                          {canBook
                            ? `المتبقي: ${formatMinutes(remainingMinutes)} (${selectedSlots.length}/${maxBookableSlots} حصة)`
                            : "لا يوجد رصيد كافٍ"}
                        </Badge>
                      </p>
                      {timeSlots.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3">المعلم لم يحدد ساعات عمل</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
                          {timeSlots.map((t) => {
                            const isToday = selectedDay === 0;
                            const slotHour = parseTimeHour(t);
                            const currentHour = new Date().getHours();
                            const isPast = isToday && slotHour <= currentHour;
                            const isSelected = selectedDay !== null && selectedSlots.some(s => s.dayIndex === selectedDay && s.time === t);
                            return (
                              <button key={t} onClick={() => !isPast && selectedDay !== null && toggleSlot(selectedDay, t)}
                                disabled={isPast}
                                className={`py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                                  isPast
                                    ? "bg-muted/30 text-muted-foreground/40 cursor-not-allowed line-through"
                                    : isSelected
                                      ? "gradient-cta text-secondary-foreground shadow-button"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }`}>
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* No subscription warning */}
                      {!canBook && (
                        <div className="rounded-xl p-3 mb-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                          <CreditCard className="h-4 w-4 shrink-0" />
                          <span>لا يوجد لديك باقة نشطة. <Link to="/pricing" className="font-bold underline">اشترك الآن</Link> لحجز الحصص.</span>
                        </div>
                      )}

                      {/* Selected Slots Summary */}
                      {selectedSlots.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/30 rounded-xl">
                          {selectedSlots.map((s, i) => (
                            <Badge key={i} className="bg-secondary/10 text-secondary border-0 text-xs gap-1 pl-1.5">
                              {days[s.dayIndex].label} {days[s.dayIndex].date} - {s.time}
                              <button onClick={() => removeSlot(s.dayIndex, s.time)} className="hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      {!canBook ? (
                        <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" onClick={() => navigate("/pricing")}>
                          <CreditCard className="h-4 w-4" />
                          اشترك في باقة للحجز
                        </Button>
                      ) : (
                        <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" disabled={selectedSlots.length === 0 || !selectedSubject} onClick={() => setStep(2)}>
                          متابعة للتأكيد ({selectedSlots.length} حصة)
                          <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                        </Button>
                      )}
                    </>
                  )}
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
                    تأكيد الطلب ({selectedSlots.length} حصة)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 p-5 rounded-2xl text-sm space-y-2">
                    {directTeacherId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">المعلم</span>
                        <span className="text-foreground font-bold">{directTeacherName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المادة</span>
                      <span className="text-foreground font-bold">{(directTeacherId ? teacherSubjects : subjects).find(s => s.id === selectedSubject)?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">عدد الحصص</span>
                      <span className="text-foreground font-bold">{selectedSlots.length} حصة</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المدة لكل حصة</span>
                      <span className="text-foreground font-bold">60 دقيقة</span>
                    </div>
                    <div className="border-t pt-3 mt-2">
                      <span className="text-muted-foreground text-xs block mb-2">المواعيد المختارة:</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedSlots.map((s, i) => (
                          <Badge key={i} className="bg-secondary/10 text-secondary border-0 text-xs">
                            {days[s.dayIndex].label} {days[s.dayIndex].date} - {s.time}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {!directTeacherId && (
                      <div className="flex justify-between border-t pt-3 mt-3">
                        <span className="text-muted-foreground">المعلمون المتاحون</span>
                        <Badge className="bg-secondary/10 text-secondary border-0">{teacherCount} معلم</Badge>
                      </div>
                    )}
                  </div>

                  <div className={`rounded-xl p-3 text-xs border ${directTeacherId ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400" : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"}`}>
                    {directTeacherId
                      ? `سيتم إرسال ${selectedSlots.length} طلب للمعلم ${directTeacherName}. يجب أن يقبل المعلم كل طلب.`
                      : `سيتم إرسال ${selectedSlots.length} طلب لجميع المعلمين المتخصصين. أول معلم يقبل كل طلب سيكون معلمك.`}
                  </div>

                  <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" onClick={handleSubmitRequest} disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : `إرسال ${selectedSlots.length} طلب`}
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
                  <h2 className="text-2xl font-black text-foreground mb-2">
                    {directTeacherId ? "تم إرسال الطلبات! ⏳" : "تم إرسال الطلبات! 🎉"}
                  </h2>
                  <p className="text-muted-foreground mb-1">
                    {directTeacherId
                      ? `تم إرسال ${selectedSlots.length} طلب للمعلم ${directTeacherName} - بانتظار القبول`
                      : `تم إرسال ${selectedSlots.length} طلب لـ ${teacherCount} معلم متخصص`}
                  </p>
                  <p className="text-xs text-muted-foreground mb-8">سيتم إشعارك فور قبول المعلم</p>
                  <div className="flex gap-3 justify-center">
                    <Button className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                      <Link to="/student">الذهاب للوحة التحكم</Link>
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => { setStep(1); setSelectedSlots([]); setSelectedDay(null); }}>
                      طلب حصص أخرى
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
