import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users, BookOpen, DollarSign, TrendingUp, Search,
  CheckCircle, XCircle, Shield, BarChart3, Clock,
  UserCheck, GraduationCap, AlertTriangle, ShieldAlert, FileWarning, FileText, Trash2, Settings,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import AdminSidebar from "@/components/admin/AdminSidebar";
import SiteSettingsTab from "@/components/admin/SiteSettingsTab";
import PlansManagementTab from "@/components/admin/PlansManagementTab";
import WithdrawalRequestsTab from "@/components/admin/WithdrawalRequestsTab";
import TeacherPaymentsTab from "@/components/admin/TeacherPaymentsTab";
import SupportTicketsTab from "@/components/admin/SupportTicketsTab";
import DateFilter from "@/components/admin/DateFilter";
import ExportCSVButton from "@/components/admin/ExportCSVButton";
import StatusFilter from "@/components/admin/StatusFilter";
import CouponsManagementTab from "@/components/admin/CouponsManagementTab";
import TeacherPerformanceTab from "@/components/admin/TeacherPerformanceTab";
import UserManagementTab from "@/components/admin/UserManagementTab";
import SessionReportsTab from "@/components/admin/SessionReportsTab";
import AIAuditTab from "@/components/admin/AIAuditTab";
import TeacherEarningsTab from "@/components/admin/TeacherEarningsTab";
import MaterialsMonitorTab from "@/components/admin/MaterialsMonitorTab";
import SessionPricingTab from "@/components/admin/SessionPricingTab";
import AdminNotificationsTab from "@/components/admin/AdminNotificationsTab";
import WalletsManagementTab from "@/components/admin/WalletsManagementTab";
import CallTranscriptsTab from "@/components/admin/CallTranscriptsTab";
import ViolationsTab from "@/components/admin/ViolationsTab";
import SessionsStatusTab from "@/components/admin/SessionsStatusTab";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Lock } from "lucide-react";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

const TAB_TITLES: Record<string, string> = {
  overview: "نظرة عامة",
  users: "إدارة المستخدمين",
  teachers: "طلبات تسجيل المعلمين",
  teacher_performance: "أداء المعلمين",
  bookings: "إدارة الحجوزات",
  sessions_status: "حالات الجلسات",
  session_reports: "تقارير الحصص",
  session_pricing: "أسعار الحصص",
  materials_monitor: "مراقبة المواد",
  plans: "إدارة الباقات",
  coupons: "إدارة الكوبونات",
  withdrawals: "طلبات سحب الأرباح",
  teacher_payments: "سجل المدفوعات",
  teacher_earnings: "الأرباح اليدوية",
  violations: "المخالفات المكتشفة",
  call_transcripts: "تفريغ المكالمات الهاتفية",
  ai_audit: "فحص الذكاء الاصطناعي",
  site: "إدارة المحتوى",
  support: "الدعم الفني",
  admin_notifications: "مركز الإشعارات",
  wallets: "المحافظ والمكالمات",
};

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const access = useAdminPermissions();
  const [stats, setStats] = useState({ users: 0, teachers: 0, bookings: 0, revenue: 0, violations: 0, pendingTeachers: 0, completedSessions: 0, cancelledBookings: 0 });
  const [pendingTeachers, setPendingTeachers] = useState<any[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [violationSearchQuery, setViolationSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [monthlyBookings, setMonthlyBookings] = useState<any[]>([]);
  const [bookingStatusData, setBookingStatusData] = useState<any[]>([]);
  const [badgeCounts, setBadgeCounts] = useState({ withdrawals: 0, support: 0, pendingBookings: 0, unreviewed: 0 });
  const [seenTimestamps, setSeenTimestamps] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("admin_seen_tabs") || "{}"); } catch { return {}; }
  });
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");

  // Sync tab when ?tab= changes (e.g. from a notification link)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setActiveTab(t);
  }, [searchParams]);
  const [teacherDateFrom, setTeacherDateFrom] = useState("");
  const [teacherDateTo, setTeacherDateTo] = useState("");
  const [bookingDateFrom, setBookingDateFrom] = useState("");
  const [bookingDateTo, setBookingDateTo] = useState("");
  const [violationDateFrom, setViolationDateFrom] = useState("");
  const [violationDateTo, setViolationDateTo] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [violationStatusFilter, setViolationStatusFilter] = useState("all");
  const [adminVerified, setAdminVerified] = useState(false);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    const verifyAdmin = async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!data) { navigate("/login"); } else { setAdminVerified(true); }
    };
    verifyAdmin();
  }, [user, navigate]);

  const fetchBadgeCounts = async () => {
    const ts = seenTimestamps;
    let withdrawalsQuery = supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (ts.withdrawals) withdrawalsQuery = withdrawalsQuery.gt("created_at", ts.withdrawals);
    let supportQuery = supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open");
    if (ts.support) supportQuery = supportQuery.gt("created_at", ts.support);
    let bookingsQuery = supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (ts.bookings) bookingsQuery = bookingsQuery.gt("created_at", ts.bookings);
    let violationsQuery = (supabase as any).from("violations").select("id", { count: "exact", head: true }).eq("is_reviewed", false);
    if (ts.violations) violationsQuery = violationsQuery.gt("created_at", ts.violations);
    const [withdrawalsRes, supportRes, pendingBookingsRes, unreviewedRes] = await Promise.all([withdrawalsQuery, supportQuery, bookingsQuery, violationsQuery]);
    setBadgeCounts({ withdrawals: withdrawalsRes.count ?? 0, support: supportRes.count ?? 0, pendingBookings: pendingBookingsRes.count ?? 0, unreviewed: unreviewedRes.count ?? 0 });
  };

  const markTabSeen = (tabKey: string) => {
    const now = new Date().toISOString();
    const updated = { ...seenTimestamps, [tabKey]: now };
    setSeenTimestamps(updated);
    localStorage.setItem("admin_seen_tabs", JSON.stringify(updated));
  };

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    if (val === "withdrawals") { markTabSeen("withdrawals"); setBadgeCounts(prev => ({ ...prev, withdrawals: 0 })); }
    if (val === "support") { markTabSeen("support"); setBadgeCounts(prev => ({ ...prev, support: 0 })); }
    if (val === "bookings") { markTabSeen("bookings"); setBadgeCounts(prev => ({ ...prev, pendingBookings: 0 })); }
    if (val === "violations") { markTabSeen("violations"); setBadgeCounts(prev => ({ ...prev, unreviewed: 0 })); }
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

      const { data: allBookingsData } = await supabase.from("bookings").select("created_at, status, price");
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
      (paymentsRes.data ?? []).forEach((p: any) => {
        const d = new Date(p.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const existing = monthMap.get(key) || { bookings: 0, revenue: 0 };
        existing.revenue += Number(p.amount || 0);
        monthMap.set(key, existing);
      });
      const sortedMonths = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([key, val]) => {
        const monthIdx = parseInt(key.split("-")[1]);
        return { name: arabicMonths[monthIdx], حجوزات: val.bookings, إيرادات: Math.round(val.revenue) };
      });
      setMonthlyBookings(sortedMonths);

      const statusCount = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
      (allBookingsData ?? []).forEach(b => { if (b.status in statusCount) statusCount[b.status as keyof typeof statusCount]++; });
      setBookingStatusData([
        { name: "معلقة", value: statusCount.pending }, { name: "مؤكدة", value: statusCount.confirmed },
        { name: "مكتملة", value: statusCount.completed }, { name: "ملغاة", value: statusCount.cancelled },
      ].filter(d => d.value > 0));

      const revenue = (paymentsRes.data ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      setStats({
        users: profilesRes.count ?? 0, teachers: teachersRes.count ?? 0, bookings: bookingsRes.count ?? 0,
        revenue, violations: violationsRes.count ?? 0, pendingTeachers: 0, completedSessions: statusCount.completed, cancelledBookings: statusCount.cancelled,
      });

      // Pending teachers
      const { data: pendingRaw } = await supabase.from("teacher_profiles").select("*").eq("is_approved", false).order("created_at", { ascending: false }).limit(20);
      if (pendingRaw) {
        const userIds = pendingRaw.map(t => t.user_id);
        if (userIds.length > 0) {
          const tpIds = pendingRaw.map(t => t.id);
          const [{ data: profiles }, { data: subjects }, { data: certs }] = await Promise.all([
            supabase.from("profiles").select("user_id, full_name, avatar_url, phone").in("user_id", userIds),
            supabase.from("teacher_subjects").select("teacher_id, subjects(name)").in("teacher_id", tpIds),
            supabase.from("teacher_certificates" as any).select("*").in("teacher_id", userIds),
          ]);
          const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
          const subjectMap = new Map<string, string[]>();
          (subjects ?? []).forEach((s: any) => { const ex = subjectMap.get(s.teacher_id) || []; ex.push(s.subjects?.name || ""); subjectMap.set(s.teacher_id, ex); });
          const certMap = new Map<string, any[]>();
          (certs ?? []).forEach((c: any) => { const ex = certMap.get(c.teacher_id) || []; ex.push(c); certMap.set(c.teacher_id, ex); });
          setPendingTeachers(pendingRaw.map(t => ({ ...t, profile: profileMap.get(t.user_id), subjects: subjectMap.get(t.id) || [], certificates: certMap.get(t.user_id) || [] })));
        } else { setPendingTeachers([]); }
        setStats(prev => ({ ...prev, pendingTeachers: pendingRaw.length }));
      }

      // Recent bookings
      const { data: bookings } = await supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(10);
      if (bookings && bookings.length > 0) {
        const allIds = [...new Set([...bookings.map(b => b.student_id), ...bookings.map(b => b.teacher_id)])];
        const { data: bProfiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", allIds);
        const nameMap = new Map((bProfiles ?? []).map(p => [p.user_id, p.full_name]));
        setRecentBookings(bookings.map(b => ({ ...b, student_name: nameMap.get(b.student_id) || "—", teacher_name: nameMap.get(b.teacher_id) || "—" })));
      } else { setRecentBookings([]); }

      // Violations — enrich with booking, other party, and session recording
      const { data: viol } = await (supabase as any).from("violations").select("*").order("created_at", { ascending: false }).limit(200);
      if (viol && viol.length > 0) {
        const vUserIds = [...new Set((viol as any[]).map((v: any) => v.user_id))] as string[];
        const bookingIds = [...new Set((viol as any[]).map((v: any) => v.booking_id).filter(Boolean))] as string[];

        const [profilesRes2, rolesRes, warningsRes, bookingsForViol, sessionsForViol] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name").in("user_id", vUserIds),
          supabase.from("user_roles").select("user_id, role").in("user_id", vUserIds),
          supabase.from("user_warnings").select("user_id, warning_count, is_banned, banned_until").in("user_id", vUserIds),
          bookingIds.length ? supabase.from("bookings").select("id, student_id, teacher_id, scheduled_at").in("id", bookingIds) : Promise.resolve({ data: [] as any[] }),
          bookingIds.length ? supabase.from("sessions").select("booking_id, recording_url").in("booking_id", bookingIds) : Promise.resolve({ data: [] as any[] }),
        ]);

        // Collect ALL involved user IDs (for "other party" name lookup)
        const otherIds = new Set<string>();
        (bookingsForViol.data ?? []).forEach((b: any) => { otherIds.add(b.student_id); otherIds.add(b.teacher_id); });
        const allIds = [...new Set([...vUserIds, ...otherIds])];
        const { data: allProfiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", allIds);
        const fullNameMap = new Map((allProfiles ?? []).map(p => [p.user_id, p.full_name]));

        const nameMap = new Map((profilesRes2.data ?? []).map(p => [p.user_id, p.full_name]));
        const roleMap = new Map((rolesRes.data ?? []).map(r => [r.user_id, r.role]));
        const warningMap = new Map((warningsRes.data ?? []).map(w => [w.user_id, w]));
        const bookingMap = new Map((bookingsForViol.data ?? []).map((b: any) => [b.id, b]));
        const sessionMap = new Map((sessionsForViol.data ?? []).map((s: any) => [s.booking_id, s]));

        setViolations(viol.map((v: any) => {
          const warning = warningMap.get(v.user_id);
          const booking = v.booking_id ? bookingMap.get(v.booking_id) : null;
          const session = v.booking_id ? sessionMap.get(v.booking_id) : null;
          const otherUserId = booking ? (booking.student_id === v.user_id ? booking.teacher_id : booking.student_id) : null;
          return {
            ...v,
            user_name: nameMap.get(v.user_id) || fullNameMap.get(v.user_id) || "غير معروف",
            user_role: roleMap.get(v.user_id) || "student",
            warning_count: warning?.warning_count || 0,
            is_banned: warning?.is_banned || false,
            banned_until: warning?.banned_until || null,
            other_party_name: otherUserId ? (fullNameMap.get(otherUserId) || null) : null,
            recording_url: session?.recording_url || null,
          };
        }));
      } else { setViolations([]); }
      await fetchBadgeCounts();
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const approveTeacher = async (teacherId: string) => {
    const { error } = await supabase.from("teacher_profiles").update({ is_approved: true, is_verified: true }).eq("id", teacherId);
    if (error) { toast.error("حدث خطأ: " + error.message); return; }
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

  const filterByDate = (items: any[], dateFrom: string, dateTo: string) => {
    return items.filter(item => {
      const created = new Date(item.created_at);
      if (dateFrom && created < new Date(dateFrom)) return false;
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); if (created > end) return false; }
      return true;
    });
  };

  const filteredTeachers = filterByDate(pendingTeachers, teacherDateFrom, teacherDateTo);
  const filteredBookings = filterByDate(recentBookings, bookingDateFrom, bookingDateTo).filter(b => bookingStatusFilter === "all" || b.status === bookingStatusFilter);
  const filteredViolations = filterByDate(violations, violationDateFrom, violationDateTo)
    .filter((v: any) => violationStatusFilter === "all" || (violationStatusFilter === "unreviewed" && !v.is_reviewed) || (violationStatusFilter === "reviewed" && v.is_reviewed && !v.is_false_positive) || (violationStatusFilter === "false_positive" && v.is_false_positive))
    .filter((v: any) => !violationSearchQuery || v.user_name?.toLowerCase().includes(violationSearchQuery.toLowerCase()));

  const pieData = [
    { name: "طلاب", value: Math.max(0, stats.users - stats.teachers) },
    { name: "معلمين", value: stats.teachers },
  ];

  if (loading || !adminVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  // ربط كل تبويب بصلاحيته
  const TAB_PERMISSIONS: Record<string, string> = {
    overview: "view_overview",
    users: "manage_users",
    teachers: "manage_teachers",
    teacher_performance: "view_teacher_performance",
    bookings: "manage_bookings",
    sessions_status: "manage_bookings",
    session_reports: "manage_session_reports",
    session_pricing: "manage_session_pricing",
    materials_monitor: "manage_materials",
    plans: "manage_plans",
    coupons: "manage_coupons",
    withdrawals: "manage_withdrawals",
    teacher_payments: "manage_teacher_payments",
    teacher_earnings: "manage_teacher_earnings",
    wallets: "manage_wallets",
    violations: "manage_violations",
    ai_audit: "manage_ai_audit",
    site: "manage_content",
    support: "customer_support",
    admin_notifications: "manage_notifications",
  };

  const renderContent = () => {
    const requiredPerm = TAB_PERMISSIONS[activeTab];
    if (requiredPerm && !access.can(requiredPerm)) {
      return (
        <Card className="border-destructive/30">
          <CardContent className="py-12 text-center space-y-3">
            <Lock className="h-12 w-12 mx-auto text-destructive" />
            <h3 className="text-lg font-bold">لا تملك صلاحية الوصول لهذا القسم</h3>
            <p className="text-sm text-muted-foreground">تواصل مع المدير العام لمنحك الصلاحية المطلوبة.</p>
          </CardContent>
        </Card>
      );
    }
    switch (activeTab) {
      case "overview": return <OverviewContent stats={stats} monthlyBookings={monthlyBookings} bookingStatusData={bookingStatusData} pieData={pieData} />;
      case "users": return <UserManagementTab />;
      case "teachers": return <TeachersContent teachers={filteredTeachers} teacherDateFrom={teacherDateFrom} teacherDateTo={teacherDateTo} setTeacherDateFrom={setTeacherDateFrom} setTeacherDateTo={setTeacherDateTo} approveTeacher={approveTeacher} rejectTeacher={rejectTeacher} />;
      case "bookings": return <BookingsContent bookings={filteredBookings} bookingStatusFilter={bookingStatusFilter} setBookingStatusFilter={setBookingStatusFilter} bookingDateFrom={bookingDateFrom} bookingDateTo={bookingDateTo} setBookingDateFrom={setBookingDateFrom} setBookingDateTo={setBookingDateTo} />;
      case "sessions_status": return <SessionsStatusTab />;
      case "violations": return <ViolationsTab violations={filteredViolations} setViolations={setViolations} user={user} searchQuery={violationSearchQuery} setSearchQuery={setViolationSearchQuery} statusFilter={violationStatusFilter} setStatusFilter={setViolationStatusFilter} dateFrom={violationDateFrom} dateTo={violationDateTo} setDateFrom={setViolationDateFrom} setDateTo={setViolationDateTo} />;
      case "plans": return <PlansManagementTab />;
      case "coupons": return <CouponsManagementTab />;
      case "teacher_performance": return <TeacherPerformanceTab />;
      case "withdrawals": return <WithdrawalRequestsTab />;
      case "teacher_payments": return <TeacherPaymentsTab />;
      case "teacher_earnings": return <TeacherEarningsTab />;
      case "site": return <SiteSettingsTab />;
      case "support": return <SupportTicketsTab />;
      case "session_reports": return <SessionReportsTab />;
      case "ai_audit": return <AIAuditTab />;
      case "call_transcripts": return <CallTranscriptsTab />;
      case "materials_monitor": return <MaterialsMonitorTab />;
      case "session_pricing": return <SessionPricingTab />;
      case "admin_notifications": return <AdminNotificationsTab />;
      case "wallets": return <WalletsManagementTab />;
      default: return null;
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <SidebarProvider defaultOpen={true}>
        <div className="min-h-screen flex w-full">
          <AdminSidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            badgeCounts={badgeCounts}
            pendingTeachersCount={pendingTeachers.length}
            isFullAdmin={access.isFullAdmin}
            permissions={access.permissions}
          />
          <SidebarInset>
            {/* Top Bar - Professional */}
            <header className="sticky top-0 z-20 border-b bg-gradient-to-l from-primary/10 via-background/95 to-secondary/10 backdrop-blur-md">
              <div className="flex items-center gap-3 px-4 md:px-6 h-16">
                <SidebarTrigger className="h-9 w-9 hover:bg-primary/10 rounded-lg transition-colors" />
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-md shrink-0">
                    <Shield className="h-4.5 w-4.5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-base md:text-lg font-black text-foreground leading-tight truncate">
                      {TAB_TITLES[activeTab] || "لوحة التحكم"}
                    </h1>
                    <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                      {access.isFullAdmin ? "المدير العام" : "مشرف"} · {new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                  </div>
                </div>
                <div className="mr-auto flex items-center gap-2">
                  <Badge variant="outline" className="hidden md:flex items-center gap-1.5 bg-success/10 border-success/30 text-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    متصل
                  </Badge>
                  {(badgeCounts.withdrawals + badgeCounts.support + badgeCounts.pendingBookings + badgeCounts.unreviewed) > 0 && (
                    <Badge className="bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20 gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {badgeCounts.withdrawals + badgeCounts.support + badgeCounts.pendingBookings + badgeCounts.unreviewed} مهمة
                    </Badge>
                  )}
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4 md:p-6 space-y-6 animate-fade-in bg-gradient-to-br from-background via-background to-muted/20 min-h-[calc(100vh-4rem)]">
              {renderContent()}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
};

/* ============================================================
   Sub-components for each section
   ============================================================ */

const StatCard = ({ label, value, icon: Icon, color, subtitle }: { label: string; value: string | number; icon: React.ElementType; color: string; subtitle?: string }) => (
  <Card className="border border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden relative bg-gradient-to-br from-card to-card/80">
    <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-[0.03] group-hover:opacity-[0.08] transition-opacity`} />
    <CardContent className="p-5 relative">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-3xl font-black text-foreground tracking-tight">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${color} opacity-0 group-hover:opacity-100 transition-opacity`} />
    </CardContent>
  </Card>
);

const OverviewContent = ({ stats, monthlyBookings, bookingStatusData, pieData }: any) => (
  <div className="space-y-6">
    {/* Stats Grid */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="إجمالي المستخدمين" value={stats.users} icon={Users} color="from-primary to-primary/70" />
      <StatCard label="المعلمين المسجلين" value={stats.teachers} icon={GraduationCap} color="from-secondary to-secondary/70" />
      <StatCard label="إجمالي الحجوزات" value={stats.bookings} icon={BookOpen} color="from-info to-info/70" />
      <StatCard label="الإيرادات" value={`${stats.revenue} ر.س`} icon={DollarSign} color="from-success to-success/70" />
    </div>

    {/* Secondary Stats */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="طلبات معلقة" value={stats.pendingTeachers} icon={UserCheck} color="from-warning to-warning/70" />
      <StatCard label="حصص مكتملة" value={stats.completedSessions} icon={CheckCircle} color="from-success to-success/70" />
      <StatCard label="حجوزات ملغاة" value={stats.cancelledBookings} icon={XCircle} color="from-destructive to-destructive/70" />
      <StatCard label="المخالفات" value={stats.violations} icon={ShieldAlert} color="from-destructive to-destructive/70" />
    </div>

    {/* Charts */}
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            الحجوزات والإيرادات الشهرية
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyBookings.length === 0 ? (
            <p className="text-center py-16 text-muted-foreground text-sm">لا توجد بيانات بعد</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyBookings}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                <Bar dataKey="حجوزات" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                <Bar dataKey="إيرادات" fill="hsl(var(--secondary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-secondary" />
            توزيع المستخدمين
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} strokeWidth={2}>
                {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>

    {bookingStatusData.length > 0 && (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent-foreground" />
            توزيع حالة الحجوزات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={bookingStatusData} cx="50%" cy="50%" outerRadius={95} dataKey="value" label={({ name, value }) => `${name}: ${value}`} strokeWidth={2}>
                {bookingStatusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    )}
  </div>
);

const TeachersContent = ({ teachers, teacherDateFrom, teacherDateTo, setTeacherDateFrom, setTeacherDateTo, approveTeacher, rejectTeacher }: any) => (
  <Card className="border-0 shadow-sm">
    <CardHeader>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-secondary" />
          طلبات تسجيل المعلمين ({teachers.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <DateFilter dateFrom={teacherDateFrom} dateTo={teacherDateTo} onDateFromChange={setTeacherDateFrom} onDateToChange={setTeacherDateTo} />
          <ExportCSVButton
            data={teachers.map((t: any) => ({ name: t.profile?.full_name || "", phone: t.profile?.phone || "", experience: t.years_experience || 0, date: new Date(t.created_at).toLocaleDateString("ar-SA") }))}
            headers={[{ key: "name", label: "الاسم" }, { key: "phone", label: "الهاتف" }, { key: "experience", label: "الخبرة" }, { key: "date", label: "التاريخ" }]}
            filename="طلبات_المعلمين"
          />
        </div>
      </div>
    </CardHeader>
    <CardContent>
      {teachers.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-3 opacity-60" />
          <p className="text-muted-foreground">لا توجد طلبات معلقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teachers.map((t: any) => (
            <div key={t.id} className="p-4 bg-muted/30 rounded-xl space-y-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                    <GraduationCap className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">{t.profile?.full_name || "بدون اسم"}</p>
                    <p className="text-xs text-muted-foreground">{t.profile?.phone || "لا يوجد رقم"}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-lg bg-success hover:bg-success/90 text-success-foreground gap-1" onClick={() => approveTeacher(t.id)}>
                    <CheckCircle className="h-3.5 w-3.5" />
                    موافقة
                  </Button>
                  <Button size="sm" variant="destructive" className="rounded-lg gap-1" onClick={() => rejectTeacher(t.id, t.user_id)}>
                    <XCircle className="h-3.5 w-3.5" />
                    رفض
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-background/60 rounded-lg p-3">
                <div><span className="text-muted-foreground">سنوات الخبرة</span><p className="font-medium text-foreground mt-0.5">{t.years_experience || 0} سنوات</p></div>
                <div><span className="text-muted-foreground">الجنسية</span><p className="font-medium text-foreground mt-0.5">{t.nationality || "—"}</p></div>
                <div><span className="text-muted-foreground">المواد</span><p className="font-medium text-foreground mt-0.5">{t.subjects?.length > 0 ? t.subjects.join("، ") : "—"}</p></div>
                <div><span className="text-muted-foreground">أوقات التوفر</span><p className="font-medium text-foreground mt-0.5">{t.available_from && t.available_to ? `${t.available_from} - ${t.available_to}` : "—"}</p></div>
                {t.available_days && t.available_days.length > 0 && (
                  <div className="col-span-2"><span className="text-muted-foreground">أيام التوفر</span><p className="font-medium text-foreground mt-0.5">{t.available_days.join("، ")}</p></div>
                )}
                {t.teaching_stages && t.teaching_stages.length > 0 && (
                  <div className="col-span-2"><span className="text-muted-foreground">المراحل الدراسية</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">{t.teaching_stages.map((stage: string) => <Badge key={stage} variant="secondary" className="text-[10px]">{stage}</Badge>)}</div>
                  </div>
                )}
                {t.bio && <div className="col-span-2 md:col-span-4"><span className="text-muted-foreground">النبذة</span><p className="font-medium text-foreground mt-0.5">{t.bio}</p></div>}
              </div>
              {t.certificates && t.certificates.length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground font-medium">الشهادات ({t.certificates.length}):</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {t.certificates.map((c: any) => (
                      <a key={c.id} href={c.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                        <FileText className="h-3 w-3" />{c.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">تاريخ التسجيل: {new Date(t.created_at).toLocaleDateString("ar-SA")}</p>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const BookingsContent = ({ bookings, bookingStatusFilter, setBookingStatusFilter, bookingDateFrom, bookingDateTo, setBookingDateFrom, setBookingDateTo }: any) => (
  <Card className="border-0 shadow-sm">
    <CardHeader>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <CardTitle className="text-sm font-bold">آخر الحجوزات ({bookings.length})</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusFilter value={bookingStatusFilter} onChange={setBookingStatusFilter} options={[
            { value: "pending", label: "معلقة" }, { value: "confirmed", label: "مؤكدة" },
            { value: "completed", label: "مكتملة" }, { value: "cancelled", label: "ملغاة" },
          ]} />
          <DateFilter dateFrom={bookingDateFrom} dateTo={bookingDateTo} onDateFromChange={setBookingDateFrom} onDateToChange={setBookingDateTo} />
          <ExportCSVButton
            data={bookings.map((b: any) => ({ student: b.student_name, teacher: b.teacher_name, date: new Date(b.scheduled_at).toLocaleDateString("ar-SA"), duration: b.duration_minutes, price: b.price || 0, status: b.status === "completed" ? "مكتملة" : b.status === "confirmed" ? "مؤكدة" : b.status === "cancelled" ? "ملغاة" : "معلقة" }))}
            headers={[{ key: "student", label: "الطالب" }, { key: "teacher", label: "المعلم" }, { key: "date", label: "التاريخ" }, { key: "duration", label: "المدة" }, { key: "price", label: "السعر" }, { key: "status", label: "الحالة" }]}
            filename="الحجوزات"
          />
        </div>
      </div>
    </CardHeader>
    <CardContent>
      {bookings.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">لا توجد حجوزات بعد</p>
      ) : (
        <div className="space-y-2">
          {bookings.map((b: any) => (
            <div key={b.id} className="flex items-center justify-between p-3.5 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors">
              <div>
                <p className="font-medium text-sm text-foreground">{b.student_name} ← {b.teacher_name}</p>
                <p className="text-xs text-muted-foreground">{new Date(b.scheduled_at).toLocaleDateString("ar-SA")} • {b.duration_minutes} دقيقة{b.price ? ` • ${b.price} ر.س` : ""}</p>
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
);


export default AdminDashboard;
