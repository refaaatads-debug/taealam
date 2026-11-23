import { useState, useEffect } from "react";
import BrandLoader from "@/components/BrandLoader";
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
import FeaturedTeachersTab from "@/components/admin/FeaturedTeachersTab";
import DomainSSLTab from "@/components/admin/DomainSSLTab";
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
import StudentProfilesTab from "@/components/admin/StudentProfilesTab";
import TeacherProfilesTab from "@/components/admin/TeacherProfilesTab";
import SessionReportsTab from "@/components/admin/SessionReportsTab";
import AIAuditTab from "@/components/admin/AIAuditTab";
import TeacherEarningsTab from "@/components/admin/TeacherEarningsTab";
import FinancialHubTab from "@/components/admin/FinancialHubTab";
import MaterialsMonitorTab from "@/components/admin/MaterialsMonitorTab";
import SessionPricingTab from "@/components/admin/SessionPricingTab";
import AdminNotificationsTab from "@/components/admin/AdminNotificationsTab";
import AdminTeamManagementTab from "@/components/admin/AdminTeamManagementTab";
import AdminPermissionsTab from "@/components/admin/AdminPermissionsTab";
import WalletsManagementTab from "@/components/admin/WalletsManagementTab";
import CallTranscriptsTab from "@/components/admin/CallTranscriptsTab";
import ViolationsTab from "@/components/admin/ViolationsTab";
import SessionsStatusTab from "@/components/admin/SessionsStatusTab";
import AdvancedAnalyticsTab from "@/components/admin/AdvancedAnalyticsTab";
import AdminQuickSearch from "@/components/admin/AdminQuickSearch";
import AdminLiveAlerts from "@/components/admin/AdminLiveAlerts";
import AdminUrgentTasks from "@/components/admin/AdminUrgentTasks";
import AdminTeacherContactDialog from "@/components/admin/AdminTeacherContactDialog";
import AdminPeriodFilter, { AdminPeriod, getPeriodStart } from "@/components/admin/AdminPeriodFilter";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Lock } from "lucide-react";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

const certificateUrl = (value: string) => value?.startsWith("http")
  ? value
  : supabase.storage.from("support-files").getPublicUrl(value).data.publicUrl;

const TAB_TITLES: Record<string, string> = {
  overview: "نظرة عامة",
  users: "إدارة المستخدمين",
  student_profiles: "ملفات الطلاب",
  teacher_profiles: "ملفات المعلمين",
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
  team: "فريق الإدارة وسجل العمليات",
  admin_permissions: "صلاحيات أقسام لوحة الإدارة",
  advanced_analytics: "التحليلات المتقدمة",
  featured_teachers: "المدرسون المميزون",
  financial_hub: "المركز المالي",
  domain_ssl: "حالة SSL/HTTPS",
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
  const [period, setPeriod] = useState<AdminPeriod>("month");

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
    const refresh = () => { fetchBadgeCounts(); fetchData(true); };

    const channels = [
      supabase.channel("admin-withdrawals").on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, refresh),
      supabase.channel("admin-support").on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, refresh),
      supabase.channel("admin-bookings").on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, refresh),
      supabase.channel("admin-violations").on("postgres_changes", { event: "*", schema: "public", table: "violations" }, refresh),
      supabase.channel("admin-teacher-profiles").on("postgres_changes", { event: "*", schema: "public", table: "teacher_profiles" }, refresh),
      supabase.channel("admin-payments").on("postgres_changes", { event: "*", schema: "public", table: "payment_records" }, refresh),
    ];
    channels.forEach(ch => ch.subscribe());
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const periodStart = getPeriodStart(period);
      const periodFilterIso = periodStart ? periodStart.toISOString() : null;

      let bookingsCountQ = supabase.from("bookings").select("id", { count: "exact", head: true });
      let paymentsQ = supabase.from("payment_records").select("amount, created_at").eq("status", "completed");
      let violationsCountQ = (supabase as any).from("violations").select("id", { count: "exact", head: true });
      if (periodFilterIso) {
        bookingsCountQ = bookingsCountQ.gte("created_at", periodFilterIso);
        paymentsQ = paymentsQ.gte("created_at", periodFilterIso);
        violationsCountQ = violationsCountQ.gte("created_at", periodFilterIso);
      }

      const [profilesRes, teachersRes, bookingsRes, paymentsRes, violationsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("teacher_profiles").select("id", { count: "exact", head: true }),
        bookingsCountQ,
        paymentsQ,
        violationsCountQ,
      ]);

      let allBookingsQ = supabase.from("bookings").select("created_at, status, price");
      if (periodFilterIso) allBookingsQ = allBookingsQ.gte("created_at", periodFilterIso);
      const { data: allBookingsData } = await allBookingsQ;
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
    const { error } = await supabase.from("teacher_profiles").update({ is_approved: true, is_verified: true, approval_status: "approved" } as any).eq("id", teacherId);
    if (error) { toast.error("حدث خطأ: " + error.message); return; }
    toast.success("تمت الموافقة على المعلم!");
    setPendingTeachers(prev => prev.filter(t => t.id !== teacherId));
    setStats(prev => ({ ...prev, pendingTeachers: Math.max(0, prev.pendingTeachers - 1) }));
  };

  const rejectTeacher = async (teacherId: string, _userId: string) => {
    const { error } = await supabase
      .from("teacher_profiles")
      .update({ is_approved: false, is_verified: false, approval_status: "rejected" } as any)
      .eq("id", teacherId);
    if (error) { toast.error("تعذر رفض طلب المعلم: " + error.message); return; }
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
        <BrandLoader text="جاري تحميل لوحة التحكم..." />
      </div>
    );
  }

  // ربط كل تبويب بصلاحيته
  const TAB_PERMISSIONS: Record<string, string> = {
    overview: "view_overview",
    advanced_analytics: "view_advanced_analytics",
    users: "manage_users",
    student_profiles: "manage_student_profiles",
    teacher_profiles: "manage_teacher_profiles",
    teachers: "manage_pending_teachers",
    teacher_performance: "view_teacher_performance",
    featured_teachers: "manage_featured_teachers",
    bookings: "manage_bookings",
    sessions_status: "manage_sessions_status",
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
    call_transcripts: "view_call_transcripts",
    ai_audit: "manage_ai_audit",
    site: "manage_content",
    support: "customer_support",
    admin_notifications: "manage_notifications",
    domain_ssl: "manage_domain_ssl",
    team: "manage_admins",
    admin_permissions: "manage_admins",
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
      case "overview": return <OverviewContent stats={stats} monthlyBookings={monthlyBookings} bookingStatusData={bookingStatusData} pieData={pieData} period={period} setPeriod={setPeriod} onOpenTab={handleTabChange} />;
      case "users": return <UserManagementTab />;
      case "student_profiles": return <StudentProfilesTab />;
      case "teacher_profiles": return <TeacherProfilesTab />;
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
      case "financial_hub": return <FinancialHubTab />;
      case "site": return <SiteSettingsTab />;
      case "featured_teachers": return <FeaturedTeachersTab />;
      case "support": return <SupportTicketsTab />;
      case "session_reports": return <SessionReportsTab />;
      case "ai_audit": return <AIAuditTab />;
      case "call_transcripts": return <CallTranscriptsTab />;
      case "materials_monitor": return <MaterialsMonitorTab />;
      case "session_pricing": return <SessionPricingTab />;
      case "admin_notifications": return <AdminNotificationsTab />;
      case "wallets": return <WalletsManagementTab />;
      case "team": return <AdminTeamManagementTab />;
      case "admin_permissions": return <AdminPermissionsTab />;
      case "domain_ssl": return <DomainSSLTab />;
      case "advanced_analytics": return <AdvancedAnalyticsTab />;
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
            {/* Top Bar */}
            <header className="sticky top-0 z-20 h-14 border-b border-border/60 bg-background/95 backdrop-blur-sm flex items-center">
              <div className="flex items-center gap-3 px-4 md:px-6 w-full">
                <SidebarTrigger className="h-8 w-8 hover:bg-muted rounded-md transition-colors text-muted-foreground" />
                <div className="h-4 w-px bg-border" />
                <span className="hidden lg:block text-xs font-bold text-primary whitespace-nowrap">منصة أجيال المعرفة</span>
                <div className="h-4 w-px bg-border hidden lg:block" />
                <div className="min-w-0">
                  <h1 className="text-[15px] font-semibold text-foreground leading-none truncate">
                    {TAB_TITLES[activeTab] || "لوحة التحكم"}
                  </h1>
                  <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
                    {new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <div className="mr-auto flex items-center gap-2">
                  <AdminQuickSearch onNavigateTab={handleTabChange} />
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200/80 rounded-md px-2.5 py-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    مباشر
                  </div>
                  {(badgeCounts.withdrawals + badgeCounts.support + badgeCounts.pendingBookings + badgeCounts.unreviewed) > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200/80 rounded-md px-2.5 py-1 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      {badgeCounts.withdrawals + badgeCounts.support + badgeCounts.pendingBookings + badgeCounts.unreviewed} تنبيه
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4 md:p-6 space-y-5 bg-muted/20 min-h-[calc(100vh-3.5rem)]">
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

const StatCard = ({ label, value, icon: Icon, color, subtitle, accent }: { label: string; value: string | number; icon: React.ElementType; color: string; subtitle?: string; accent?: string }) => (
  <Card className="border border-border/50 bg-card/95 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
    <CardContent className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-medium text-muted-foreground leading-tight">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${accent || "bg-muted"} flex items-center justify-center shrink-0`}>
          <Icon className="h-[15px] w-[15px]" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
    </CardContent>
  </Card>
);

const OverviewContent = ({ stats, monthlyBookings, bookingStatusData, pieData, period, setPeriod, onOpenTab }: any) => (
  <div className="space-y-5">
    {/* Period filter */}
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">نظرة عامة</h2>
        <p className="text-xs text-muted-foreground mt-0.5">الإحصاءات الكلية للمنصة</p>
      </div>
      <AdminPeriodFilter value={period} onChange={setPeriod} />
    </div>

    {/* Primary KPIs */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="إجمالي المستخدمين" value={stats.users.toLocaleString("ar-SA")} icon={Users} color="" accent="bg-blue-50 text-blue-600" />
      <StatCard label="المعلمون المسجلون" value={stats.teachers.toLocaleString("ar-SA")} icon={GraduationCap} color="" accent="bg-violet-50 text-violet-600" />
      <StatCard label="إجمالي الحجوزات" value={stats.bookings.toLocaleString("ar-SA")} icon={BookOpen} color="" accent="bg-sky-50 text-sky-600" />
      <StatCard label="الإيرادات الكلية" value={`${stats.revenue.toLocaleString("ar-SA")} ر.س`} icon={DollarSign} color="" accent="bg-emerald-50 text-emerald-600" />
    </div>

    {/* Secondary KPIs */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="طلبات معلمين معلقة" value={stats.pendingTeachers} icon={UserCheck} color="" accent="bg-amber-50 text-amber-600" />
      <StatCard label="حصص مكتملة" value={stats.completedSessions.toLocaleString("ar-SA")} icon={CheckCircle} color="" accent="bg-emerald-50 text-emerald-600" />
      <StatCard label="حجوزات ملغاة" value={stats.cancelledBookings.toLocaleString("ar-SA")} icon={XCircle} color="" accent="bg-rose-50 text-rose-600" />
      <StatCard label="المخالفات المسجلة" value={stats.violations} icon={ShieldAlert} color="" accent="bg-red-50 text-red-600" />
    </div>

    {/* Urgent tasks + Live alerts */}
    <div className="grid lg:grid-cols-2 gap-4">
      <AdminUrgentTasks onOpenTab={onOpenTab} />
      <AdminLiveAlerts onOpenTab={onOpenTab} />
    </div>

    {/* Charts */}
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="pb-2 px-5 pt-5">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
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

      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="pb-2 px-5 pt-5">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
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
      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="pb-2 px-5 pt-5">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
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

const TeachersContent = ({ teachers, teacherDateFrom, teacherDateTo, setTeacherDateFrom, setTeacherDateTo, approveTeacher, rejectTeacher }: any) => {
  const [search, setSearch] = useState("");
  const filtered = teachers.filter((t: any) =>
    !search || (t.profile?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.profile?.phone || "").includes(search)
  );
  const pending = teachers.length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الطلبات", value: pending, icon: UserCheck, cls: "bg-blue-50 text-blue-600" },
          { label: "المواد المطلوبة", value: [...new Set(teachers.flatMap((t: any) => t.subjects || []))].length, icon: GraduationCap, cls: "bg-violet-50 text-violet-600" },
          { label: "متوسط سنوات الخبرة", value: pending > 0 ? (teachers.reduce((s: number, t: any) => s + (t.years_experience || 0), 0) / pending).toFixed(1) : 0, icon: TrendingUp, cls: "bg-emerald-50 text-emerald-600" },
          { label: "لديهم شهادات", value: teachers.filter((t: any) => t.certificates?.length > 0).length, icon: FileText, cls: "bg-amber-50 text-amber-600" },
        ].map((k, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-medium text-muted-foreground">{k.label}</p>
              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${k.cls.split(" ")[0]}`}>
                <k.icon className={`h-[14px] w-[14px] ${k.cls.split(" ")[1]}`} />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">{k.value}</p>
          </div>
        ))}
      </div>

      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              طلبات تسجيل المعلمين{" "}
              <span className="text-muted-foreground font-normal">({filtered.length})</span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  placeholder="بحث بالاسم أو الهاتف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9 h-8 text-sm w-44 rounded-md border border-border/60 bg-muted/30 px-3 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <DateFilter dateFrom={teacherDateFrom} dateTo={teacherDateTo} onDateFromChange={setTeacherDateFrom} onDateToChange={setTeacherDateTo} />
              <ExportCSVButton
                data={filtered.map((t: any) => ({ name: t.profile?.full_name || "", phone: t.profile?.phone || "", experience: t.years_experience || 0, nationality: t.nationality || "", subjects: (t.subjects || []).join(", "), stages: (t.teaching_stages || []).join(", "), certs: t.certificates?.length || 0, date: new Date(t.created_at).toLocaleDateString("ar-SA") }))}
                headers={[
                  { key: "name", label: "الاسم" }, { key: "phone", label: "الهاتف" },
                  { key: "experience", label: "الخبرة (سنوات)" }, { key: "nationality", label: "الجنسية" },
                  { key: "subjects", label: "المواد" }, { key: "stages", label: "المراحل" },
                  { key: "certs", label: "عدد الشهادات" }, { key: "date", label: "التاريخ" },
                ]}
                filename="طلبات_المعلمين"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <CheckCircle className="h-10 w-10 opacity-20" />
              <p className="text-sm">لا توجد طلبات معلقة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((t: any) => (
                <div key={t.id} className="border border-border/50 rounded-lg overflow-hidden bg-card hover:border-border transition-colors">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/20 border-b border-border/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <GraduationCap className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{t.profile?.full_name || "بدون اسم"}</p>
                        <p className="text-[11px] text-muted-foreground">{t.profile?.phone || "لا يوجد رقم"} · {new Date(t.created_at).toLocaleDateString("ar-SA")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <AdminTeacherContactDialog userId={t.user_id} userName={t.profile?.full_name} />
                      <Button size="sm" className="h-8 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveTeacher(t.id)}>
                        <CheckCircle className="h-3.5 w-3.5" /> قبول
                      </Button>
                      <Button size="sm" variant="destructive" className="h-8 px-3 text-xs gap-1" onClick={() => rejectTeacher(t.id, t.user_id)}>
                        <XCircle className="h-3.5 w-3.5" /> رفض
                      </Button>
                    </div>
                  </div>
                  {/* Details grid */}
                  <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                    <div><span className="text-muted-foreground block">سنوات الخبرة</span><span className="font-medium text-foreground">{t.years_experience || 0} سنوات</span></div>
                    <div><span className="text-muted-foreground block">الجنسية</span><span className="font-medium text-foreground">{t.nationality || "—"}</span></div>
                    <div><span className="text-muted-foreground block">المواد</span><span className="font-medium text-foreground">{t.subjects?.length > 0 ? t.subjects.join("، ") : "—"}</span></div>
                    <div><span className="text-muted-foreground block">أوقات التوفر</span><span className="font-medium text-foreground">{t.available_from && t.available_to ? `${t.available_from} — ${t.available_to}` : "—"}</span></div>
                    {t.available_days?.length > 0 && (
                      <div className="col-span-2"><span className="text-muted-foreground block">أيام التوفر</span><span className="font-medium text-foreground">{t.available_days.join("، ")}</span></div>
                    )}
                    {t.teaching_stages?.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground block mb-1">المراحل الدراسية</span>
                        <div className="flex flex-wrap gap-1">
                          {t.teaching_stages.map((s: string) => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>)}
                        </div>
                      </div>
                    )}
                    {t.bio && (
                      <div className="col-span-2 md:col-span-4">
                        <span className="text-muted-foreground block">نبذة</span>
                        <span className="font-medium text-foreground line-clamp-2">{t.bio}</span>
                      </div>
                    )}
                  </div>
                  {/* Certificates */}
                  {t.certificates?.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-border/40 bg-muted/10 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground font-medium">الشهادات ({t.certificates.length}):</span>
                      {t.certificates.map((c: any) => (
                        <a key={c.id} href={certificateUrl(c.file_url)} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/15 transition-colors">
                          <FileText className="h-3 w-3" /> {c.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const BookingsContent = ({ bookings, bookingStatusFilter, setBookingStatusFilter, bookingDateFrom, bookingDateTo, setBookingDateFrom, setBookingDateTo }: any) => (
  <Card className="border border-border/50 bg-card shadow-sm">
    <CardHeader className="px-5 pt-5 pb-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <CardTitle className="text-sm font-semibold text-foreground">آخر الحجوزات <span className="text-muted-foreground font-normal">({bookings.length})</span></CardTitle>
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
            <div key={b.id} className="flex items-center justify-between py-2.5 px-1 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={["w-1.5 h-1.5 rounded-full shrink-0", b.status === "completed" ? "bg-emerald-500" : b.status === "confirmed" ? "bg-blue-500" : b.status === "cancelled" ? "bg-red-400" : "bg-amber-400"].join(" ")} />
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{b.student_name} <span className="text-muted-foreground">·</span> {b.teacher_name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(b.scheduled_at).toLocaleDateString("ar-SA")} · {b.duration_minutes} د{b.price ? ` · ${b.price} ر.س` : ""}</p>
                </div>
              </div>
              <span className={["text-[11px] font-medium px-2 py-0.5 rounded shrink-0", b.status === "completed" ? "bg-emerald-50 text-emerald-700" : b.status === "confirmed" ? "bg-blue-50 text-blue-700" : b.status === "cancelled" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"].join(" ")}>
                {b.status === "completed" ? "مكتملة" : b.status === "confirmed" ? "مؤكدة" : b.status === "cancelled" ? "ملغاة" : "معلقة"}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);


export default AdminDashboard;
