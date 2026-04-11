import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Search, Star, Filter, BookOpen, Clock, CheckCircle, Users, CalendarCheck, ArrowRight, Loader2, X, Package, CreditCard, PartyPopper } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
  const [sessionsRemaining, setSessionsRemaining] = useState(0);
  const [bookingSuccess, setBookingSuccess] = useState<{ slots: { dayLabel: string; time: string; date: string }[]; subjectName: string; teacherCount: number } | null>(null);

  const teachingStagesOptions = ["رياض الأطفال", "الابتدائية", "المتوسطة", "الثانوية", "قدرات", "تحصيلي"];
  // Fetch student's remaining sessions
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_subscriptions")
      .select("sessions_remaining")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gt("sessions_remaining", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setSessionsRemaining(data?.sessions_remaining || 0);
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
      .from("teacher_profiles")
      .select("*")
      .eq("is_approved", true)
      .order("avg_rating", { ascending: false });

    if (!teacherProfiles) { setLoading(false); return; }

    const userIds = teacherProfiles.map(t => t.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
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
      return matchSearch && matchSubject;
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
      if (sessionsRemaining > 0 && prev.length >= sessionsRemaining) {
        toast.error(`رصيدك ${sessionsRemaining} حصة فقط. لا يمكن إضافة المزيد.`);
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
    if (sessionsRemaining <= 0) {
      toast.error("لا يوجد لديك باقة نشطة. اشترك في باقة أولاً لحجز الحصص.");
      navigate("/pricing");
      return;
    }

    if (sessionsRemaining < selectedSlots.length) {
      toast.error(`رصيدك ${sessionsRemaining} حصة فقط. قللّ عدد الحصص أو جدّد باقتك.`);
      return;
    }

    // Build scheduled dates
    const scheduledDates = selectedSlots.map(slot => {
      const day = days[slot.dayIndex].fullDate;
      const hour = parseTimeSlotHour(slot.time);
      const scheduled = new Date(day);
      scheduled.setHours(hour, 0, 0, 0);
      return { ...slot, scheduled, scheduledEnd: new Date(scheduled.getTime() + 45 * 60 * 1000) };
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

      // Insert all booking requests
      const stageValue = selectedStage && selectedStage !== "all_stages" ? selectedStage : null;
      const requests = scheduledDates.map(sd => ({
        student_id: user.id,
        subject_id: selectedSubject,
        scheduled_at: sd.scheduled.toISOString(),
        duration_minutes: 45,
        status: "open",
        expires_at: expiresAt,
        teaching_stage: stageValue,
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
        {/* Quick Booking Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          <Card className="border-0 shadow-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <CalendarCheck className="h-4 w-4 text-secondary" />
                </div>
                اطلب حصة سريعة
                <Badge className="mr-auto bg-secondary/10 text-secondary border-0 text-xs">أسرع طريقة</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">اختر المادة والموعد وسيتم إرسال طلبك لجميع المعلمين المتخصصين</p>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-end">
                {/* Subject */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" /> اختر المادة
                  </p>
                  <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="المادة الدراسية" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSubject && teacherCount > 0 && (
                    <p className="text-[11px] text-secondary mt-1 font-semibold">✅ {teacherCount} معلم متخصص</p>
                  )}
                </div>

                {/* Stage */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    🎓 المرحلة الدراسية
                  </p>
                  <Select value={selectedStage} onValueChange={setSelectedStage}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="اختر المرحلة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_stages">جميع المراحل</SelectItem>
                      {teachingStagesOptions.map(stage => (
                        <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Day */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">اختر اليوم (لعرض الساعات)</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {days.map((d, i) => {
                      const daySlotCount = selectedSlots.filter(s => s.dayIndex === i).length;
                      return (
                        <button key={i} onClick={() => setSelectedDay(i)}
                          className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all min-w-[52px] relative ${selectedDay === i ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                          <span className="text-[10px] opacity-80">{d.label}</span>
                          <span className="text-sm font-black">{d.date}</span>
                          {daySlotCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black flex items-center justify-center">{daySlotCount}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> اختر الساعات
                    <Badge className={`mr-auto border-0 text-[10px] ${sessionsRemaining > 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                      <Package className="h-3 w-3 ml-1" />
                      {sessionsRemaining > 0 ? `${selectedSlots.length}/${sessionsRemaining} حصة` : "لا يوجد رصيد"}
                    </Badge>
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {allTimeSlots.map((t) => {
                      const isToday = selectedDay === 0;
                      const slotHour = parseTimeSlotHour(t);
                      const currentHour = new Date().getHours();
                      const isPast = isToday && slotHour <= currentHour;
                      const isSelected = selectedSlots.some(s => s.dayIndex === selectedDay && s.time === t);
                      return (
                        <button key={t} onClick={() => !isPast && toggleSlot(selectedDay, t)}
                          disabled={isPast}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
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
                </div>

                {/* Selected Slots Summary + Submit */}
                <div className="space-y-2">
                  {sessionsRemaining <= 0 && (
                    <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span>لا يوجد لديك باقة نشطة. <Link to="/pricing" className="font-bold underline">اشترك الآن</Link> لحجز الحصص.</span>
                    </div>
                  )}
                  {selectedSlots.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedSlots.map((s, i) => (
                        <Badge key={i} className="bg-secondary/10 text-secondary border-0 text-[10px] gap-1 pl-1">
                          {days[s.dayIndex].label} {s.time}
                          <button onClick={() => removeSlot(s.dayIndex, s.time)} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {sessionsRemaining <= 0 ? (
                    <Button
                      className="w-full h-11 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold"
                      onClick={() => navigate("/pricing")}
                    >
                      <CreditCard className="h-4 w-4" />
                      اشترك في باقة للحجز
                    </Button>
                  ) : (
                    <Button
                      className="w-full h-11 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold"
                      disabled={selectedSlots.length === 0 || !selectedSubject || bookingLoading}
                      onClick={handleQuickBooking}
                    >
                      {bookingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                          إرسال {selectedSlots.length > 1 ? `${selectedSlots.length} طلبات` : "الطلب"}
                          <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Booking Success Confirmation */}
        {bookingSuccess && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <Card className="border-2 border-secondary/30 shadow-card overflow-hidden bg-secondary/5">
              <CardContent className="py-6">
                <div className="flex flex-col items-center text-center mb-5">
                  <div className="w-14 h-14 rounded-full bg-secondary/10 flex items-center justify-center mb-3">
                    <PartyPopper className="h-7 w-7 text-secondary" />
                  </div>
                  <h3 className="text-lg font-black text-foreground">تم إرسال طلبك بنجاح! 🎉</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    تم إرسال {bookingSuccess.slots.length} طلب حصة لـ {bookingSuccess.teacherCount} معلم متخصص في {bookingSuccess.subjectName}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                  {bookingSuccess.slots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card border">
                      <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
                        <CalendarCheck className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{slot.dayLabel} - {slot.time}</p>
                        <p className="text-[11px] text-muted-foreground">{slot.date} • 45 دقيقة • {bookingSuccess.subjectName}</p>
                      </div>
                    </div>
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
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm font-bold text-muted-foreground">أو اختر معلم محدد</span>
          <div className="flex-1 h-px bg-border" />
        </div>

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
                        <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4 leading-relaxed line-clamp-2">{t.bio || `مدرس خبرة ${t.years_experience} سنوات`}</p>
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
