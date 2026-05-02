import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Search, Star, Filter, BookOpen, Clock, CheckCircle, Users, CalendarCheck, ArrowRight, Loader2, X, Package, CreditCard, PartyPopper, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface TeacherResult {
  id: string;
  user_id: string;
  bio: string | null;
  hourly_rate: number;
  avg_rating: number;
  total_sessions: number;
  total_reviews: number;
  is_verified: boolean;
  years_experience: number;
  available_from: string | null;
  available_to: string | null;
  teaching_stages: string[];
  profile?: { full_name: string; avatar_url: string | null };
  subjects: string[];
}

const allTimeSlots = [
  "8:00 ص", "9:00 ص", "10:00 ص", "11:00 ص", "12:00 م",
  "1:00 م", "2:00 م", "3:00 م", "4:00 م", "5:00 م",
  "6:00 م", "7:00 م", "8:00 م", "9:00 م", "10:00 م", "11:00 م",
];

const parseTimeSlotHour = (slot: string): number => {
  const parts = slot.split(":");
  let hour = parseInt(parts[0]);
  if (slot.includes("م") && hour !== 12) hour += 12;
  if (slot.includes("ص") && hour === 12) hour = 0;
  return hour;
};

const SearchTeacher = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("all");
  const [sort, setSort] = useState("rating");
  const [teachers, setTeachers] = useState<TeacherResult[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick booking form state
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedSlots, setSelectedSlots] = useState<{ dayIndex: number; time: string }[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [teacherCount, setTeacherCount] = useState(0);
  const [baseRemainingMinutes, setBaseRemainingMinutes] = useState(0);
  const [reservedMinutes, setReservedMinutes] = useState(0);
  const [bookingSuccess, setBookingSuccess] = useState<{ slots: { dayLabel: string; time: string; date: string }[]; subjectName: string; teacherCount: number } | null>(null);

  // Filters for "اختر معلم محدد" section
  const [filterName, setFilterName] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");

  const teachingStagesOptions = ["رياض الأطفال", "الابتدائية", "المتوسطة", "الثانوية", "قدرات", "تحصيلي"];
  const QUICK_SESSION_MINUTES = 45;
  const remainingMinutes = Math.max(0, baseRemainingMinutes - reservedMinutes);
  const maxQuickSlots = Math.floor(remainingMinutes / QUICK_SESSION_MINUTES);
  const canQuickBook = remainingMinutes >= QUICK_SESSION_MINUTES;

  // Fetch student's remaining sessions
  useEffect(() => {
    if (!user) return;
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase
        .from("user_subscriptions")
        .select("sessions_remaining, remaining_minutes")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("remaining_minutes", 0)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("bookings")
        .select("duration_minutes")
        .eq("student_id", user.id)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", now)
        .lte("scheduled_at", future),
      supabase
        .from("booking_requests")
        .select("duration_minutes")
        .eq("student_id", user.id)
        .in("status", ["open", "accepted"])
        .gte("scheduled_at", now)
        .lte("scheduled_at", future),
    ]).then(([subRes, bookingsRes, requestsRes]) => {
      setBaseRemainingMinutes(subRes.data?.remaining_minutes || 0);

      const reservedFromBookings = (bookingsRes.data || []).reduce(
        (sum: number, item: any) => sum + Math.max(0, item.duration_minutes || QUICK_SESSION_MINUTES),
        0
      );
      const reservedFromRequests = (requestsRes.data || []).reduce(
        (sum: number, item: any) => sum + Math.max(0, item.duration_minutes || QUICK_SESSION_MINUTES),
        0
      );

      setReservedMinutes(reservedFromBookings + reservedFromRequests);
    });
  }, [user]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: d.toLocaleDateString("ar-SA", { weekday: "short" }),
      date: d.getDate().toString(),
      fullDate: d,
    };
  });

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (!selectedSubject) { setTeacherCount(0); return; }
    const countTeachers = async () => {
      // Get teacher IDs for selected subject
      const { data: tsData } = await supabase
        .from("teacher_subjects")
        .select("teacher_id, teacher_profiles!inner(user_id, is_approved, teaching_stages)")
        .eq("subject_id", selectedSubject);
      
      if (!tsData) { setTeacherCount(0); return; }
      
      let filtered = (tsData as any[]).filter((ts: any) => ts.teacher_profiles?.is_approved);
      
      // Filter by stage if selected
      if (selectedStage && selectedStage !== "all_stages") {
        filtered = filtered.filter((ts: any) => {
          const stages = ts.teacher_profiles?.teaching_stages || [];
          return stages.includes(selectedStage);
        });
      }
      
      setTeacherCount(filtered.length);
    };
    countTeachers();
  }, [selectedSubject, selectedStage]);

  const fetchSubjects = async () => {
    const { data } = await supabase.from("subjects").select("id, name").order("name");
    if (data) setSubjects(data);
  };

  const fetchTeachers = async () => {
    setLoading(true);
    const { data: teacherProfiles } = await supabase
      .from("public_teacher_profiles")
      .select("*")
      .eq("is_approved", true)
      .order("avg_rating", { ascending: false });

    if (!teacherProfiles) { setLoading(false); return; }

    const userIds = teacherProfiles.map(t => t.user_id);
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds);
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));

    const teacherIds = teacherProfiles.map(t => t.id);
    const { data: teacherSubjects } = await supabase
      .from("teacher_subjects")
      .select("teacher_id, subjects(name)")
      .in("teacher_id", teacherIds);

    const subjectMap = new Map<string, string[]>();
    (teacherSubjects ?? []).forEach((ts: any) => {
      const existing = subjectMap.get(ts.teacher_id) || [];
      if (ts.subjects?.name) existing.push(ts.subjects.name);
      subjectMap.set(ts.teacher_id, existing);
    });

    const result: TeacherResult[] = teacherProfiles.map(t => ({
      ...t,
      avg_rating: Number(t.avg_rating) || 0,
      total_sessions: t.total_sessions || 0,
      total_reviews: t.total_reviews || 0,
      is_verified: t.is_verified || false,
      years_experience: t.years_experience || 0,
      teaching_stages: t.teaching_stages || [],
      profile: profileMap.get(t.user_id) || { full_name: "معلم", avatar_url: null },
      subjects: subjectMap.get(t.id) || [],
    }));

    setTeachers(result);
    setLoading(false);
  };

  const filtered = teachers
    .filter((t) => {
      const name = t.profile?.full_name || "";
      const matchSearch = name.includes(search) || t.subjects.some(s => s.includes(search));
      const matchSubject = subject === "all" || t.subjects.includes(subject);
      // Additional filters for "اختر معلم محدد"
      const matchFilterName = !filterName || name.includes(filterName);
      const matchFilterSubject = filterSubject === "all" || t.subjects.includes(filterSubject);
      const matchFilterStage = filterStage === "all" || t.teaching_stages.includes(filterStage);
      return matchSearch && matchSubject && matchFilterName && matchFilterSubject && matchFilterStage;
    })
    .sort((a, b) => sort === "rating" ? b.avg_rating - a.avg_rating : a.hourly_rate - b.hourly_rate);

  const isAvailableNow = (t: TeacherResult) => {
    if (!t.available_from || !t.available_to) return false;
    const now = new Date();
    const h = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
    return h >= t.available_from && h <= t.available_to;
  };

  const toggleSlot = (dayIndex: number, time: string) => {
    setSelectedSlots(prev => {
      const exists = prev.some(s => s.dayIndex === dayIndex && s.time === time);
      if (exists) return prev.filter(s => !(s.dayIndex === dayIndex && s.time === time));
      if (!canQuickBook) {
        toast.error(`رصيدك المتاح ${remainingMinutes} دقيقة فقط، والحد الأدنى للحجز ${QUICK_SESSION_MINUTES} دقيقة.`);
        return prev;
      }
      if (prev.length >= maxQuickSlots) {
        toast.error(`لا يمكنك اختيار أكثر من ${maxQuickSlots} حصة حسب رصيدك المتاح (${remainingMinutes} دقيقة).`);
        return prev;
      }
      return [...prev, { dayIndex, time }];
    });
  };

  const removeSlot = (dayIndex: number, time: string) => {
    setSelectedSlots(prev => prev.filter(s => !(s.dayIndex === dayIndex && s.time === time)));
  };

  const handleQuickBooking = async () => {
    if (!user) { navigate("/login"); return; }
    if (!selectedSubject || selectedSlots.length === 0) return;

    // Check subscription - if no subscription, redirect to pricing
    if (!canQuickBook) {
      toast.error("لا يوجد لديك باقة نشطة. اشترك في باقة أولاً لحجز الحصص.");
      navigate("/pricing");
      return;
    }

    const maxSlots = Math.floor(remainingMinutes / QUICK_SESSION_MINUTES);
    if (selectedSlots.length > maxSlots) {
      toast.error(`رصيدك ${remainingMinutes} دقيقة (${maxSlots} حصة). قللّ عدد الحصص أو جدّد باقتك.`);
      return;
    }

    // Build scheduled dates
    const scheduledDates = selectedSlots.map(slot => {
      const day = days[slot.dayIndex].fullDate;
      const hour = parseTimeSlotHour(slot.time);
      const scheduled = new Date(day);
      scheduled.setHours(hour, 0, 0, 0);
        return { ...slot, scheduled, scheduledEnd: new Date(scheduled.getTime() + QUICK_SESSION_MINUTES * 60 * 1000) };
    });

    // Check conflicts
    const { data: conflictingBookings } = await supabase
      .from("bookings")
      .select("id, scheduled_at, duration_minutes")
      .eq("student_id", user.id)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", new Date().toISOString());

    for (const sd of scheduledDates) {
      const hasConflict = (conflictingBookings || []).some((b: any) => {
        const bStart = new Date(b.scheduled_at).getTime();
        const bEnd = bStart + (b.duration_minutes || 45) * 60 * 1000;
        return sd.scheduled.getTime() < bEnd && sd.scheduledEnd.getTime() > bStart;
      });
      if (hasConflict) {
        toast.error(`لديك حصة متعارضة يوم ${days[sd.dayIndex].label} الساعة ${sd.time}. أزلها وحاول مجدداً.`);
        return;
      }
    }

    setBookingLoading(true);
    try {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const subjectName = subjects.find(s => s.id === selectedSubject)?.name || "مادة";

      // Insert all booking requests — group all slots of the same subject under one group_id
      // so the teacher receives a single grouped request showing all sessions
      const stageValue = selectedStage && selectedStage !== "all_stages" ? selectedStage : null;
      const groupId = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const requests = scheduledDates.map(sd => ({
        student_id: user.id,
        subject_id: selectedSubject,
        scheduled_at: sd.scheduled.toISOString(),
        duration_minutes: QUICK_SESSION_MINUTES,
        status: "open",
        expires_at: expiresAt,
        teaching_stage: stageValue,
        group_id: groupId,
      }));

      const { error } = await supabase.from("booking_requests" as any).insert(requests as any);
      if (error) throw error;

      // Notify only teachers matching subject AND stage
      const { data: teacherSubjectsData } = await supabase
        .from("teacher_subjects")
        .select("teacher_id, teacher_profiles!inner(user_id, is_approved, teaching_stages)")
        .eq("subject_id", selectedSubject);

      if (teacherSubjectsData) {
        const slotsText = scheduledDates.map(sd => `${days[sd.dayIndex].label} ${sd.time}`).join(" • ");
        let eligibleTeachers = (teacherSubjectsData as any[]).filter((ts: any) => ts.teacher_profiles?.is_approved);
        
        // Filter by stage if selected
        if (selectedStage && selectedStage !== "all_stages") {
          eligibleTeachers = eligibleTeachers.filter((ts: any) => {
            const stages = ts.teacher_profiles?.teaching_stages || [];
            return stages.includes(selectedStage);
          });
        }

        const stageText = selectedStage && selectedStage !== "all_stages" ? ` - ${selectedStage}` : "";
        const notifications = eligibleTeachers.map((ts: any) => ({
            user_id: ts.teacher_profiles.user_id,
            title: `📚 ${selectedSlots.length} طلب حصة جديد - ${subjectName}${stageText}`,
            body: `طالب يبحث عن معلم ${subjectName}${stageText}: ${slotsText}. سارع بالقبول!`,
            type: "booking_request",
          }));

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      const successSubjectName = subjects.find(s => s.id === selectedSubject)?.name || "مادة";
      const successSlots = scheduledDates.map(sd => ({
        dayLabel: days[sd.dayIndex].label,
        time: sd.time,
        date: sd.scheduled.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" }),
      }));
      setBookingSuccess({ slots: successSlots, subjectName: successSubjectName, teacherCount });
      setSelectedSubject("");
      setSelectedStage("");
      setSelectedSlots([]);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
      <Navbar />

      <div className="gradient-hero py-10 md:py-14 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 rounded-full border border-primary-foreground/20 animate-float" />
        </div>
        <div className="container relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-primary-foreground mb-2">ابحث عن مدرسك المثالي</h1>
            <p className="text-primary-foreground/70 mb-5 md:mb-6 text-sm md:text-base">أكثر من {teachers.length} مدرس معتمد</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="ابحث بالاسم أو المادة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 pr-11 bg-card border-0 text-right rounded-xl shadow-card"
              />
            </div>
            <div className="flex gap-3">
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="h-12 w-full md:w-48 bg-card border-0 rounded-xl shadow-card">
                  <SelectValue placeholder="المادة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المواد</SelectItem>
                  {subjects.map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-12 w-full md:w-48 bg-card border-0 rounded-xl shadow-card">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="ترتيب حسب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rating">الأعلى تقييماً</SelectItem>
                  <SelectItem value="price">الأقل سعراً</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container py-6 md:py-8 flex-1">
        {/* Quick Booking Form - Redesigned */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          {bookingSuccess ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", duration: 0.5 }}>
              <Card className="border-2 border-secondary/30 shadow-card overflow-hidden bg-gradient-to-br from-secondary/5 via-card to-accent/10">
                <CardContent className="py-8 px-6">
                  <div className="flex flex-col items-center text-center mb-6">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
                      className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mb-4 shadow-lg shadow-secondary/10">
                      <PartyPopper className="h-8 w-8 text-secondary" />
                    </motion.div>
                    <h3 className="text-xl font-black text-foreground">تم إرسال طلبك بنجاح! 🎉</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-md">
                      تم إرسال {bookingSuccess.slots.length} طلب حصة لـ {bookingSuccess.teacherCount} معلم متخصص في {bookingSuccess.subjectName}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {bookingSuccess.slots.map((slot, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
                        className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border/50 shadow-sm">
                        <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shrink-0">
                          <CalendarCheck className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">{slot.dayLabel} - {slot.time}</p>
                          <p className="text-[11px] text-muted-foreground">{slot.date} • 45 دقيقة • {bookingSuccess.subjectName}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button variant="outline" className="rounded-xl" onClick={() => setBookingSuccess(null)}>
                      حجز حصة أخرى
                    </Button>
                    <Button className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                      <Link to="/student">
                        <CheckCircle className="h-4 w-4" />
                        متابعة للوحة الطالب
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <Card className="border-0 shadow-xl overflow-hidden relative bg-gradient-to-br from-card via-card to-primary/[0.02]">
              {/* Animated gradient header strip */}
              <div className="relative h-2 w-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-l from-primary via-secondary to-primary bg-[length:200%_100%] animate-[shimmer_3s_linear_infinite]" />
              </div>

              <CardHeader className="pb-3 pt-5 bg-gradient-to-b from-primary/[0.04] to-transparent">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, 0], scale: 1.05 }}
                      transition={{ duration: 0.5 }}
                      className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center shadow-lg shadow-secondary/30"
                    >
                      <CalendarCheck className="h-6 w-6 text-white" />
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 rounded-2xl bg-secondary/40"
                      />
                    </motion.div>
                    <div>
                      <CardTitle className="text-xl font-black flex items-center gap-2">
                        اطلب حصة سريعة
                        <Badge className="bg-gradient-to-l from-secondary to-primary text-white border-0 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                          ⚡ فوري
                        </Badge>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">اختر المادة والموعد، وسنرسل طلبك لكل المعلمين المتخصصين</p>
                    </div>
                  </div>
                  {remainingMinutes > 0 && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Badge className="bg-primary/10 text-primary border-0 text-xs font-bold px-3 py-1.5 rounded-full">
                        <Package className="h-3 w-3 ml-1" />
                        {remainingMinutes} دقيقة متاحة
                      </Badge>
                    </motion.div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="pt-4 pb-5">
                {/* Progress bar */}
                {(() => {
                  const completed = [!!selectedSubject, selectedDay >= 0, selectedSlots.length > 0].filter(Boolean).length;
                  const progress = (completed / 3) * 100;
                  return (
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          {[
                            { num: 1, label: "المادة", done: !!selectedSubject, icon: BookOpen },
                            { num: 2, label: "اليوم", done: selectedDay >= 0, icon: CalendarCheck },
                            { num: 3, label: "الوقت", done: selectedSlots.length > 0, icon: Clock },
                          ].map((step, idx) => (
                            <div key={step.num} className="flex items-center gap-1.5">
                              <motion.div
                                animate={step.done ? { scale: [1, 1.2, 1] } : {}}
                                transition={{ duration: 0.4 }}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                                  step.done
                                    ? "bg-secondary/15 text-secondary"
                                    : "bg-muted/50 text-muted-foreground"
                                }`}
                              >
                                {step.done ? <CheckCircle className="h-3 w-3" /> : <step.icon className="h-3 w-3" />}
                                <span className="hidden sm:inline">{step.label}</span>
                              </motion.div>
                              {idx < 2 && <div className={`w-3 h-px ${step.done ? "bg-secondary/40" : "bg-border"}`} />}
                            </div>
                          ))}
                        </div>
                        <span className="text-[11px] font-black text-secondary">{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className="h-full bg-gradient-to-l from-primary via-secondary to-primary rounded-full"
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Row 1: Subject + Stage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <motion.div whileHover={{ y: -2 }} className="group">
                    <p className="text-xs font-bold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-primary" /> اختر المادة
                    </p>
                    <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                      <SelectTrigger className={`h-11 rounded-xl border-2 transition-all duration-200 ${selectedSubject ? "border-secondary/50 bg-secondary/5 shadow-sm shadow-secondary/10" : "border-border hover:border-primary/40"}`}>
                        <SelectValue placeholder="المادة الدراسية" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedSubject && teacherCount > 0 && (
                      <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                        className="text-[11px] text-secondary mt-1.5 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> {teacherCount} معلم متخصص جاهز
                      </motion.p>
                    )}
                  </motion.div>

                  <motion.div whileHover={{ y: -2 }} className="group">
                    <p className="text-xs font-bold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      🎓 المرحلة الدراسية
                    </p>
                    <Select value={selectedStage} onValueChange={setSelectedStage}>
                      <SelectTrigger className={`h-11 rounded-xl border-2 transition-all duration-200 ${selectedStage && selectedStage !== "all_stages" ? "border-secondary/50 bg-secondary/5 shadow-sm shadow-secondary/10" : "border-border hover:border-primary/40"}`}>
                        <SelectValue placeholder="اختر المرحلة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_stages">جميع المراحل</SelectItem>
                        {teachingStagesOptions.map(stage => (
                          <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </motion.div>
                </div>

                {/* Row 2: Days */}
                <div className="mb-4">
                  <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                    📅 اختر اليوم
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                    {days.map((d, i) => {
                      const daySlotCount = selectedSlots.filter(s => s.dayIndex === i).length;
                      const isActive = selectedDay === i;
                      return (
                        <motion.button
                          key={i}
                          whileHover={{ y: -3, scale: 1.03 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedDay(i)}
                          className={`relative flex flex-col items-center px-4 py-2.5 rounded-2xl text-xs font-medium whitespace-nowrap transition-all min-w-[68px] border-2 ${
                            isActive
                              ? "bg-gradient-to-br from-secondary to-primary text-white shadow-lg shadow-secondary/30 border-transparent"
                              : "bg-card text-muted-foreground hover:bg-accent/30 border-border/50 hover:border-primary/40"
                          }`}
                        >
                          <span className={`text-[10px] mb-0.5 font-semibold ${isActive ? "opacity-90" : "opacity-70"}`}>{d.label}</span>
                          <span className="text-xl font-black leading-tight">{d.date}</span>
                          {i === 0 && <span className={`text-[9px] mt-0.5 font-black ${isActive ? "text-white/90" : "text-primary"}`}>اليوم</span>}
                          {daySlotCount > 0 && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                              className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-black flex items-center justify-center shadow-md ring-2 ring-card">
                              {daySlotCount}
                            </motion.span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Row 3: Time slots — split AM/PM */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" /> اختر الساعات
                      <span className="text-[10px] text-muted-foreground/60 font-medium">(يمكن اختيار أكثر من ساعة)</span>
                    </p>
                    {remainingMinutes <= 0 && (
                      <Badge className="bg-destructive/10 text-destructive border-0 text-[10px] px-2.5 py-1 rounded-full">
                        لا يوجد رصيد
                      </Badge>
                    )}
                  </div>

                  {(() => {
                    const amSlots = allTimeSlots.filter(t => t.includes("ص"));
                    const pmSlots = allTimeSlots.filter(t => t.includes("م"));
                    const renderSlot = (t: string) => {
                      const isToday = selectedDay === 0;
                      const slotHour = parseTimeSlotHour(t);
                      const currentHour = new Date().getHours();
                      const isPast = isToday && slotHour <= currentHour;
                      const isSelected = selectedSlots.some(s => s.dayIndex === selectedDay && s.time === t);
                      return (
                        <motion.button
                          key={t}
                          whileHover={!isPast ? { y: -2, scale: 1.04 } : {}}
                          whileTap={!isPast ? { scale: 0.92 } : {}}
                          onClick={() => !isPast && toggleSlot(selectedDay, t)}
                          disabled={isPast}
                          className={`relative px-2 py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                            isPast
                              ? "bg-muted/20 text-muted-foreground/30 cursor-not-allowed line-through border-transparent"
                              : isSelected
                                ? "bg-gradient-to-br from-secondary to-primary text-white shadow-md shadow-secondary/25 border-transparent"
                                : "bg-card text-foreground hover:bg-accent/30 border-border/50 hover:border-primary/40"
                          }`}
                        >
                          {isSelected && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                              className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-white text-secondary flex items-center justify-center shadow-sm">
                              <CheckCircle className="h-3 w-3" />
                            </motion.span>
                          )}
                          {t}
                        </motion.button>
                      );
                    };
                    return (
                      <div className="space-y-3">
                        {amSlots.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                              ☀️ صباحاً
                            </p>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                              {amSlots.map(renderSlot)}
                            </div>
                          </div>
                        )}
                        {pmSlots.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 mb-1.5 flex items-center gap-1">
                              🌙 مساءً
                            </p>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                              {pmSlots.map(renderSlot)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Selected slots summary */}
                <AnimatePresence>
                  {selectedSlots.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    >
                      <div className="p-3.5 rounded-xl bg-gradient-to-l from-secondary/10 via-primary/5 to-secondary/10 border border-secondary/20">
                        <p className="text-xs font-black text-foreground mb-2 flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-secondary" />
                          {selectedSlots.length} حصة محددة — جاهزة للإرسال
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedSlots.map((s, i) => (
                            <motion.div key={`${s.dayIndex}-${s.time}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ delay: i * 0.03 }}>
                              <Badge className="bg-card text-foreground border border-border/60 text-[11px] gap-1.5 pl-1 py-1 px-2.5 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                📅 {days[s.dayIndex].label} • {s.time}
                                <button onClick={() => removeSlot(s.dayIndex, s.time)} className="hover:text-destructive transition-colors">
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* No subscription warning */}
                {remainingMinutes <= 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="rounded-xl p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <span>لا يوجد لديك باقة نشطة. <Link to="/pricing" className="font-bold underline">اشترك الآن</Link> لحجز الحصص.</span>
                  </motion.div>
                )}

                {/* Submit button */}
                {remainingMinutes <= 0 ? (
                  <Button
                    className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-sm"
                    onClick={() => navigate("/pricing")}
                  >
                    <CreditCard className="h-4 w-4" />
                    اشترك في باقة للحجز
                  </Button>
                ) : (
                  <motion.div whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      className="w-full h-13 py-3.5 gradient-cta shadow-lg shadow-secondary/20 text-secondary-foreground rounded-xl font-black text-base disabled:opacity-40 relative overflow-hidden group"
                      disabled={selectedSlots.length === 0 || !selectedSubject || bookingLoading}
                      onClick={handleQuickBooking}
                    >
                      {bookingLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                        <>
                          <span className="absolute inset-0 bg-gradient-to-l from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                          <Sparkles className="h-4 w-4" />
                          إرسال {selectedSlots.length > 1 ? `${selectedSlots.length} طلبات` : "الطلب"} الآن
                          <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm font-bold text-muted-foreground">أو اختر معلم محدد</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Teacher List Filters */}
        <Card className="border-0 shadow-card mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3 items-end">
              <div className="relative flex-1">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" /> اسم المعلم
                </p>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث باسم المعلم..."
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className="h-11 pr-10 rounded-xl bg-muted/30 border-border/50"
                  />
                </div>
              </div>
              <div className="w-full md:w-48">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" /> المادة الدراسية
                </p>
                <Select value={filterSubject} onValueChange={setFilterSubject}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-border/50">
                    <SelectValue placeholder="جميع المواد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المواد</SelectItem>
                    {subjects.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full md:w-48">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">🎓 المرحلة الدراسية</p>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-border/50">
                    <SelectValue placeholder="جميع المراحل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المراحل</SelectItem>
                    {teachingStagesOptions.map(stage => (
                      <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(filterName || filterSubject !== "all" || filterStage !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-11 rounded-xl"
                  onClick={() => { setFilterName(""); setFilterSubject("all"); setFilterStage("all"); }}
                >
                  <X className="h-3.5 w-3.5 ml-1" /> مسح الفلاتر
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mb-4 md:mb-6">
          <p className="text-muted-foreground font-medium text-sm md:text-base">{filtered.length} مدرس متاح</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-card">
                <CardContent className="p-5 space-y-3">
                  <div className="flex gap-3">
                    <Skeleton className="w-16 h-16 rounded-2xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-bold text-foreground mb-1">لا يوجد مدرسين</p>
            <p className="text-sm text-muted-foreground">جرب تغيير معايير البحث</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filtered.map((t, i) => {
              const available = isAvailableNow(t);
              return (
                <motion.div key={t.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1.5 border-0 group overflow-hidden h-full">
                    <CardContent className="p-0">
                      <div className="p-4 md:p-5 pb-0">
                        <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
                          <div className="relative">
                            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl gradient-hero flex items-center justify-center shrink-0">
                              <Users className="h-7 w-7 text-primary-foreground/70" />
                            </div>
                            {available && (
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-secondary border-2 border-card" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <h3 className="font-bold text-foreground text-sm md:text-base truncate">{t.profile?.full_name}</h3>
                              {t.is_verified && <CheckCircle className="h-4 w-4 text-secondary fill-secondary/20 shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1">
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>{t.subjects.join("، ") || "عام"}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="flex items-center gap-1 font-bold text-foreground">
                                <Star className="h-3.5 w-3.5 fill-gold text-gold" />{t.avg_rating.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">{t.total_sessions} حصة</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground mb-2 leading-relaxed line-clamp-2">{t.bio || `مدرس خبرة ${t.years_experience} سنوات`}</p>
                        {t.teaching_stages.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {t.teaching_stages.map(stage => (
                              <Badge key={stage} variant="outline" className="text-[10px] px-2 py-0.5 rounded-lg border-border/50 text-muted-foreground">
                                🎓 {stage}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="p-4 md:p-5 pt-0">
                        <div className="flex items-center justify-between mb-3 md:mb-4 pt-3 border-t">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {available ? <span className="text-secondary font-semibold">متاح الآن</span> : <span>خبرة {t.years_experience} سنوات</span>}
                          </div>
                        </div>
                        <Button className="w-full gradient-cta shadow-button text-secondary-foreground rounded-xl h-10 md:h-11" asChild>
                          <Link to={`/booking?teacher=${t.user_id}`}>احجز مع هذا المعلم</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
};

export default SearchTeacher;
