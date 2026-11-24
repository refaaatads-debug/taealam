import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { KeyRound, Search, ShieldCheck, ShieldOff, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PERMISSION_LABELS: Record<string, { label: string; description: string; icon: string; group: string }> = {
  view_overview: { label: "نظرة عامة", description: "عرض الإحصائيات والرسوم البيانية", icon: "📊", group: "الرئيسية" },
  view_advanced_analytics: { label: "التحليلات المتقدمة", description: "عرض المخططات والتحليلات التفصيلية", icon: "📈", group: "الرئيسية" },
  manage_users: { label: "إدارة المستخدمين", description: "عرض وتعديل وحذف المستخدمين", icon: "👥", group: "المستخدمين" },
  manage_student_profiles: { label: "ملفات الطلاب", description: "الوصول لملفات الطلاب التفصيلية", icon: "🎓", group: "المستخدمين" },
  manage_teacher_profiles: { label: "ملفات المعلمين", description: "الوصول لملفات المعلمين التفصيلية", icon: "📁", group: "المستخدمين" },
  manage_pending_teachers: { label: "طلبات اعتماد المعلمين", description: "اعتماد ورفض المعلمين الجدد", icon: "✅", group: "المستخدمين" },
  manage_teachers: { label: "إدارة المعلمين (عام)", description: "صلاحية شاملة على المعلمين", icon: "👨‍🏫", group: "المستخدمين" },
  manage_featured_teachers: { label: "المدرسون المميزون", description: "إدارة المعلمين المميزين على الواجهة", icon: "⭐", group: "المستخدمين" },
  view_teacher_performance: { label: "أداء المعلمين", description: "عرض تقارير أداء المعلمين", icon: "📈", group: "المستخدمين" },
  manage_bookings: { label: "إدارة الحجوزات", description: "عرض وتعديل جميع الحجوزات", icon: "📅", group: "الحصص" },
  manage_sessions_status: { label: "حالات الجلسات", description: "متابعة الجلسات المباشرة", icon: "🟢", group: "الحصص" },
  manage_session_reports: { label: "تقارير الحصص", description: "الوصول لتقارير AI للحصص", icon: "📄", group: "الحصص" },
  manage_session_pricing: { label: "أسعار الحصص", description: "تعديل أسعار ساعات المعلمين", icon: "💵", group: "الحصص" },
  manage_materials: { label: "مراقبة المواد", description: "متابعة المواد التعليمية والتسجيلات", icon: "📚", group: "الحصص" },
  manage_plans: { label: "إدارة الباقات", description: "إنشاء وتعديل باقات الاشتراك", icon: "💳", group: "المالية" },
  manage_coupons: { label: "إدارة الكوبونات", description: "إنشاء وتعديل أكواد الخصم", icon: "🎟️", group: "المالية" },
  manage_withdrawals: { label: "طلبات السحب", description: "مراجعة طلبات سحب أرباح المعلمين", icon: "💸", group: "المالية" },
  manage_teacher_payments: { label: "مدفوعات المعلمين", description: "سجل المدفوعات للمعلمين", icon: "💰", group: "المالية" },
  manage_teacher_earnings: { label: "الأرباح اليدوية", description: "إضافة أرباح يدوية للمعلمين", icon: "✏️", group: "المالية" },
  manage_wallets: { label: "المحافظ والمكالمات", description: "إدارة محافظ المعلمين وسجل المكالمات", icon: "👛", group: "المالية" },
  manage_payments: { label: "إدارة المدفوعات (عام)", description: "صلاحية شاملة للمدفوعات", icon: "💼", group: "المالية" },
  manage_violations: { label: "المخالفات", description: "مراجعة مخالفات الطلاب والمعلمين", icon: "⚠️", group: "الأمان" },
  view_call_transcripts: { label: "تفريغ المكالمات", description: "الاطلاع على نصوص المكالمات", icon: "🎙️", group: "الأمان" },
  manage_ai_audit: { label: "فحص AI", description: "مراجعة جودة استجابات الذكاء الاصطناعي", icon: "🧠", group: "الأمان" },
  manage_content: { label: "إدارة المحتوى", description: "تعديل محتوى الموقع والإعدادات", icon: "📝", group: "النظام" },
  customer_support: { label: "الدعم الفني", description: "الوصول لتذاكر الدعم والرد عليها", icon: "💬", group: "النظام" },
  manage_notifications: { label: "الإشعارات", description: "إرسال إشعارات للمستخدمين", icon: "🔔", group: "النظام" },
  manage_domain_ssl: { label: "حالة SSL/HTTPS", description: "متابعة شهادات الموقع", icon: "🔒", group: "النظام" },
  view_reports: { label: "عرض التقارير (عام)", description: "صلاحية شاملة للتقارير", icon: "📋", group: "النظام" },
};

interface AdminUser {
  user_id: string;
  full_name: string;
  email?: string;
  role: string;
  permissions: string[];
}

const GROUPS = Array.from(new Set(Object.values(PERMISSION_LABELS).map(p => p.group)));

const AdminPermissionsTab = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [permsRes, profilesRes] = await Promise.all([
        (supabase as any).from("user_permissions").select("user_id, permission"),
        supabase.from("profiles").select("user_id, full_name").order("full_name", { ascending: true }),
      ]);

      const permsMap: Record<string, string[]> = {};
      (permsRes.data || []).forEach((p: any) => {
        if (!permsMap[p.user_id]) permsMap[p.user_id] = [];
        permsMap[p.user_id].push(p.permission);
      });

      const list: AdminUser[] = (profilesRes.data || []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name || p.user_id.slice(0, 8),
        role: "user",
        permissions: permsMap[p.user_id] || [],
      }));
      setUsers(list);
      if (selected) {
        const updated = list.find(u => u.user_id === selected.user_id);
        if (updated) setSelected(updated);
      }
    } catch {
      toast.error("فشل تحميل الصلاحيات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (userId: string, permission: string, hasIt: boolean) => {
    try {
      if (hasIt) {
        const { error } = await (supabase as any).from("user_permissions").delete().eq("user_id", userId).eq("permission", permission);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("user_permissions").insert({ user_id: userId, permission, granted_by: currentUser?.id });
        if (error) throw error;
      }
      setUsers(prev => prev.map(u => u.user_id !== userId ? u : {
        ...u,
        permissions: hasIt ? u.permissions.filter(p => p !== permission) : [...u.permissions, permission],
      }));
      setSelected(prev => prev && prev.user_id === userId ? {
        ...prev,
        permissions: hasIt ? prev.permissions.filter(p => p !== permission) : [...prev.permissions, permission],
      } : prev);
      toast.success(hasIt ? `تم إزالة: ${PERMISSION_LABELS[permission]?.label}` : `تم منح: ${PERMISSION_LABELS[permission]?.label}`);
    } catch {
      toast.error("خطأ في تحديث الصلاحية");
    }
  };

  const grantAll = async (userId: string) => {
    const allKeys = Object.keys(PERMISSION_LABELS);
    const user = users.find(u => u.user_id === userId);
    const missing = allKeys.filter(k => !user?.permissions.includes(k));
    for (const k of missing) await toggle(userId, k, false);
  };

  const revokeAll = async (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    for (const k of (user?.permissions || [])) await toggle(userId, k, true);
  };

  const filtered = users.filter(u => u.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col gap-4 h-full lg:flex-row" dir="rtl">
      {/* Users List */}
      <div className="w-full lg:w-80 shrink-0 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم..." className="pr-9 h-9" />
          </div>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={load} disabled={loading}>
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          </Button>
        </div>

        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              المستخدمون ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">لا يوجد مستخدمون</div>
            ) : (
              <div className="divide-y">
                {filtered.map(u => (
                  <button
                    key={u.user_id}
                    onClick={() => setSelected(u)}
                    className={"w-full flex items-center gap-3 p-3 text-right hover:bg-muted/50 transition-colors " + (selected?.user_id === u.user_id ? "bg-primary/5 border-r-2 border-primary" : "")}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{u.full_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">{u.permissions.length} صلاحية</p>
                    </div>
                    {u.permissions.length > 0 ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <ShieldOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Permissions Panel */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center text-muted-foreground p-8">
              <KeyRound className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">اختر مستخدماً من القائمة لإدارة صلاحياته</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* User Header */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">{selected.full_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold">{selected.full_name}</p>
                      <p className="text-xs text-muted-foreground">{selected.permissions.length} صلاحية مفعّلة من أصل {Object.keys(PERMISSION_LABELS).length}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={selected.user_id === currentUser?.id} onClick={() => grantAll(selected.user_id)}>
                      <ShieldCheck className="h-3.5 w-3.5 ml-1" /> منح الكل
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/5" disabled={selected.user_id === currentUser?.id} onClick={() => revokeAll(selected.user_id)}>
                      <ShieldOff className="h-3.5 w-3.5 ml-1" /> إزالة الكل
                    </Button>
                  </div>
                </div>
                {selected.permissions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selected.permissions.map(p => (
                      <Badge key={p} className="bg-primary/10 text-primary border-0 text-[10px] gap-1">
                        {PERMISSION_LABELS[p]?.icon} {PERMISSION_LABELS[p]?.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Permission Groups */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {GROUPS.map(groupName => {
                const groupPerms = Object.entries(PERMISSION_LABELS).filter(([, info]) => info.group === groupName);
                const groupKeys = groupPerms.map(([k]) => k);
                const userPerms = selected.permissions;
                const allChecked = groupKeys.every(k => userPerms.includes(k));
                const someChecked = groupKeys.some(k => userPerms.includes(k));
                return (
                  <Card key={groupName}>
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs text-primary">{groupName}</CardTitle>
                        <div className="flex items-center gap-2">
                          {someChecked && !allChecked && <span className="text-[10px] text-amber-600">{groupKeys.filter(k => userPerms.includes(k)).length}/{groupKeys.length}</span>}
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={selected.user_id === currentUser?.id}
                            onClick={() => groupKeys.forEach(k => { const has = userPerms.includes(k); if (allChecked ? has : !has) toggle(selected.user_id, k, has); })}>
                            {allChecked ? "إلغاء الكل" : "منح الكل"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-2">
                      {groupPerms.map(([key, info]) => {
                        const hasPerm = userPerms.includes(key);
                        return (
                          <div key={key} className={"flex items-center justify-between rounded-lg p-2 transition-colors " + (hasPerm ? "bg-emerald-500/8 border border-emerald-500/20" : "bg-muted/40")}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base shrink-0">{info.icon}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{info.label}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{info.description}</p>
                              </div>
                            </div>
                            <Switch
                              checked={hasPerm}
                              onCheckedChange={() => toggle(selected.user_id, key, hasPerm)}
                              disabled={selected.user_id === currentUser?.id}
                              className="shrink-0 mr-2"
                            />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPermissionsTab;
