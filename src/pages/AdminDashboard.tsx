import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users, BookOpen, DollarSign, TrendingUp, Search,
  CheckCircle, XCircle, Eye, Shield, BarChart3, Clock,
  UserCheck, UserX, GraduationCap, AlertTriangle, ShieldAlert, FileWarning, Trash2, Settings, MessageSquare
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import SiteSettingsTab from "@/components/admin/SiteSettingsTab";
import PlansManagementTab from "@/components/admin/PlansManagementTab";
import WithdrawalRequestsTab from "@/components/admin/WithdrawalRequestsTab";
import TeacherPaymentsTab from "@/components/admin/TeacherPaymentsTab";
import SupportTicketsTab from "@/components/admin/SupportTicketsTab";
import DateFilter from "@/components/admin/DateFilter";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

const AdminDashboard = () => {
  const { user, roles: currentUserRoles } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, teachers: 0, bookings: 0, revenue: 0, violations: 0, pendingTeachers: 0, completedSessions: 0, cancelledBookings: 0 });
  const [pendingTeachers, setPendingTeachers] = useState<any[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userRolesMap, setUserRolesMap] = useState<Map<string, string>>(new Map());
  const [violations, setViolations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [monthlyBookings, setMonthlyBookings] = useState<any[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<any[]>([]);
  const [bookingStatusData, setBookingStatusData] = useState<any[]>([]);
  const [badgeCounts, setBadgeCounts] = useState({ withdrawals: 0, support: 0, pendingBookings: 0, unreviewed: 0 });
  const [activeTab, setActiveTab] = useState("overview");
  const [teacherDateFrom, setTeacherDateFrom] = useState("");
  const [teacherDateTo, setTeacherDateTo] = useState("");
  const [bookingDateFrom, setBookingDateFrom] = useState("");
  const [bookingDateTo, setBookingDateTo] = useState("");
  const [violationDateFrom, setViolationDateFrom] = useState("");
  const [violationDateTo, setViolationDateTo] = useState("");
  // Verify admin access
  useEffect(() => {
    if (!currentUserRoles.includes("admin")) {
      navigate("/login");
    }
  }, [currentUserRoles, navigate]);

  const fetchBadgeCounts = async () => {
    const [withdrawalsRes, supportRes, pendingBookingsRes, unreviewedRes] = await Promise.all([
      supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
      (supabase as any).from("violations").select("id", { count: "exact", head: true }).eq("is_reviewed", false),
    ]);
    setBadgeCounts({
      withdrawals: withdrawalsRes.count ?? 0,
      support: supportRes.count ?? 0,
      pendingBookings: pendingBookingsRes.count ?? 0,
      unreviewed: unreviewedRes.count ?? 0,
    });
  };

  useEffect(() => {
    fetchData();

    const channels = [
      supabase.channel("admin-withdrawals").on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, () => fetchBadgeCounts()),
      supabase.channel("admin-support").on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchBadgeCounts()),
      supabase.channel("admin-bookings").on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchBadgeCounts()),
      supabase.channel("admin-violations").on("postgres_changes", { event: "*", schema: "public", table: "violations" }, () => fetchBadgeCounts()),
    ];
    channels.forEach(ch => ch.subscribe());

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profilesRes, teachersRes, bookingsRes, paymentsRes, violationsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("teacher_profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("payment_records").select("amount, created_at").eq("status", "completed"),
        (supabase as any).from("violations").select("id", { count: "exact", head: true }),
      ]);

      // Real bookings data for charts
      const { data: allBookingsData } = await supabase.from("bookings").select("created_at, status, price");
      
      // Build monthly bookings chart
      const monthMap = new Map<string, { bookings: number; revenue: number }>();
      const arabicMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      
      (allBookingsData ?? []).forEach(b => {
        const d = new Date(b.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const existing = monthMap.get(key) || { bookings: 0, revenue: 0 };
        existing.bookings += 1;
        existing.revenue += Number(b.price || 0);
        monthMap.set(key, existing);
      });

      // Also add payment revenue
      (paymentsRes.data ?? []).forEach((p: any) => {
        const d = new Date(p.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const existing = monthMap.get(key) || { bookings: 0, revenue: 0 };
        existing.revenue += Number(p.amount || 0);
        monthMap.set(key, existing);
      });

      const sortedMonths = [...monthMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([key, val]) => {
          const monthIdx = parseInt(key.split("-")[1]);
          return { name: arabicMonths[monthIdx], حجوزات: val.bookings, إيرادات: Math.round(val.revenue) };
        });
      setMonthlyBookings(sortedMonths);

      // Booking status distribution
      const statusCount = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
      (allBookingsData ?? []).forEach(b => {
        if (b.status in statusCount) statusCount[b.status as keyof typeof statusCount]++;
      });
      setBookingStatusData([
        { name: "معلقة", value: statusCount.pending },
        { name: "مؤكدة", value: statusCount.confirmed },
        { name: "مكتملة", value: statusCount.completed },
        { name: "ملغاة", value: statusCount.cancelled },
      ].filter(d => d.value > 0));

      const revenue = (paymentsRes.data ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const pendingCount = (allBookingsData ?? []).filter(b => b.status === "pending").length;
      const completedCount = statusCount.completed;
      const cancelledCount = statusCount.cancelled;

      setStats({
        users: profilesRes.count ?? 0,
        teachers: teachersRes.count ?? 0,
        bookings: bookingsRes.count ?? 0,
        revenue,
        violations: violationsRes.count ?? 0,
        pendingTeachers: 0,
        completedSessions: completedCount,
        cancelledBookings: cancelledCount,
      });

      // Pending teachers
      const { data: pendingRaw } = await supabase
        .from("teacher_profiles")
        .select("*")
        .eq("is_approved", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (pendingRaw) {
        const userIds = pendingRaw.map(t => t.user_id);
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url, phone").in("user_id", userIds);
          const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
          setPendingTeachers(pendingRaw.map(t => ({ ...t, profile: profileMap.get(t.user_id) })));
        } else {
          setPendingTeachers([]);
        }
        setStats(prev => ({ ...prev, pendingTeachers: pendingRaw.length }));
      }

      // Recent bookings with user names
      const { data: bookings } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (bookings && bookings.length > 0) {
        const studentIds = [...new Set(bookings.map(b => b.student_id))];
        const teacherIds = [...new Set(bookings.map(b => b.teacher_id))];
        const allIds = [...new Set([...studentIds, ...teacherIds])];
        const { data: bProfiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", allIds);
        const nameMap = new Map((bProfiles ?? []).map(p => [p.user_id, p.full_name]));
        setRecentBookings(bookings.map(b => ({ ...b, student_name: nameMap.get(b.student_id) || "—", teacher_name: nameMap.get(b.teacher_id) || "—" })));
      } else {
        setRecentBookings([]);
      }

      // All users with roles
      const { data: users } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setAllUsers(users ?? []);

      if (users && users.length > 0) {
        const uids = users.map(u => u.user_id);
        const { data: rolesData } = await supabase.from("user_roles").select("user_id, role").in("user_id", uids);
        const rMap = new Map((rolesData ?? []).map(r => [r.user_id, r.role]));
        setUserRolesMap(rMap);
      }

      // Violations
      const { data: viol } = await (supabase as any)
        .from("violations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (viol) {
        const vUserIds = [...new Set((viol as any[]).map((v: any) => v.user_id))] as string[];
        if (vUserIds.length > 0) {
          const { data: vProfiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", vUserIds);
          const vMap = new Map((vProfiles ?? []).map(p => [p.user_id, p.full_name]));
          setViolations(viol.map((v: any) => ({ ...v, user_name: vMap.get(v.user_id) || "غير معروف" })));
        } else {
          setViolations([]);
        }
      }

      // Fetch badge counts
      await fetchBadgeCounts();


    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const approveTeacher = async (teacherId: string) => {
    const { error } = await supabase
      .from("teacher_profiles")
      .update({ is_approved: true, is_verified: true })
      .eq("id", teacherId);
    if (error) { 
      console.error("Approve teacher error:", error);
      toast.error("حدث خطأ: " + error.message); 
      return; 
    }
    toast.success("تمت الموافقة على المعلم!");
    setPendingTeachers(prev => prev.filter(t => t.id !== teacherId));
    setStats(prev => ({ ...prev, pendingTeachers: Math.max(0, prev.pendingTeachers - 1) }));
  };

  const rejectTeacher = async (teacherId: string, userId: string) => {
    await supabase.from("teacher_profiles").delete().eq("id", teacherId);
    await supabase.from("user_roles").update({ role: "student" as any }).eq("user_id", userId);
    toast.success("تم رفض طلب المعلم");
    setPendingTeachers(prev => prev.filter(t => t.id !== teacherId));
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
    if (error) { toast.error("حدث خطأ في تغيير الدور"); return; }
    setUserRolesMap(prev => new Map(prev).set(userId, newRole));
    if (newRole === "teacher") {
      await supabase.from("teacher_profiles").upsert({ user_id: userId, hourly_rate: 0, is_approved: true }, { onConflict: "user_id" });
    }
    toast.success("تم تغيير الدور بنجاح");
  };

  const deleteUser = async (userId: string) => {
    // Remove from profiles and user_roles (cascading handled by DB)
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("teacher_profiles").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("user_id", userId);
    setAllUsers(prev => prev.filter(u => u.user_id !== userId));
    toast.success("تم حذف بيانات المستخدم");
  };

  const pieData = [
    { name: "طلاب", value: Math.max(0, stats.users - stats.teachers) },
    { name: "معلمين", value: stats.teachers },
  ];

  const filteredUsers = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.phone?.includes(searchQuery)
  );

  const filterByDate = (items: any[], dateFrom: string, dateTo: string) => {
    return items.filter(item => {
      const created = new Date(item.created_at);
      if (dateFrom && created < new Date(dateFrom)) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (created > end) return false;
      }
      return true;
    });
  };

  const filteredTeachers = filterByDate(pendingTeachers, teacherDateFrom, teacherDateTo);
  const filteredBookings = filterByDate(recentBookings, bookingDateFrom, bookingDateTo);
  const filteredViolations = filterByDate(violations, violationDateFrom, violationDateTo);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground">إدارة المنصة التعليمية</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "المستخدمين", value: stats.users, icon: Users, color: "text-primary" },
            { label: "المعلمين", value: stats.teachers, icon: GraduationCap, color: "text-secondary" },
            { label: "الحجوزات", value: stats.bookings, icon: BookOpen, color: "text-accent-foreground" },
            { label: "الإيرادات", value: `${stats.revenue} ر.س`, icon: DollarSign, color: "text-green-600" },
          ].map((s, i) => (
            <Card key={i} className="border-0 shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                </div>
                <p className="text-2xl font-black text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview" value={activeTab} onValueChange={(val) => {
          setActiveTab(val);
          // Clear badge counts when opening relevant tabs
          if (val === "withdrawals") setBadgeCounts(prev => ({ ...prev, withdrawals: 0 }));
          if (val === "support") setBadgeCounts(prev => ({ ...prev, support: 0 }));
          if (val === "bookings") setBadgeCounts(prev => ({ ...prev, pendingBookings: 0 }));
          if (val === "violations") setBadgeCounts(prev => ({ ...prev, unreviewed: 0 }));
        }} className="space-y-4">
          <TabsList className="bg-muted rounded-xl p-1 w-full md:w-auto flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="rounded-lg gap-1.5">
              <BarChart3 className="h-4 w-4" />
              نظرة عامة
            </TabsTrigger>
            <TabsTrigger value="teachers" className="rounded-lg gap-1.5">
              <UserCheck className="h-4 w-4" />
              طلبات المعلمين
              {pendingTeachers.length > 0 && (
                <Badge variant="destructive" className="mr-1 text-[10px] px-1.5 py-0">{pendingTeachers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-lg gap-1.5">
              <Users className="h-4 w-4" />
              المستخدمين
            </TabsTrigger>
            <TabsTrigger value="bookings" className="rounded-lg gap-1.5">
              <Clock className="h-4 w-4" />
              الحجوزات
              {badgeCounts.pendingBookings > 0 && (
                <Badge variant="destructive" className="mr-1 text-[10px] px-1.5 py-0">{badgeCounts.pendingBookings}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="violations" className="rounded-lg gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              المخالفات
              {badgeCounts.unreviewed > 0 && (
                <Badge variant="destructive" className="mr-1 text-[10px] px-1.5 py-0">{badgeCounts.unreviewed}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="plans" className="rounded-lg gap-1.5">
              <DollarSign className="h-4 w-4" />
              الباقات
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="rounded-lg gap-1.5">
              <DollarSign className="h-4 w-4" />
              سحب الأرباح
              {badgeCounts.withdrawals > 0 && (
                <Badge variant="destructive" className="mr-1 text-[10px] px-1.5 py-0">{badgeCounts.withdrawals}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="teacher_payments" className="rounded-lg gap-1.5">
              <DollarSign className="h-4 w-4" />
              المدفوعات
            </TabsTrigger>
            <TabsTrigger value="site" className="rounded-lg gap-1.5">
              <Settings className="h-4 w-4" />
              المحتوى
            </TabsTrigger>
            <TabsTrigger value="support" className="rounded-lg gap-1.5">
              <MessageSquare className="h-4 w-4" />
              الدعم الفني
              {badgeCounts.support > 0 && (
                <Badge variant="destructive" className="mr-1 text-[10px] px-1.5 py-0">{badgeCounts.support}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Extra stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "طلبات معلمين معلقة", value: stats.pendingTeachers, icon: UserCheck, color: "text-orange-500" },
                { label: "حصص مكتملة", value: stats.completedSessions, icon: CheckCircle, color: "text-green-600" },
                { label: "حجوزات ملغاة", value: stats.cancelledBookings, icon: XCircle, color: "text-destructive" },
                { label: "المخالفات", value: stats.violations, icon: ShieldAlert, color: "text-destructive" },
              ].map((s, i) => (
                <Card key={i} className="border-0 shadow-card">
                  <CardContent className="p-4">
                    <s.icon className={`h-5 w-5 ${s.color} mb-2`} />
                    <p className="text-2xl font-black text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">الحجوزات والإيرادات الشهرية</CardTitle>
                </CardHeader>
                <CardContent>
                  {monthlyBookings.length === 0 ? (
                    <p className="text-center py-12 text-muted-foreground">لا توجد بيانات بعد</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={monthlyBookings}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="حجوزات" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="إيرادات" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">توزيع المستخدمين</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {bookingStatusData.length > 0 && (
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">حالة الحجوزات</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={bookingStatusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {bookingStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Teachers Tab */}
          <TabsContent value="teachers" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-secondary" />
                    طلبات تسجيل المعلمين ({filteredTeachers.length})
                  </CardTitle>
                  <DateFilter dateFrom={teacherDateFrom} dateTo={teacherDateTo} onDateFromChange={setTeacherDateFrom} onDateToChange={setTeacherDateTo} />
                </div>
              </CardHeader>
              <CardContent>
                {filteredTeachers.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">لا توجد طلبات معلقة</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTeachers.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                            <GraduationCap className="h-5 w-5 text-secondary" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-sm">{t.profile?.full_name || "بدون اسم"}</p>
                            <p className="text-xs text-muted-foreground">{t.profile?.phone || "لا يوجد رقم"}</p>
                            <p className="text-xs text-muted-foreground">خبرة: {t.years_experience || 0} سنوات</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-lg bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => approveTeacher(t.id)}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            موافقة
                          </Button>
                          <Button size="sm" variant="destructive" className="rounded-lg gap-1" onClick={() => rejectTeacher(t.id, t.user_id)}>
                            <XCircle className="h-3.5 w-3.5" />
                            رفض
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold">إدارة المستخدمين ({filteredUsers.length})</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالاسم أو الرقم..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10 rounded-xl h-9 text-sm"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-right pb-3 font-medium">الاسم</th>
                        <th className="text-right pb-3 font-medium">الهاتف</th>
                        <th className="text-right pb-3 font-medium">الدور</th>
                        <th className="text-right pb-3 font-medium">المستوى</th>
                        <th className="text-right pb-3 font-medium">التسجيل</th>
                        <th className="text-right pb-3 font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredUsers.map((u) => {
                        const userRole = userRolesMap.get(u.user_id) || "student";
                        const isCurrentUser = u.user_id === user?.id;
                        return (
                          <tr key={u.id} className="hover:bg-muted/30">
                            <td className="py-3 font-medium text-foreground">{u.full_name || "—"}</td>
                            <td className="py-3 text-muted-foreground" dir="ltr">{u.phone || "—"}</td>
                            <td className="py-3">
                              <Select
                                value={userRole}
                                onValueChange={(val) => changeUserRole(u.user_id, val)}
                                disabled={isCurrentUser}
                              >
                                <SelectTrigger className="h-8 w-28 text-xs rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="student">طالب</SelectItem>
                                  <SelectItem value="teacher">معلم</SelectItem>
                                  <SelectItem value="admin">مسؤول</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-3">
                              <Badge variant="outline" className="text-xs">{u.level || "bronze"}</Badge>
                            </td>
                            <td className="py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString("ar-SA")}</td>
                            <td className="py-3">
                              {!isCurrentUser && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    if (window.confirm(`هل أنت متأكد من حذف بيانات ${u.full_name}؟`)) {
                                      deleteUser(u.user_id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base font-bold">آخر الحجوزات ({filteredBookings.length})</CardTitle>
                  <DateFilter dateFrom={bookingDateFrom} dateTo={bookingDateTo} onDateFromChange={setBookingDateFrom} onDateToChange={setBookingDateTo} />
                </div>
              </CardHeader>
              <CardContent>
                {filteredBookings.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">لا توجد حجوزات بعد</p>
                ) : (
                  <div className="space-y-3">
                    {filteredBookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                        <div>
                          <p className="font-medium text-sm text-foreground">
                            {b.student_name} ← {b.teacher_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(b.scheduled_at).toLocaleDateString("ar-SA")} • {b.duration_minutes} دقيقة
                            {b.price ? ` • ${b.price} ر.س` : ""}
                          </p>
                        </div>
                        <Badge variant={b.status === "completed" ? "default" : b.status === "confirmed" ? "secondary" : "outline"} className="text-xs">
                          {b.status === "completed" ? "مكتملة" : b.status === "confirmed" ? "مؤكدة" : b.status === "cancelled" ? "ملغاة" : "معلقة"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Violations Tab */}
          <TabsContent value="violations" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  المخالفات المكتشفة ({violations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {violations.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="font-bold text-foreground mb-1">لا توجد مخالفات</p>
                    <p className="text-sm text-muted-foreground">النظام يراقب المحادثات تلقائياً</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {violations.map((v: any) => (
                      <div key={v.id} className={`p-4 rounded-xl border ${v.is_false_positive ? "bg-muted/20 border-border" : v.is_reviewed ? "bg-muted/30 border-border" : "bg-destructive/5 border-destructive/20"}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={`h-4 w-4 ${v.is_false_positive ? "text-muted-foreground" : "text-destructive"}`} />
                            <span className="font-bold text-sm text-foreground">{v.user_name}</span>
                            <Badge variant={v.is_false_positive ? "outline" : "destructive"} className="text-[10px]">
                              {v.is_false_positive ? "إيجابي كاذب" : v.violation_type === "contact_sharing" ? "مشاركة أرقام" : v.violation_type === "platform_mention" ? "ذكر منصة" : "مخالفة"}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(v.created_at).toLocaleDateString("ar-SA")} {new Date(v.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-sm bg-muted/50 rounded-lg p-2 mb-2 text-foreground">{v.original_message || v.detected_text}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>المصدر: {v.source === "chat" ? "الدردشة" : v.source === "recording" ? "التسجيل" : v.source}</span>
                            <span>الثقة: {Math.round((v.confidence_score || 0) * 100)}%</span>
                          </div>
                          <div className="flex gap-2">
                            {!v.is_reviewed && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 rounded-lg"
                                  onClick={async () => {
                                    await (supabase as any).from("violations").update({ is_reviewed: true, is_false_positive: true, reviewed_by: user?.id }).eq("id", v.id);
                                    setViolations(prev => prev.map(item => item.id === v.id ? { ...item, is_reviewed: true, is_false_positive: true } : item));
                                    toast.success("تم التحديد كإيجابي كاذب");
                                  }}
                                >
                                  إيجابي كاذب
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="text-xs h-7 rounded-lg"
                                  onClick={async () => {
                                    await (supabase as any).from("violations").update({ is_reviewed: true, is_false_positive: false, reviewed_by: user?.id }).eq("id", v.id);
                                    setViolations(prev => prev.map(item => item.id === v.id ? { ...item, is_reviewed: true, is_false_positive: false } : item));
                                    toast.success("تم تأكيد المخالفة");
                                  }}
                                >
                                  تأكيد المخالفة
                                </Button>
                              </>
                            )}
                            {v.is_reviewed && (
                              <Badge variant="outline" className="text-[10px]">
                                <CheckCircle className="h-3 w-3 ml-1" />
                                تمت المراجعة
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Plans Tab */}
          <TabsContent value="plans" className="space-y-4">
            <PlansManagementTab />
          </TabsContent>

          {/* Withdrawal Requests Tab */}
          <TabsContent value="withdrawals" className="space-y-4">
            <WithdrawalRequestsTab />
          </TabsContent>

          {/* Teacher Payments Tab */}
          <TabsContent value="teacher_payments" className="space-y-4">
            <TeacherPaymentsTab />
          </TabsContent>

          {/* Site Content Tab */}
          <TabsContent value="site" className="space-y-4">
            <SiteSettingsTab />
          </TabsContent>

          {/* Support Tickets Tab */}
          <TabsContent value="support" className="space-y-4">
            <SupportTicketsTab />
          </TabsContent>
        </Tabs>
      </div>
      <BottomNav />
    </div>
  );
};

export default AdminDashboard;
