import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, UserPlus, History, Search, Crown, KeyRound,
  Users, Clock, FileText, Trash2, RefreshCw, Settings2, Globe, Monitor,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { logAdminAction } from "@/lib/auditLog";
import AuditLogExport, { AuditRow } from "./AuditLogExport";
import AuditAdvancedFilter, { AuditFilters, DEFAULT_FILTERS, applyAuditFilters } from "./AuditAdvancedFilter";
import PermissionEditorDialog from "./PermissionEditorDialog";
import { toast } from "sonner";

const ALL_PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: "view_overview", label: "عرض النظرة العامة", group: "عرض" },
  { key: "view_reports", label: "عرض التقارير", group: "عرض" },
  { key: "view_teacher_performance", label: "عرض أداء المعلمين", group: "عرض" },
  { key: "manage_users", label: "إدارة المستخدمين", group: "إدارة" },
  { key: "manage_teachers", label: "إدارة المعلمين", group: "إدارة" },
  { key: "manage_bookings", label: "إدارة الحجوزات", group: "إدارة" },
  { key: "manage_session_reports", label: "تقارير الحصص", group: "إدارة" },
  { key: "manage_session_pricing", label: "تسعير الحصص", group: "إدارة" },
  { key: "manage_materials", label: "المواد التعليمية", group: "إدارة" },
  { key: "manage_plans", label: "خطط الاشتراك", group: "إدارة" },
  { key: "manage_coupons", label: "الكوبونات", group: "إدارة" },
  { key: "manage_content", label: "إدارة المحتوى", group: "إدارة" },
  { key: "manage_notifications", label: "الإشعارات", group: "إدارة" },
  { key: "manage_payments", label: "المدفوعات", group: "مالي" },
  { key: "manage_withdrawals", label: "طلبات السحب", group: "مالي" },
  { key: "manage_teacher_payments", label: "مدفوعات المعلمين", group: "مالي" },
  { key: "manage_teacher_earnings", label: "أرباح المعلمين", group: "مالي" },
  { key: "manage_wallets", label: "المحافظ", group: "مالي" },
  { key: "manage_violations", label: "المخالفات", group: "أمان" },
  { key: "manage_ai_audit", label: "تدقيق الذكاء الاصطناعي", group: "أمان" },
  { key: "customer_support", label: "دعم العملاء", group: "دعم" },
  { key: "manage_admins", label: "إدارة فريق الإدارة", group: "حساس" },
];

const CATEGORY_LABELS: Record<string, string> = {
  team_management: "فريق الإدارة",
  teachers: "المعلمون",
  withdrawals: "السحوبات",
  support: "الدعم",
  violations: "المخالفات",
  bookings: "الحجوزات",
  users: "المستخدمون",
  payments: "المدفوعات",
  earnings: "الأرباح",
  wallets: "المحافظ",
  plans: "الخطط",
  coupons: "الكوبونات",
  settings: "الإعدادات",
  notifications: "الإشعارات",
  general: "عام",
};

type TeamMember = {
  user_id: string;
  full_name: string;
  email?: string;
  is_full_admin: boolean;
  permissions: string[];
};

type AuditEntry = {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  category: string;
  description: string | null;
  target_table: string | null;
  target_id: string | null;
  metadata: any;
  created_at: string;
};

export default function AdminTeamManagementTab() {
  const { isFullAdmin, can } = useAdminPermissions();
  const canManage = isFullAdmin || can("manage_admins");

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [searchTeam, setSearchTeam] = useState("");
  const [searchLog, setSearchLog] = useState("");
  const [logCategory, setLogCategory] = useState<string>("all");

  // إنشاء حساب
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    make_full_admin: false,
    permissions: new Set<string>(),
  });

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin" as any);
      const adminIds = new Set((admins || []).map((r: any) => r.user_id));

      const { data: perms } = await (supabase as any)
        .from("user_permissions")
        .select("user_id, permission");
      const permMap = new Map<string, string[]>();
      (perms || []).forEach((p: any) => {
        if (!permMap.has(p.user_id)) permMap.set(p.user_id, []);
        permMap.get(p.user_id)!.push(p.permission);
      });

      const allIds = new Set<string>([...adminIds, ...permMap.keys()]);
      if (allIds.size === 0) { setMembers([]); return; }

      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", Array.from(allIds));
      const profileMap = new Map<string, string>();
      (profiles || []).forEach((p) => profileMap.set(p.user_id, p.full_name || ""));

      setMembers(Array.from(allIds).map((uid) => ({
        user_id: uid,
        full_name: profileMap.get(uid) || "—",
        is_full_admin: adminIds.has(uid),
        permissions: permMap.get(uid) || [],
      })));
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLogs((data || []) as AuditEntry[]);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
    fetchLogs();
    const ch = supabase
      .channel("admin-audit-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_audit_log" }, () => fetchLogs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleCreate = async () => {
    if (!form.email || !form.password || form.password.length < 8) {
      toast.error("يرجى إدخال بريد صالح وكلمة مرور لا تقل عن 8 أحرف");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-admin-account", {
        body: {
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim() || null,
          make_full_admin: form.make_full_admin,
          permissions: Array.from(form.permissions),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("تم إنشاء الحساب الإداري بنجاح");
      setCreateOpen(false);
      setForm({ email: "", password: "", full_name: "", make_full_admin: false, permissions: new Set() });
      fetchTeam();
      fetchLogs();
    } catch (e: any) {
      toast.error(e.message || "فشل إنشاء الحساب");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePermission = async (member: TeamMember, perm: string, enable: boolean) => {
    try {
      if (enable) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("user_permissions").insert({
          user_id: member.user_id, permission: perm, granted_by: user?.id,
        });
        if (error) throw error;
        await logAdminAction({
          action: "grant_permission", category: "team_management",
          description: `منح صلاحية ${perm} لـ ${member.full_name}`,
          target_table: "user_permissions", target_id: member.user_id,
          metadata: { permission: perm },
        });
      } else {
        const { error } = await (supabase as any).from("user_permissions")
          .delete().eq("user_id", member.user_id).eq("permission", perm);
        if (error) throw error;
        await logAdminAction({
          action: "revoke_permission", category: "team_management",
          description: `سحب صلاحية ${perm} من ${member.full_name}`,
          target_table: "user_permissions", target_id: member.user_id,
          metadata: { permission: perm },
        });
      }
      toast.success(enable ? "تم منح الصلاحية" : "تم سحب الصلاحية");
      fetchTeam();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    }
  };

  const removeAdminRole = async (member: TeamMember) => {
    if (!isFullAdmin) { toast.error("فقط المدير العام يمكنه إزالة دور الأدمن"); return; }
    if (!confirm(`إزالة جميع صلاحيات ${member.full_name}؟`)) return;
    try {
      if (member.is_full_admin) {
        await supabase.from("user_roles").update({ role: "student" as any }).eq("user_id", member.user_id);
      }
      await (supabase as any).from("user_permissions").delete().eq("user_id", member.user_id);
      await logAdminAction({
        action: "remove_admin", category: "team_management",
        description: `إزالة كل صلاحيات ${member.full_name}`,
        target_id: member.user_id,
      });
      toast.success("تم إزالة العضو من الفريق");
      fetchTeam();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    }
  };

  const filteredMembers = members.filter((m) =>
    !searchTeam || m.full_name.toLowerCase().includes(searchTeam.toLowerCase()) || m.user_id.includes(searchTeam)
  );
  const filteredLogs = logs.filter((l) => {
    const matchCat = logCategory === "all" || l.category === logCategory;
    const matchSearch = !searchLog ||
      l.actor_name?.toLowerCase().includes(searchLog.toLowerCase()) ||
      l.action?.toLowerCase().includes(searchLog.toLowerCase()) ||
      l.description?.toLowerCase().includes(searchLog.toLowerCase());
    return matchCat && matchSearch;
  });

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  };

  const groupedPerms = ALL_PERMISSIONS.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p);
    return acc;
  }, {} as Record<string, typeof ALL_PERMISSIONS>);

  return (
    <div className="space-y-4" dir="rtl">
      <Tabs defaultValue="team" className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="team" className="gap-2">
            <Users className="h-4 w-4" /> فريق الإدارة
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="h-4 w-4" /> سجل العمليات
          </TabsTrigger>
        </TabsList>

        {/* فريق الإدارة */}
        <TabsContent value="team" className="space-y-4 mt-4">
          <Card className="border border-border/50">
            <CardHeader className="bg-gradient-to-l from-primary/5 to-transparent">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  فريق الإدارة
                  <Badge variant="outline">{members.length}</Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالاسم..."
                      value={searchTeam}
                      onChange={(e) => setSearchTeam(e.target.value)}
                      className="pr-9 w-56 h-9"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchTeam} className="gap-1">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  {canManage && (
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-1">
                          <UserPlus className="h-4 w-4" /> حساب إداري جديد
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5" /> إنشاء حساب إداري جديد
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label>الاسم الكامل</Label>
                              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="اسم العضو" />
                            </div>
                            <div>
                              <Label>البريد الإلكتروني *</Label>
                              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@example.com" />
                            </div>
                            <div className="md:col-span-2">
                              <Label className="flex items-center gap-1">
                                <KeyRound className="h-3 w-3" /> كلمة المرور المؤقتة *
                              </Label>
                              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="8 أحرف على الأقل" />
                              <p className="text-[10px] text-muted-foreground mt-1">يجب على العضو تغييرها بعد أول تسجيل دخول</p>
                            </div>
                          </div>

                          {isFullAdmin && (
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-warning/5 border-warning/30">
                              <div className="flex items-center gap-2">
                                <Crown className="h-4 w-4 text-warning" />
                                <div>
                                  <p className="text-sm font-bold">مدير عام (وصول كامل)</p>
                                  <p className="text-[11px] text-muted-foreground">سيكون له كل الصلاحيات تلقائياً</p>
                                </div>
                              </div>
                              <Switch checked={form.make_full_admin} onCheckedChange={(v) => setForm({ ...form, make_full_admin: v })} />
                            </div>
                          )}

                          {!form.make_full_admin && (
                            <div className="space-y-3">
                              <Label className="text-sm font-bold">الصلاحيات الممنوحة</Label>
                              {Object.entries(groupedPerms).map(([group, perms]) => (
                                <div key={group} className="space-y-1.5">
                                  <p className="text-xs font-bold text-muted-foreground">{group}</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                    {perms.map((p) => (
                                      <label key={p.key} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/40 cursor-pointer">
                                        <Checkbox
                                          checked={form.permissions.has(p.key)}
                                          onCheckedChange={(v) => {
                                            const next = new Set(form.permissions);
                                            if (v) next.add(p.key); else next.delete(p.key);
                                            setForm({ ...form, permissions: next });
                                          }}
                                        />
                                        <span className="text-xs">{p.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
                          <Button onClick={handleCreate} disabled={submitting}>
                            {submitting ? "جاري الإنشاء..." : "إنشاء الحساب"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">جاري التحميل...</div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">لا يوجد أعضاء</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {filteredMembers.map((m) => (
                    <div key={m.user_id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            {m.is_full_admin ? <Crown className="h-5 w-5 text-warning" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
                          </div>
                          <div>
                            <p className="font-bold text-sm flex items-center gap-2">
                              {m.full_name}
                              {m.is_full_admin && <Badge className="text-[9px] h-4 px-1.5 bg-warning/10 text-warning border-warning/30">مدير عام</Badge>}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">{m.user_id.slice(0, 8)}...</p>
                          </div>
                        </div>
                        {canManage && !m.is_full_admin && (
                          <Button size="sm" variant="ghost" onClick={() => removeAdminRole(m)} className="text-destructive h-7 gap-1 text-[11px]">
                            <Trash2 className="h-3 w-3" /> إزالة
                          </Button>
                        )}
                      </div>
                      {!m.is_full_admin && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {ALL_PERMISSIONS.map((p) => {
                            const has = m.permissions.includes(p.key);
                            return (
                              <button
                                key={p.key}
                                onClick={() => canManage && togglePermission(m, p.key, !has)}
                                disabled={!canManage}
                                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                                  has
                                    ? "bg-primary/10 text-primary border-primary/30"
                                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted"
                                } ${!canManage ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                              >
                                {has ? "✓ " : ""}{p.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* سجل العمليات */}
        <TabsContent value="audit" className="space-y-4 mt-4">
          <Card className="border border-border/50">
            <CardHeader className="bg-gradient-to-l from-secondary/5 to-transparent">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-secondary" />
                  سجل عمليات الإدارة
                  <Badge variant="outline">{filteredLogs.length}</Badge>
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="بحث..." value={searchLog} onChange={(e) => setSearchLog(e.target.value)} className="pr-9 w-56 h-9" />
                  </div>
                  <Select value={logCategory} onValueChange={setLogCategory}>
                    <SelectTrigger className="w-44 h-9">
                      <Filter className="h-3 w-3 ml-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الفئات</SelectItem>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {logsLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">جاري تحميل السجل...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">لا توجد عمليات مسجّلة</div>
              ) : (
                <ScrollArea className="h-[560px]">
                  <div className="divide-y divide-border/50">
                    {filteredLogs.map((l) => (
                      <div key={l.id} className="p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold truncate">{l.actor_name || "مستخدم"}</p>
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                                {l.actor_role === "admin" ? "مدير عام" : l.actor_role}
                              </Badge>
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-secondary/5 text-secondary border-secondary/20">
                                {CATEGORY_LABELS[l.category] || l.category}
                              </Badge>
                            </div>
                            <p className="text-xs text-foreground">
                              <span className="font-bold">{l.action}</span>
                              {l.description ? ` — ${l.description}` : ""}
                            </p>
                            {l.target_id && (
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {l.target_table || "هدف"} · {l.target_id.slice(0, 12)}...
                              </p>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                            <Clock className="h-2.5 w-2.5" />
                            {fmtDate(l.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
