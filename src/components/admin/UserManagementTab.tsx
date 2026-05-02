import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users, Search, Trash2, Eye, Edit, BookOpen, Clock, Star,
  GraduationCap, Award, Package, Save, X, Phone, User, Calendar,
  Shield, DollarSign, AlertTriangle, KeyRound, Plus, Minus, FileText, CreditCard, Ban, ShieldCheck
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ExportCSVButton from "./ExportCSVButton";
import StatusFilter from "./StatusFilter";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  level: string | null;
  referral_code: string | null;
  free_trial_used: boolean | null;
  created_at: string;
  updated_at: string;
}

interface UserDetail extends UserProfile {
  role: string;
  // Student data
  points?: number;
  streak?: number;
  badges?: { name_ar: string; icon: string | null }[];
  subscriptions?: { plan_name: string; sessions_remaining: number; is_active: boolean; ends_at: string }[];
  bookingsAsStudent?: number;
  // Teacher data
  teacherProfile?: {
    id: string;
    bio: string | null;
    hourly_rate: number;
    years_experience: number | null;
    avg_rating: number;
    total_reviews: number;
    total_sessions: number;
    is_approved: boolean;
    is_verified: boolean;
    available_days: string[] | null;
    available_from: string | null;
    available_to: string | null;
  };
  subjects?: string[];
  bookingsAsTeacher?: number;
  certificates?: { id: string; name: string; file_url: string; file_name: string | null; created_at: string }[];
  bankInfo?: { bank_name: string | null; iban: string | null; account_holder_name: string | null };
  // Permissions
  permissions?: string[];
  // Warnings
  warnings?: { warning_type: string; description: string | null; created_at: string; warning_count: number }[];
}

export default function UserManagementTab() {
  const { user: currentUser } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userRolesMap, setUserRolesMap] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [userPermissionsMap, setUserPermissionsMap] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ full_name: "", phone: "", level: "" });

  useEffect(() => {
    fetchUsers();
    fetchPlans();
  }, []);

  const [bannedUsers, setBannedUsers] = useState<Set<string>>(new Set());
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [grantPlanId, setGrantPlanId] = useState<string>("");
  const [grantDurationDays, setGrantDurationDays] = useState<number>(30);
  const [granting, setGranting] = useState(false);

  const fetchPlans = async () => {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name_ar, tier, sessions_count, session_duration_minutes, price")
      .eq("is_active", true)
      .is("assigned_user_id", null)
      .order("price", { ascending: true });
    setAvailablePlans(data ?? []);
  };

  const grantPlanToUser = async () => {
    if (!selectedUser || !grantPlanId) {
      toast.error("اختر باقة أولاً");
      return;
    }
    const plan = availablePlans.find((p) => p.id === grantPlanId);
    if (!plan) return;

    setGranting(true);
    try {
      const totalMinutes = (plan.sessions_count || 0) * (plan.session_duration_minutes || 45);
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + (grantDurationDays || 30));

      const { error } = await supabase.from("user_subscriptions").insert({
        user_id: selectedUser.user_id,
        plan_id: plan.id,
        sessions_remaining: plan.sessions_count || 0,
        remaining_minutes: totalMinutes,
        total_hours: totalMinutes / 60,
        is_active: true,
        starts_at: new Date().toISOString(),
        ends_at: endsAt.toISOString(),
        auto_renew: false,
      });
      if (error) throw error;

      // Notify the student
      await supabase.from("notifications").insert({
        user_id: selectedUser.user_id,
        title: "🎁 تم منحك باقة جديدة",
        body: `قام الإدارة بمنحك باقة "${plan.name_ar}" بإجمالي ${plan.sessions_count} حصة.`,
        type: "subscription",
      });

      // Audit log
      await (supabase as any).rpc("log_admin_action", {
        _action: "grant_subscription",
        _category: "subscriptions",
        _description: `منح باقة "${plan.name_ar}" للمستخدم ${selectedUser.full_name}`,
        _target_table: "user_subscriptions",
        _target_id: selectedUser.user_id,
        _metadata: { plan_id: plan.id, sessions: plan.sessions_count, duration_days: grantDurationDays },
      });

      toast.success(`تم منح باقة "${plan.name_ar}" بنجاح`);
      setGrantPlanId("");
      // Refresh user detail
      await fetchUserDetail(selectedUser);
    } catch (e: any) {
      toast.error(e.message || "فشل منح الباقة");
    } finally {
      setGranting(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    const [usersRes, rolesRes, permsRes, bannedRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("user_roles").select("user_id, role"),
      (supabase as any).from("user_permissions").select("user_id, permission"),
      supabase.from("user_warnings").select("user_id, is_banned").eq("warning_type", "admin_ban").eq("is_banned", true),
    ]);
    setAllUsers(usersRes.data ?? []);
    const rMap = new Map((rolesRes.data ?? []).map(r => [r.user_id, r.role]));
    setUserRolesMap(rMap);
    // Build permissions map
    const pMap = new Map<string, string[]>();
    (permsRes.data ?? []).forEach((p: any) => {
      const existing = pMap.get(p.user_id) || [];
      existing.push(p.permission);
      pMap.set(p.user_id, existing);
    });
    setUserPermissionsMap(pMap);
    setBannedUsers(new Set((bannedRes.data ?? []).map((b: any) => b.user_id)));
    setLoading(false);
  };

  const fetchUserDetail = async (profile: UserProfile) => {
    setDetailLoading(true);
    const role = userRolesMap.get(profile.user_id) || "student";
    const detail: UserDetail = { ...profile, role };

    try {
      // Parallel fetches based on role
      const promises: Promise<any>[] = [
        supabase.from("student_points").select("total_points, streak_days").eq("user_id", profile.user_id).maybeSingle(),
        supabase.from("student_badges").select("badge_id, badges(name_ar, icon)").eq("user_id", profile.user_id),
        supabase.from("user_subscriptions").select("sessions_remaining, is_active, ends_at, subscription_plans(name_ar)").eq("user_id", profile.user_id).order("created_at", { ascending: false }),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("student_id", profile.user_id),
        (supabase as any).from("user_warnings").select("warning_type, description, created_at, warning_count").eq("user_id", profile.user_id).order("created_at", { ascending: false }),
      ];

      if (role === "teacher") {
        promises.push(
          supabase.from("teacher_profiles").select("*").eq("user_id", profile.user_id).maybeSingle() as any,
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("teacher_id", profile.user_id) as any,
          supabase.from("teacher_certificates" as any).select("*").eq("teacher_id", profile.user_id).order("created_at", { ascending: false }) as any,
        );
      }

      const results = await Promise.all(promises);
      const [pointsRes, badgesRes, subsRes, studentBookingsRes, warningsRes] = results;

      detail.points = pointsRes.data?.total_points || 0;
      detail.streak = pointsRes.data?.streak_days || 0;
      detail.badges = (badgesRes.data ?? []).map((b: any) => ({
        name_ar: b.badges?.name_ar || "",
        icon: b.badges?.icon || null,
      }));
      detail.subscriptions = (subsRes.data ?? []).map((s: any) => ({
        plan_name: s.subscription_plans?.name_ar || "—",
        sessions_remaining: s.sessions_remaining,
        is_active: s.is_active,
        ends_at: s.ends_at,
      }));
      detail.bookingsAsStudent = studentBookingsRes.count ?? 0;
      detail.warnings = warningsRes.data ?? [];

      // Fetch permissions
      const { data: permsData } = await (supabase as any)
        .from("user_permissions")
        .select("permission")
        .eq("user_id", profile.user_id);
      detail.permissions = (permsData ?? []).map((p: any) => p.permission);

      if (role === "teacher" && results[5]) {
        const tpRes = results[5];
        if (tpRes.data) {
          detail.teacherProfile = tpRes.data;
          detail.bankInfo = {
            bank_name: (tpRes.data as any).bank_name,
            iban: (tpRes.data as any).iban,
            account_holder_name: (tpRes.data as any).account_holder_name,
          };
          // Fetch subjects
          const { data: tsData } = await supabase
            .from("teacher_subjects")
            .select("subjects(name)")
            .eq("teacher_id", tpRes.data.id);
          detail.subjects = (tsData ?? []).map((s: any) => s.subjects?.name || "");
        }
        detail.bookingsAsTeacher = results[6]?.count ?? 0;
        detail.certificates = (results[7]?.data as any[]) ?? [];
      }

      setSelectedUser(detail);
      setEditData({
        full_name: detail.full_name || "",
        phone: detail.phone || "",
        level: detail.level || "bronze",
      });
    } catch (e) {
      console.error(e);
      toast.error("حدث خطأ في تحميل البيانات");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveUserEdit = async () => {
    if (!selectedUser) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editData.full_name,
        phone: editData.phone,
        level: editData.level,
      })
      .eq("user_id", selectedUser.user_id);

    if (error) {
      toast.error("حدث خطأ في الحفظ");
      return;
    }
    toast.success("تم تحديث بيانات المستخدم");
    setAllUsers(prev => prev.map(u =>
      u.user_id === selectedUser.user_id
        ? { ...u, full_name: editData.full_name, phone: editData.phone, level: editData.level }
        : u
    ));
    setSelectedUser(prev => prev ? { ...prev, full_name: editData.full_name, phone: editData.phone, level: editData.level } : null);
    setEditMode(false);
  };

  const PERMISSION_LABELS: Record<string, { label: string; description: string; icon: string; group: string }> = {
    // الرئيسية
    view_overview: { label: "نظرة عامة", description: "عرض الإحصائيات والرسوم البيانية", icon: "📊", group: "الرئيسية" },
    // المستخدمين
    manage_users: { label: "إدارة المستخدمين", description: "عرض وتعديل وحذف المستخدمين", icon: "👥", group: "المستخدمين" },
    manage_teachers: { label: "طلبات المعلمين", description: "مراجعة طلبات تسجيل المعلمين والموافقة عليها", icon: "👨‍🏫", group: "المستخدمين" },
    view_teacher_performance: { label: "أداء المعلمين", description: "عرض تقارير أداء المعلمين", icon: "📈", group: "المستخدمين" },
    // الحصص
    manage_bookings: { label: "إدارة الحجوزات", description: "عرض وتعديل جميع الحجوزات", icon: "📅", group: "الحصص" },
    manage_session_reports: { label: "تقارير الحصص", description: "الوصول لتقارير AI للحصص", icon: "📄", group: "الحصص" },
    manage_session_pricing: { label: "أسعار الحصص", description: "تعديل أسعار ساعات المعلمين", icon: "💵", group: "الحصص" },
    manage_materials: { label: "مراقبة المواد", description: "متابعة المواد التعليمية والتسجيلات", icon: "📚", group: "الحصص" },
    // المالية
    manage_plans: { label: "إدارة الباقات", description: "إنشاء وتعديل باقات الاشتراك", icon: "💳", group: "المالية" },
    manage_coupons: { label: "إدارة الكوبونات", description: "إنشاء وتعديل أكواد الخصم", icon: "🎟️", group: "المالية" },
    manage_withdrawals: { label: "طلبات السحب", description: "مراجعة طلبات سحب أرباح المعلمين", icon: "💸", group: "المالية" },
    manage_teacher_payments: { label: "مدفوعات المعلمين", description: "سجل المدفوعات للمعلمين", icon: "💰", group: "المالية" },
    manage_teacher_earnings: { label: "الأرباح اليدوية", description: "إضافة أرباح يدوية للمعلمين", icon: "✏️", group: "المالية" },
    manage_wallets: { label: "المحافظ والمكالمات", description: "إدارة محافظ المعلمين وسجل المكالمات", icon: "👛", group: "المالية" },
    manage_payments: { label: "إدارة المدفوعات (عام)", description: "صلاحية شاملة للمدفوعات", icon: "💼", group: "المالية" },
    // الأمان
    manage_violations: { label: "المخالفات", description: "مراجعة مخالفات الطلاب والمعلمين", icon: "⚠️", group: "الأمان" },
    manage_ai_audit: { label: "فحص AI", description: "مراجعة جودة استجابات الذكاء الاصطناعي", icon: "🧠", group: "الأمان" },
    // النظام
    manage_content: { label: "إدارة المحتوى", description: "تعديل محتوى الموقع والإعدادات", icon: "📝", group: "النظام" },
    customer_support: { label: "الدعم الفني", description: "الوصول لتذاكر الدعم والرد عليها", icon: "💬", group: "النظام" },
    manage_notifications: { label: "الإشعارات", description: "إرسال إشعارات للمستخدمين", icon: "🔔", group: "النظام" },
    view_reports: { label: "عرض التقارير (عام)", description: "صلاحية شاملة للتقارير", icon: "📋", group: "النظام" },
  };

  const togglePermission = async (userId: string, permission: string, currentlyHas: boolean) => {
    try {
      if (currentlyHas) {
        const { error } = await (supabase as any)
          .from("user_permissions")
          .delete()
          .eq("user_id", userId)
          .eq("permission", permission);
        if (error) throw error;
        setSelectedUser(prev => prev ? {
          ...prev,
          permissions: (prev.permissions || []).filter(p => p !== permission),
        } : null);
        setUserPermissionsMap(prev => {
          const m = new Map(prev);
          m.set(userId, (m.get(userId) || []).filter(p => p !== permission));
          return m;
        });
        toast.success(`تم إزالة صلاحية "${PERMISSION_LABELS[permission]?.label}"`);
      } else {
        const { error } = await (supabase as any)
          .from("user_permissions")
          .insert({ user_id: userId, permission, granted_by: currentUser?.id });
        if (error) throw error;
        setSelectedUser(prev => prev ? {
          ...prev,
          permissions: [...(prev.permissions || []), permission],
        } : null);
        setUserPermissionsMap(prev => {
          const m = new Map(prev);
          m.set(userId, [...(m.get(userId) || []), permission]);
          return m;
        });
        toast.success(`تم منح صلاحية "${PERMISSION_LABELS[permission]?.label}"`);
      }
    } catch {
      toast.error("حدث خطأ في تحديث الصلاحية");
    }
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
    if (error) { toast.error("حدث خطأ في تغيير الدور"); return; }
    setUserRolesMap(prev => new Map(prev).set(userId, newRole));
    if (newRole === "teacher") {
      await supabase.from("teacher_profiles").upsert({ user_id: userId, hourly_rate: 0, is_approved: true }, { onConflict: "user_id" });
    }
    if (selectedUser?.user_id === userId) {
      setSelectedUser(prev => prev ? { ...prev, role: newRole } : null);
    }
    toast.success("تم تغيير الدور بنجاح");
  };

  const deleteUser = async (userId: string) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("teacher_profiles").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("user_id", userId);
    setAllUsers(prev => prev.filter(u => u.user_id !== userId));
    if (selectedUser?.user_id === userId) setSelectedUser(null);
    toast.success("تم حذف بيانات المستخدم");
  };

  const roleLabel = (r: string) => {
    switch (r) {
      case "admin": return "مسؤول";
      case "teacher": return "معلم";
      case "parent": return "ولي أمر";
      default: return "طالب";
    }
  };

  const filteredUsers = allUsers.filter(u => {
    const matchSearch = u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.phone?.includes(searchQuery);
    const role = userRolesMap.get(u.user_id) || "student";
    const matchRole = roleFilter === "all" || role === roleFilter;
    return matchSearch && matchRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              إدارة المستخدمين ({filteredUsers.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-56">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الرقم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 rounded-xl h-8 text-xs"
                />
              </div>
              <StatusFilter
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "student", label: "طالب" },
                  { value: "teacher", label: "معلم" },
                  { value: "admin", label: "مسؤول" },
                  { value: "parent", label: "ولي أمر" },
                ]}
                placeholder="جميع الأدوار"
              />
              <ExportCSVButton
                data={filteredUsers.map(u => ({
                  name: u.full_name || "",
                  phone: u.phone || "",
                  role: roleLabel(userRolesMap.get(u.user_id) || "student"),
                  level: u.level || "bronze",
                  date: new Date(u.created_at).toLocaleDateString("ar-SA"),
                }))}
                headers={[
                  { key: "name", label: "الاسم" },
                  { key: "phone", label: "الهاتف" },
                  { key: "role", label: "الدور" },
                  { key: "level", label: "المستوى" },
                  { key: "date", label: "التسجيل" },
                ]}
                filename="المستخدمين"
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
                  <th className="text-right pb-3 font-medium">الصلاحيات</th>
                  <th className="text-right pb-3 font-medium">المستوى</th>
                  <th className="text-right pb-3 font-medium">التسجيل</th>
                  <th className="text-right pb-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((u) => {
                  const userRole = userRolesMap.get(u.user_id) || "student";
                  const userPerms = userPermissionsMap.get(u.user_id) || [];
                  const isCurrentUser = u.user_id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="py-3 font-medium text-foreground">{u.full_name || "—"}</td>
                      <td className="py-3 text-muted-foreground" dir="ltr">{u.phone || "—"}</td>
                      <td className="py-3">
                        <Badge variant={userRole === "admin" ? "default" : userRole === "teacher" ? "secondary" : "outline"} className="text-xs">
                          {roleLabel(userRole)}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {userPerms.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {userPerms.slice(0, 2).map(p => (
                              <Badge key={p} className="bg-primary/10 text-primary border-0 text-[10px]">
                                {PERMISSION_LABELS[p]?.icon} {PERMISSION_LABELS[p]?.label}
                              </Badge>
                            ))}
                            {userPerms.length > 2 && (
                              <Badge variant="outline" className="text-[10px]">+{userPerms.length - 2}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs">{u.level || "bronze"}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString("ar-SA")}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => fetchUserDetail(u)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!isCurrentUser && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-auto px-2 py-1 text-xs ${bannedUsers.has(u.user_id) ? "text-green-600 hover:text-green-700 hover:bg-green-100" : "text-destructive hover:text-destructive hover:bg-destructive/10"}`}
                                onClick={async () => {
                                  const isBanned = bannedUsers.has(u.user_id);
                                  if (isBanned) {
                                    const { data: warnings } = await supabase
                                      .from("user_warnings")
                                      .select("id")
                                      .eq("user_id", u.user_id)
                                      .eq("warning_type", "admin_ban")
                                      .maybeSingle();
                                    if (warnings) {
                                      await supabase.from("user_warnings").update({
                                        is_banned: false, banned_until: null,
                                      }).eq("id", warnings.id);
                                    }
                                    await supabase.from("notifications").insert({
                                      user_id: u.user_id,
                                      title: "✅ تم فك حظر حسابك",
                                      body: "تم فك تقييد حسابك من قبل الإدارة. يمكنك الآن استخدام المنصة بشكل طبيعي.",
                                      type: "account_status",
                                    });
                                    toast.success(`تم فك حظر ${u.full_name}`);
                                  } else {
                                    if (!window.confirm(`هل تريد حظر ${u.full_name}؟`)) return;
                                    const { data: warnings } = await supabase
                                      .from("user_warnings")
                                      .select("id, warning_count")
                                      .eq("user_id", u.user_id)
                                      .eq("warning_type", "admin_ban")
                                      .maybeSingle();
                                    if (warnings) {
                                      await supabase.from("user_warnings").update({
                                        is_banned: true, banned_until: null, warning_count: (warnings as any).warning_count + 1,
                                      }).eq("id", warnings.id);
                                    } else {
                                      await supabase.from("user_warnings").insert({
                                        user_id: u.user_id, warning_type: "admin_ban",
                                        is_banned: true, description: "حظر من قبل الإدارة",
                                      });
                                    }
                                    await supabase.from("notifications").insert({
                                      user_id: u.user_id,
                                      title: "🚫 تم تقييد حسابك",
                                      body: "تم تقييد حسابك من قبل الإدارة. يرجى مراجعة خدمة العملاء لحل الأمر.",
                                      type: "account_status",
                                    });
                                    toast.success(`تم حظر ${u.full_name}`);
                                  }
                                  fetchUsers();
                                }}
                              >
                                {bannedUsers.has(u.user_id) ? "فك الحظر" : "حظر المستخدم"}
                              </Button>
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
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) { setSelectedUser(null); setEditMode(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selectedUser && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    بيانات المستخدم
                  </span>
                  <div className="flex items-center gap-2">
                    {!editMode ? (
                      <Button size="sm" variant="outline" className="rounded-lg text-xs h-8 gap-1" onClick={() => setEditMode(true)}>
                        <Edit className="h-3.5 w-3.5" /> تعديل
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" className="rounded-lg text-xs h-8 gap-1" onClick={saveUserEdit}>
                          <Save className="h-3.5 w-3.5" /> حفظ
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-lg text-xs h-8 gap-1" onClick={() => setEditMode(false)}>
                          <X className="h-3.5 w-3.5" /> إلغاء
                        </Button>
                      </>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* Basic Info */}
                <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-primary" /> المعلومات الأساسية
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">الاسم</Label>
                      {editMode ? (
                        <Input value={editData.full_name} onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))} className="h-9 rounded-lg text-sm mt-1" />
                      ) : (
                        <p className="text-sm font-medium text-foreground mt-1">{selectedUser.full_name || "—"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">الهاتف</Label>
                      {editMode ? (
                        <Input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} className="h-9 rounded-lg text-sm mt-1" dir="ltr" />
                      ) : (
                        <p className="text-sm font-medium text-foreground mt-1" dir="ltr">{selectedUser.phone || "—"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">الدور</Label>
                      <div className="mt-1">
                        <Select
                          value={selectedUser.role}
                          onValueChange={(val) => changeUserRole(selectedUser.user_id, val)}
                          disabled={selectedUser.user_id === currentUser?.id}
                        >
                          <SelectTrigger className="h-9 w-full text-sm rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">طالب</SelectItem>
                            <SelectItem value="teacher">معلم</SelectItem>
                            <SelectItem value="parent">ولي أمر</SelectItem>
                            <SelectItem value="admin">مسؤول</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">المستوى</Label>
                      {editMode ? (
                        <Select value={editData.level} onValueChange={val => setEditData(p => ({ ...p, level: val }))}>
                          <SelectTrigger className="h-9 w-full text-sm rounded-lg mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bronze">برونزي</SelectItem>
                            <SelectItem value="silver">فضي</SelectItem>
                            <SelectItem value="gold">ذهبي</SelectItem>
                            <SelectItem value="platinum">بلاتيني</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-medium text-foreground mt-1">{selectedUser.level || "bronze"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">تاريخ التسجيل</Label>
                      <p className="text-sm text-foreground mt-1">{new Date(selectedUser.created_at).toLocaleDateString("ar-SA")}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">كود الإحالة</Label>
                      <p className="text-sm text-foreground mt-1">{selectedUser.referral_code || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <Award className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
                    <p className="text-lg font-black text-foreground">{selectedUser.points || 0}</p>
                    <p className="text-[10px] text-muted-foreground">النقاط</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <Calendar className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <p className="text-lg font-black text-foreground">{selectedUser.streak || 0}</p>
                    <p className="text-[10px] text-muted-foreground">أيام متتالية</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <BookOpen className="h-4 w-4 mx-auto mb-1 text-secondary" />
                    <p className="text-lg font-black text-foreground">{selectedUser.bookingsAsStudent || 0}</p>
                    <p className="text-[10px] text-muted-foreground">حجوزات كطالب</p>
                  </div>
                  {selectedUser.role === "teacher" && (
                    <div className="bg-muted/40 rounded-xl p-3 text-center">
                      <GraduationCap className="h-4 w-4 mx-auto mb-1 text-green-600" />
                      <p className="text-lg font-black text-foreground">{selectedUser.bookingsAsTeacher || 0}</p>
                      <p className="text-[10px] text-muted-foreground">حجوزات كمعلم</p>
                    </div>
                  )}
                </div>

                {/* Subscriptions */}
                {selectedUser.role === "student" && (
                  <div className="bg-muted/30 rounded-xl p-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4 text-primary" /> الاشتراكات
                    </h3>
                    {selectedUser.subscriptions && selectedUser.subscriptions.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        {selectedUser.subscriptions.map((sub, i) => (
                          <div key={i} className="flex items-center justify-between bg-background/60 rounded-lg p-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{sub.plan_name}</p>
                              <p className="text-xs text-muted-foreground">
                                ينتهي: {new Date(sub.ends_at).toLocaleDateString("ar-SA")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={sub.is_active ? "default" : "outline"} className="text-xs">
                                {sub.is_active ? "نشط" : "منتهي"}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {sub.sessions_remaining} حصة متبقية
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mb-4">لا توجد اشتراكات حالية</p>
                    )}

                    {/* Grant a Plan */}
                    <div className="border-t border-border/50 pt-3 mt-2">
                      <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1">
                        <Plus className="h-3 w-3" /> منح باقة جديدة
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Select value={grantPlanId} onValueChange={setGrantPlanId}>
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="اختر الباقة" />
                          </SelectTrigger>
                          <SelectContent>
                            {availablePlans.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.name_ar} ({p.tier}) — {p.sessions_count} حصة
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={grantDurationDays}
                          onChange={(e) => setGrantDurationDays(parseInt(e.target.value) || 30)}
                          placeholder="عدد الأيام"
                          className="text-xs"
                        />
                        <Button
                          size="sm"
                          onClick={grantPlanToUser}
                          disabled={!grantPlanId || granting}
                          className="text-xs"
                        >
                          {granting ? "جارٍ..." : "منح الباقة"}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        سيتم إنشاء اشتراك نشط فوري مع إشعار للطالب.
                      </p>
                    </div>
                  </div>
                )}

                {/* Teacher Info */}
                {selectedUser.teacherProfile && (
                  <div className="bg-muted/30 rounded-xl p-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <GraduationCap className="h-4 w-4 text-secondary" /> بيانات المعلم
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">السعر/ساعة</span>
                        <p className="font-medium text-foreground">{selectedUser.teacherProfile.hourly_rate} ر.س</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">سنوات الخبرة</span>
                        <p className="font-medium text-foreground">{selectedUser.teacherProfile.years_experience || 0}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">التقييم</span>
                        <p className="font-medium text-foreground flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          {Number(selectedUser.teacherProfile.avg_rating).toFixed(1)} ({selectedUser.teacherProfile.total_reviews})
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">الحصص المكتملة</span>
                        <p className="font-medium text-foreground">{selectedUser.teacherProfile.total_sessions || 0}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">الحالة</span>
                        <div className="flex gap-1 mt-0.5">
                          <Badge variant={selectedUser.teacherProfile.is_approved ? "default" : "destructive"} className="text-[10px]">
                            {selectedUser.teacherProfile.is_approved ? "معتمد" : "غير معتمد"}
                          </Badge>
                          {selectedUser.teacherProfile.is_verified && (
                            <Badge className="bg-green-600 text-white text-[10px]">موثق</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">المواد</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(selectedUser.subjects || []).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                          {(!selectedUser.subjects || selectedUser.subjects.length === 0) && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      {selectedUser.teacherProfile.bio && (
                        <div className="col-span-2">
                          <span className="text-xs text-muted-foreground">النبذة</span>
                          <p className="text-xs text-foreground mt-0.5">{selectedUser.teacherProfile.bio}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bank Info */}
                {selectedUser.bankInfo && (selectedUser.bankInfo.bank_name || selectedUser.bankInfo.iban) && (
                  <div className="bg-secondary/5 rounded-xl p-4 border border-secondary/20">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <CreditCard className="h-4 w-4 text-secondary" /> بيانات الدفع البنكية
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">البنك</span>
                        <p className="font-medium text-foreground mt-0.5">{selectedUser.bankInfo.bank_name || "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">صاحب الحساب</span>
                        <p className="font-medium text-foreground mt-0.5">{selectedUser.bankInfo.account_holder_name || "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground">IBAN</span>
                        <p className="font-medium text-foreground mt-0.5 font-mono text-xs" dir="ltr">{selectedUser.bankInfo.iban || "—"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Certificates */}
                {selectedUser.certificates && selectedUser.certificates.length > 0 && (
                  <div className="bg-muted/30 rounded-xl p-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <Award className="h-4 w-4 text-primary" /> الشهادات والمؤهلات ({selectedUser.certificates.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedUser.certificates.map((c) => (
                        <div key={c.id} className="flex items-center justify-between bg-background/60 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString("ar-SA")}</p>
                            </div>
                          </div>
                          <a href={c.file_url} target="_blank" rel="noopener noreferrer">
                            <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-muted">
                              <FileText className="h-3 w-3" /> عرض
                            </Badge>
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Badges */}
                {selectedUser.badges && selectedUser.badges.length > 0 && (
                  <div className="bg-muted/30 rounded-xl p-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <Award className="h-4 w-4 text-yellow-500" /> الشارات
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedUser.badges.map((b, i) => (
                        <Badge key={i} variant="secondary" className="text-xs gap-1">
                          {b.icon && <span>{b.icon}</span>}
                          {b.name_ar}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Permissions grouped by section */}
                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <KeyRound className="h-4 w-4 text-primary" /> صلاحيات أقسام لوحة الإدارة
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    اختر الأقسام التي يمكن لهذا المستخدم الوصول إليها. كل صلاحية تتحكم في إظهار/إخفاء قسم في لوحة الأدمن.
                  </p>
                  <div className="space-y-4">
                    {Array.from(new Set(Object.values(PERMISSION_LABELS).map(p => p.group))).map(groupName => {
                      const groupPerms = Object.entries(PERMISSION_LABELS).filter(([, info]) => info.group === groupName);
                      const groupKeys = groupPerms.map(([k]) => k);
                      const userPerms = selectedUser.permissions || [];
                      const allChecked = groupKeys.every(k => userPerms.includes(k));
                      return (
                        <div key={groupName} className="border rounded-lg p-3 bg-background/40">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-bold text-primary">{groupName}</h4>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px]"
                              disabled={selectedUser.user_id === currentUser?.id}
                              onClick={() => {
                                groupKeys.forEach(k => {
                                  const has = userPerms.includes(k);
                                  if (allChecked ? has : !has) togglePermission(selectedUser.user_id, k, has);
                                });
                              }}
                            >
                              {allChecked ? "إلغاء الكل" : "منح الكل"}
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {groupPerms.map(([key, info]) => {
                              const hasPermission = userPerms.includes(key);
                              return (
                                <div key={key} className="flex items-center justify-between bg-background/60 rounded-lg p-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-base">{info.icon}</span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-foreground truncate">{info.label}</p>
                                      <p className="text-[10px] text-muted-foreground truncate">{info.description}</p>
                                    </div>
                                  </div>
                                  <Switch
                                    checked={hasPermission}
                                    onCheckedChange={() => togglePermission(selectedUser.user_id, key, hasPermission)}
                                    disabled={selectedUser.user_id === currentUser?.id}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(selectedUser.permissions || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(selectedUser.permissions || []).map(p => (
                        <Badge key={p} className="bg-primary/10 text-primary border-0 text-[10px] gap-1">
                          {PERMISSION_LABELS[p]?.icon} {PERMISSION_LABELS[p]?.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>


                {selectedUser.warnings && selectedUser.warnings.length > 0 && (
                  <div className="bg-destructive/5 rounded-xl p-4 border border-destructive/20">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3 text-destructive">
                      <AlertTriangle className="h-4 w-4" /> التحذيرات ({selectedUser.warnings.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedUser.warnings.map((w, i) => (
                        <div key={i} className="bg-background/60 rounded-lg p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <Badge variant="destructive" className="text-[10px]">{w.warning_type}</Badge>
                            <span className="text-muted-foreground">{new Date(w.created_at).toLocaleDateString("ar-SA")}</span>
                          </div>
                          {w.description && <p className="mt-1 text-foreground">{w.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
