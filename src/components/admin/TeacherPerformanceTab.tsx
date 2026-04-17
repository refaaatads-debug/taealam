import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  GraduationCap, Clock, Users, Star, Search, ChevronDown, ChevronUp,
  Sparkles, Loader2, BookOpen, TrendingUp, Award, Filter, DollarSign
} from "lucide-react";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";
import { motion, AnimatePresence } from "framer-motion";

interface TeacherData {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  avg_rating: number;
  total_reviews: number;
  total_sessions: number;
  is_approved: boolean;
  sessions: SessionDetail[];
  totalMinutes: number;
  totalHours: number;
  totalSeconds: number;
  studentsCount: number;
  completedCount: number;
  cancelledCount: number;
  totalPrice: number;
  aiReport: string | null;
  aiReportLoading: boolean;
}

interface SessionDetail {
  booking_id: string;
  student_name: string;
  subject_name: string;
  scheduled_at: string;
  started_at: string | null;
  duration_minutes: number;
  actual_duration: number | null;
  actual_seconds: number | null;
  status: string;
  price: number | null;
}

interface FilteredStats {
  completedCount: number;
  cancelledCount: number;
  studentsCount: number;
  totalSeconds: number;
  totalPrice: number;
  avgRating: number;
  totalReviews: number;
}

const formatDuration = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

function SessionDetailsTable({ sessions, onFilteredStatsChange }: { sessions: SessionDetail[]; onFilteredStatsChange?: (stats: FilteredStats) => void }) {
  const [studentFilter, setStudentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sessionDateFrom, setSessionDateFrom] = useState("");
  const [sessionDateTo, setSessionDateTo] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");

  const uniqueStudents = useMemo(() => [...new Set(sessions.map(s => s.student_name))], [sessions]);

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      if (studentFilter && s.student_name !== studentFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (sessionDateFrom && new Date(s.scheduled_at) < new Date(sessionDateFrom)) return false;
      if (sessionDateTo) {
        const end = new Date(sessionDateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(s.scheduled_at) > end) return false;
      }
      if (priceFilter === "has_price" && !s.price) return false;
      if (priceFilter === "no_price" && s.price) return false;
      return true;
    });
  }, [sessions, studentFilter, statusFilter, sessionDateFrom, sessionDateTo, priceFilter]);

  const hasActiveFilter = studentFilter || statusFilter !== "all" || priceFilter !== "all" || sessionDateFrom || sessionDateTo;

  // Report filtered stats to parent
  useEffect(() => {
    if (onFilteredStatsChange && hasActiveFilter) {
      const completed = filtered.filter(s => s.status === "completed");
      onFilteredStatsChange({
        completedCount: completed.length,
        cancelledCount: filtered.filter(s => s.status === "cancelled").length,
        studentsCount: new Set(completed.map(s => s.student_name)).size,
        totalSeconds: completed.reduce((sum, s) => sum + (s.actual_seconds || 0), 0),
        totalPrice: completed.reduce((sum, s) => sum + (s.price || 0), 0),
        avgRating: -1, // Can't recalculate from session data
        totalReviews: -1,
      });
    } else if (onFilteredStatsChange && !hasActiveFilter) {
      // Reset - signal no filter active
      onFilteredStatsChange(null as any);
    }
  }, [filtered, hasActiveFilter]);

  const statusLbl = (status: string) => {
    switch (status) {
      case "completed": return "مكتملة";
      case "confirmed": return "مؤكدة";
      case "cancelled": return "ملغاة";
      default: return "معلقة";
    }
  };

  const statusVar = (status: string) => {
    switch (status) {
      case "completed": return "default" as const;
      case "confirmed": return "secondary" as const;
      case "cancelled": return "destructive" as const;
      default: return "outline" as const;
    }
  };

  return (
    <div>
      <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        تفاصيل الحصص ({filtered.length}/{sessions.length})
      </h4>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Select value={studentFilter || "all"} onValueChange={v => setStudentFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40 h-8 text-xs rounded-xl">
            <SelectValue placeholder="كل الطلاب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الطلاب</SelectItem>
            {uniqueStudents.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-xs rounded-xl">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="completed">مكتملة</SelectItem>
            <SelectItem value="confirmed">مؤكدة</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
            <SelectItem value="pending">معلقة</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priceFilter} onValueChange={setPriceFilter}>
          <SelectTrigger className="w-32 h-8 text-xs rounded-xl">
            <SelectValue placeholder="السعر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأسعار</SelectItem>
            <SelectItem value="has_price">بسعر</SelectItem>
            <SelectItem value="no_price">بدون سعر</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>من:</span>
          <Input type="date" value={sessionDateFrom} onChange={e => setSessionDateFrom(e.target.value)} className="h-8 w-36 text-xs rounded-xl" />
          <span>إلى:</span>
          <Input type="date" value={sessionDateTo} onChange={e => setSessionDateTo(e.target.value)} className="h-8 w-36 text-xs rounded-xl" />
        </div>

        {hasActiveFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            setStudentFilter("");
            setStatusFilter("all");
            setPriceFilter("all");
            setSessionDateFrom("");
            setSessionDateTo("");
          }}>مسح الفلاتر</Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">لا توجد حصص مطابقة</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-right pb-2 font-medium">الطالب</th>
                <th className="text-right pb-2 font-medium">المادة</th>
                <th className="text-right pb-2 font-medium">التاريخ</th>
                <th className="text-right pb-2 font-medium">ساعة الدخول</th>
                <th className="text-right pb-2 font-medium">المدة الفعلية</th>
                <th className="text-right pb-2 font-medium">السعر</th>
                <th className="text-right pb-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.slice(0, 50).map((s, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="py-2 text-foreground">{s.student_name}</td>
                  <td className="py-2 text-muted-foreground">{s.subject_name}</td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(s.scheduled_at).toLocaleDateString("ar-SA")}
                  </td>
                  <td className="py-2 text-muted-foreground font-mono">
                    {s.started_at
                      ? new Date(s.started_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td className="py-2 text-foreground font-medium font-mono">
                    {s.status === "completed" && s.actual_seconds != null && s.actual_seconds > 0
                      ? formatDuration(s.actual_seconds)
                      : s.status !== "completed"
                        ? `${s.duration_minutes} دقيقة`
                        : <span className="text-muted-foreground text-xs">لا توجد بيانات</span>}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {s.price ? `${s.price} ر.س` : "—"}
                  </td>
                  <td className="py-2">
                    <Badge variant={statusVar(s.status)} className="text-[10px]">
                      {statusLbl(s.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 50 && (
            <p className="text-center text-xs text-muted-foreground mt-2">
              يتم عرض أحدث 50 حصة من إجمالي {filtered.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeacherPerformanceTab() {
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sessionFilterStats, setSessionFilterStats] = useState<Record<string, FilteredStats | null>>({});

  useEffect(() => {
    fetchTeacherPerformance();
  }, []);

  const fetchTeacherPerformance = async () => {
    setLoading(true);
    try {
      // Get all approved teachers with profiles
      const { data: teacherProfiles } = await supabase
        .from("teacher_profiles")
        .select("id, user_id, avg_rating, total_reviews, total_sessions, is_approved, hourly_rate")
        .eq("is_approved", true);

      if (!teacherProfiles || teacherProfiles.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      const userIds = teacherProfiles.map(t => t.user_id);

      // Fetch profiles and bookings in parallel
      const [profilesRes, bookingsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds),
        supabase.from("bookings").select("id, student_id, teacher_id, subject_id, scheduled_at, duration_minutes, status, price, session_status").in("teacher_id", userIds),
      ]);

      const profileMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p]));
      const bookingsByTeacher = new Map<string, any[]>();
      (bookingsRes.data ?? []).forEach(b => {
        const list = bookingsByTeacher.get(b.teacher_id) || [];
        list.push(b);
        bookingsByTeacher.set(b.teacher_id, list);
      });

      // Get all student names and subject names
      const allStudentIds = [...new Set((bookingsRes.data ?? []).map(b => b.student_id))];
      const allSubjectIds = [...new Set((bookingsRes.data ?? []).filter(b => b.subject_id).map(b => b.subject_id!))];
      const allBookingIds = (bookingsRes.data ?? []).filter(b => b.status === "completed").map(b => b.id);

      // Batch session queries to avoid 1000-row limit
      const batchSize = 200;
      let allSessions: any[] = [];
      for (let i = 0; i < allBookingIds.length; i += batchSize) {
        const batch = allBookingIds.slice(i, i + batchSize);
        const { data } = await supabase.from("sessions").select("booking_id, duration_minutes, started_at, ended_at").in("booking_id", batch);
        if (data) allSessions = allSessions.concat(data);
      }

      const [studentsRes, subjectsRes] = await Promise.all([
        allStudentIds.length > 0 ? supabase.from("profiles").select("user_id, full_name").in("user_id", allStudentIds) : { data: [] },
        allSubjectIds.length > 0 ? supabase.from("subjects").select("id, name").in("id", allSubjectIds) : { data: [] },
      ]);

      const studentMap = new Map((studentsRes.data ?? []).map(s => [s.user_id, s.full_name]));
      const subjectMap = new Map((subjectsRes.data ?? []).map(s => [s.id, s.name]));
      const sessionMap = new Map((allSessions as any[]).map(s => [s.booking_id, s]));

      // Build teacher data
      const teacherData: TeacherData[] = teacherProfiles.map(tp => {
        const profile = profileMap.get(tp.user_id);
        const bookings = bookingsByTeacher.get(tp.user_id) || [];
        const completedBookings = bookings.filter(b => b.status === "completed");
        const cancelledBookings = bookings.filter(b => b.status === "cancelled");
        const uniqueStudents = new Set(completedBookings.map(b => b.student_id));
        const hourlyRate = Number(tp.hourly_rate) || 0;

        let totalActualMinutes = 0;
        let totalActualSeconds = 0;
        const sessions: SessionDetail[] = bookings.map(b => {
          const session = sessionMap.get(b.id);
          const actualDuration = session?.duration_minutes || null;
          let actualSeconds: number | null = null;
          
          if (b.status === "completed" && session?.started_at && session?.ended_at) {
            actualSeconds = Math.floor(
              (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
            );
            if (actualSeconds > 0) {
              totalActualSeconds += actualSeconds;
            }
          } else if (b.status === "completed" && session?.duration_minutes) {
            actualSeconds = session.duration_minutes * 60;
            totalActualSeconds += actualSeconds;
          }
          if (b.status === "completed" && actualDuration) {
            totalActualMinutes += actualDuration;
          }

          // Pricing rules:
          //  • Sessions shorter than 5 minutes are totally ignored (no earnings)
          //  • Sessions of 5 minutes or more: charge the FULL duration (seconds-precise)
          let calculatedPrice: number | null = null;
          if (b.status === "completed" && hourlyRate > 0) {
            const durationInMinutes = actualSeconds != null && actualSeconds > 0
              ? actualSeconds / 60
              : actualDuration && actualDuration > 0
                ? actualDuration
                : b.duration_minutes;

            if (durationInMinutes >= 5) {
              calculatedPrice = Math.round((hourlyRate / 60) * durationInMinutes * 10) / 10;
            } else {
              calculatedPrice = 0;
            }
          }

          return {
            booking_id: b.id,
            student_name: studentMap.get(b.student_id) || "غير معروف",
            subject_name: b.subject_id ? (subjectMap.get(b.subject_id) || "عامة") : "عامة",
            scheduled_at: b.scheduled_at,
            started_at: session?.started_at || null,
            duration_minutes: b.duration_minutes,
            actual_duration: actualDuration,
            actual_seconds: actualSeconds,
            status: b.status,
            price: calculatedPrice,
          };
        });

        // Sort sessions by date descending
        sessions.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

        return {
          id: tp.id,
          user_id: tp.user_id,
          full_name: profile?.full_name || "بدون اسم",
          avatar_url: profile?.avatar_url || null,
          avg_rating: Number(tp.avg_rating) || 0,
          total_reviews: tp.total_reviews || 0,
          total_sessions: tp.total_sessions || 0,
          is_approved: tp.is_approved || false,
          sessions,
          totalMinutes: totalActualMinutes,
          totalHours: Math.round((totalActualMinutes / 60) * 10) / 10,
          totalSeconds: totalActualSeconds,
          studentsCount: uniqueStudents.size,
          completedCount: completedBookings.length,
          cancelledCount: cancelledBookings.length,
          totalPrice: sessions.filter(s => s.status === "completed").reduce((sum, s) => sum + (s.price || 0), 0),
          aiReport: null,
          aiReportLoading: false,
        };
      });

      // Sort by total hours descending
      teacherData.sort((a, b) => b.totalMinutes - a.totalMinutes);
      setTeachers(teacherData);
    } catch (e) {
      console.error("Error fetching teacher performance:", e);
      toast.error("حدث خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const generateAIReport = async (teacher: TeacherData) => {
    setTeachers(prev => prev.map(t => t.id === teacher.id ? { ...t, aiReportLoading: true } : t));

    try {
      const { data, error } = await supabase.functions.invoke("teacher-performance-report", {
        body: {
          teacher_name: teacher.full_name,
          total_hours: teacher.totalHours,
          total_sessions: teacher.completedCount,
          cancelled_sessions: teacher.cancelledCount,
          students_count: teacher.studentsCount,
          avg_rating: teacher.avg_rating,
          total_reviews: teacher.total_reviews,
          sessions: teacher.sessions.slice(0, 20).map(s => ({
            student: s.student_name,
            subject: s.subject_name,
            date: s.scheduled_at,
            duration: s.actual_duration || s.duration_minutes,
            status: s.status,
          })),
        },
      });

      if (error) throw error;
      setTeachers(prev => prev.map(t => t.id === teacher.id ? { ...t, aiReport: data.report, aiReportLoading: false } : t));
    } catch {
      toast.error("تعذر إنشاء التقرير");
      setTeachers(prev => prev.map(t => t.id === teacher.id ? { ...t, aiReportLoading: false } : t));
    }
  };

  const filterByDate = (sessions: SessionDetail[]) => {
    return sessions.filter(s => {
      const d = new Date(s.scheduled_at);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });
  };

  const filteredTeachers = teachers
    .filter(t => t.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .map(t => {
      if (!dateFrom && !dateTo) return t;
      const filteredSessions = filterByDate(t.sessions);
      const completedFiltered = filteredSessions.filter(s => s.status === "completed");
      const totalMin = completedFiltered.reduce((sum, s) => sum + (s.actual_duration || 0), 0);
      const totalSec = completedFiltered.reduce((sum, s) => sum + (s.actual_seconds || 0), 0);
      return {
        ...t,
        sessions: filteredSessions,
        completedCount: completedFiltered.length,
        cancelledCount: filteredSessions.filter(s => s.status === "cancelled").length,
        totalMinutes: totalMin,
        totalHours: Math.round((totalMin / 60) * 10) / 10,
        totalSeconds: totalSec,
        studentsCount: new Set(completedFiltered.map(s => s.student_name)).size,
        totalPrice: completedFiltered.reduce((sum, s) => sum + (s.price || 0), 0),
      };
    })
    .filter(t => {
      // When date filter is active, hide teachers with no matching sessions
      if (dateFrom || dateTo) return t.sessions.length > 0;
      return true;
    });


  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-secondary" />
              أداء المعلمين ({filteredTeachers.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-56">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 rounded-xl h-8 text-xs"
                />
              </div>
              <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
              <ExportCSVButton
                data={filteredTeachers.map(t => ({
                  name: t.full_name,
                  hours: t.totalHours,
                  sessions: t.completedCount,
                  cancelled: t.cancelledCount,
                  students: t.studentsCount,
                  rating: t.avg_rating,
                  reviews: t.total_reviews,
                }))}
                headers={[
                  { key: "name", label: "المعلم" },
                  { key: "hours", label: "الساعات الفعلية" },
                  { key: "sessions", label: "الحصص المكتملة" },
                  { key: "cancelled", label: "الحصص الملغاة" },
                  { key: "students", label: "عدد الطلاب" },
                  { key: "rating", label: "التقييم" },
                  { key: "reviews", label: "المراجعات" },
                ]}
                filename="أداء_المعلمين"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTeachers.length === 0 ? (
            <div className="text-center py-12">
              <GraduationCap className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">لا يوجد معلمين</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTeachers.map((teacher) => (
                <div key={teacher.id} className="border border-border rounded-2xl overflow-hidden">
                  {/* Teacher Summary Row */}
                  <button
                    onClick={() => setExpandedTeacher(expandedTeacher === teacher.id ? null : teacher.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                        {teacher.avatar_url ? (
                          <img src={teacher.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <GraduationCap className="h-5 w-5 text-secondary" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground">{teacher.full_name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(teacher.totalSeconds)}
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {teacher.completedCount} حصة
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {teacher.studentsCount} طالب
                          </span>
                          {teacher.avg_rating > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-yellow-500" />
                              {teacher.avg_rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-primary/10 text-primary border-0 text-xs font-mono">
                        {formatDuration(teacher.totalSeconds)}
                      </Badge>
                      {expandedTeacher === teacher.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {expandedTeacher === teacher.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                          {/* Stats Grid */}
                          {(() => {
                            const fs = sessionFilterStats[teacher.id];
                            const displayStats = {
                              totalSeconds: fs ? fs.totalSeconds : teacher.totalSeconds,
                              completedCount: fs ? fs.completedCount : teacher.completedCount,
                              cancelledCount: fs ? fs.cancelledCount : teacher.cancelledCount,
                              studentsCount: fs ? fs.studentsCount : teacher.studentsCount,
                              totalPrice: fs ? fs.totalPrice : teacher.totalPrice,
                              rating: teacher.avg_rating > 0 ? `${teacher.avg_rating.toFixed(1)} (${teacher.total_reviews})` : "—",
                            };
                            return (
                              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                {[
                                  { label: "المدة الفعلية", value: formatDuration(displayStats.totalSeconds), icon: Clock, color: "text-primary" },
                                  { label: "حصص مكتملة", value: displayStats.completedCount, icon: BookOpen, color: "text-green-600" },
                                  { label: "حصص ملغاة", value: displayStats.cancelledCount, icon: BookOpen, color: "text-destructive" },
                                  { label: "عدد الطلاب", value: displayStats.studentsCount, icon: Users, color: "text-secondary" },
                                  { label: "إجمالي السعر", value: `${Math.round(displayStats.totalPrice * 10) / 10} ر.س`, icon: DollarSign, color: "text-green-600" },
                                  { label: "التقييم", value: displayStats.rating, icon: Star, color: "text-yellow-500" },
                                ].map((stat, i) => (
                                  <div key={i} className="bg-muted/40 rounded-xl p-3 text-center">
                                    <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
                                    <p className="text-lg font-black text-foreground">{stat.value}</p>
                                    <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* AI Report */}
                          <div className="bg-accent/20 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-bold text-sm flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-yellow-500" />
                                تقرير أداء بالذكاء الاصطناعي
                              </h4>
                              {!teacher.aiReport && (
                                <Button
                                  size="sm"
                                  onClick={() => generateAIReport(teacher)}
                                  disabled={teacher.aiReportLoading}
                                  className="rounded-xl text-xs h-8 gap-1.5"
                                >
                                  {teacher.aiReportLoading ? (
                                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري الإنشاء...</>
                                  ) : (
                                    <><Sparkles className="h-3.5 w-3.5" /> إنشاء تقرير</>
                                  )}
                                </Button>
                              )}
                            </div>
                            {teacher.aiReport ? (
                              <div className="prose prose-sm text-foreground whitespace-pre-wrap text-sm leading-relaxed bg-background/60 rounded-xl p-4">
                                {teacher.aiReport}
                              </div>
                            ) : !teacher.aiReportLoading ? (
                              <p className="text-xs text-muted-foreground">اضغط على "إنشاء تقرير" للحصول على تحليل شامل لأداء المعلم</p>
                            ) : null}
                          </div>

                          {/* Sessions List */}
                          <SessionDetailsTable 
                            sessions={teacher.sessions} 
                            onFilteredStatsChange={(stats) => setSessionFilterStats(prev => ({ ...prev, [teacher.id]: stats }))}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
