import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertTriangle, Ban, ShieldCheck, Trash2, RefreshCw, Calendar,
  ShieldOff, GraduationCap, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/auditLog";

const TYPE_LABELS: Record<string, string> = {
  contact_sharing: "مشاركة معلومات اتصال",
  platform_mention: "ذكر منصة خارجية",
  coded_message: "رسالة مشفرة",
  chat_violation: "مخالفة محادثة",
  contact_violation: "محاولة تواصل خارجي",
  excessive_cancellation: "إلغاءات متكررة",
  admin_ban: "حظر إداري",
  manual: "تحذير يدوي",
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ar-SA")} · ${d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
};

type WarningRow = {
  id: string;
  user_id: string;
  warning_type: string;
  warning_count: number;
  is_banned: boolean;
  banned_until: string | null;
  description: string | null;
  created_at: string;
  user_name?: string;
  user_role?: string;
};

interface Props {
  /** Optionally restrict to a specific role (used inside the larger ViolationsTab) */
  roleFilter?: "all" | "student" | "teacher";
}

export default function UserWarningsList({ roleFilter = "all" }: Props) {
  const [rows, setRows] = useState<WarningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "active_ban" | "expired">("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_warnings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map((r: any) => r.user_id))];
      if (userIds.length === 0) { setRows([]); return; }

      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);
      const nameMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p.full_name]));
      const roleMap = new Map((rolesRes.data || []).map((r: any) => [r.user_id, r.role]));

      setRows((data || []).map((w: any) => ({
        ...w,
        user_name: nameMap.get(w.user_id) || "غير معروف",
        user_role: roleMap.get(w.user_id) || "student",
      })));
    } catch (e: any) {
      toast.error(e.message || "فشل تحميل التحذيرات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const ch = supabase
      .channel("admin-user-warnings")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_warnings" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    return rows.filter((r) => {
      if (roleFilter !== "all" && r.user_role !== roleFilter) return false;
      if (tab === "active_ban") {
        if (!r.is_banned) return false;
        if (r.banned_until && new Date(r.banned_until).getTime() < now) return false;
      }
      if (tab === "expired") {
        if (!r.banned_until) return false;
        if (new Date(r.banned_until).getTime() >= now) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const blob = `${r.user_name || ""} ${r.warning_type} ${r.description || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, roleFilter, tab, search]);

  const liftBan = async (row: WarningRow) => {
    if (!confirm(`رفع الحظر عن ${row.user_name}؟`)) return;
    const { error } = await supabase.from("user_warnings")
      .update({ is_banned: false, banned_until: null })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("notifications").insert({
      user_id: row.user_id,
      title: "✅ تم رفع الحظر",
      body: "تم رفع الحظر عن حسابك. يمكنك العودة لاستخدام المنصة.",
      type: "warning",
    });
    await logAdminAction({
      action: "lift_ban", category: "violations",
      description: `رفع حظر عن ${row.user_name}`,
      target_table: "user_warnings", target_id: row.id,
      before: { is_banned: row.is_banned, banned_until: row.banned_until },
      after: { is_banned: false, banned_until: null },
    });
    toast.success("تم رفع الحظر");
    fetchData();
  };

  const resetCount = async (row: WarningRow) => {
    if (!confirm(`إعادة تعيين عداد التحذيرات لـ ${row.user_name}؟`)) return;
    const { error } = await supabase.from("user_warnings")
      .update({ warning_count: 0, is_banned: false, banned_until: null })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await logAdminAction({
      action: "reset_warnings", category: "violations",
      description: `إعادة تعيين عداد تحذيرات ${row.user_name}`,
      target_table: "user_warnings", target_id: row.id,
      before: { warning_count: row.warning_count, is_banned: row.is_banned },
      after: { warning_count: 0, is_banned: false },
    });
    toast.success("تم إعادة التعيين");
    fetchData();
  };

  const deleteWarning = async (row: WarningRow) => {
    if (!confirm("حذف هذا التحذير نهائياً؟")) return;
    const { error } = await supabase.from("user_warnings").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await logAdminAction({
      action: "delete_warning", category: "violations",
      description: `حذف تحذير ${TYPE_LABELS[row.warning_type] || row.warning_type} عن ${row.user_name}`,
      target_table: "user_warnings", target_id: row.id,
      before: row,
    });
    toast.success("تم الحذف");
    fetchData();
  };

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      all: rows.filter((r) => roleFilter === "all" || r.user_role === roleFilter).length,
      active_ban: rows.filter((r) =>
        (roleFilter === "all" || r.user_role === roleFilter)
        && r.is_banned
        && (!r.banned_until || new Date(r.banned_until).getTime() >= now)
      ).length,
      expired: rows.filter((r) =>
        (roleFilter === "all" || r.user_role === roleFilter)
        && r.banned_until && new Date(r.banned_until).getTime() < now
      ).length,
    };
  }, [rows, roleFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {filtered.length} تحذير
          </Badge>
          <Badge variant="outline" className="gap-1 bg-destructive/5 text-destructive border-destructive/30">
            <Ban className="h-3 w-3" />
            {counts.active_ban} محظور حالياً
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 h-9 text-xs"
          />
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1 h-9">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList className="grid grid-cols-3 max-w-md">
          <TabsTrigger value="all">الكل ({counts.all})</TabsTrigger>
          <TabsTrigger value="active_ban">محظور ({counts.active_ban})</TabsTrigger>
          <TabsTrigger value="expired">انتهى ({counts.expired})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-10 w-10 text-success mx-auto mb-2 opacity-60" />
          لا توجد تحذيرات
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const banExpired = r.banned_until && new Date(r.banned_until).getTime() < Date.now();
            const stillBanned = r.is_banned && !banExpired;
            return (
              <div
                key={r.id}
                className={`p-4 rounded-xl border ${
                  stillBanned
                    ? "bg-destructive/5 border-destructive/30"
                    : r.warning_count >= 3
                      ? "bg-warning/5 border-warning/30"
                      : "bg-muted/20 border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm">{r.user_name}</p>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {r.user_role === "teacher" ? <BookOpen className="h-2.5 w-2.5" /> : <GraduationCap className="h-2.5 w-2.5" />}
                        {r.user_role === "teacher" ? "معلم" : "طالب"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {TYPE_LABELS[r.warning_type] || r.warning_type}
                      </Badge>
                      {stillBanned && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <Ban className="h-2.5 w-2.5" /> محظور
                        </Badge>
                      )}
                      {banExpired && (
                        <Badge variant="secondary" className="text-[10px]">انتهى الحظر</Badge>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" />
                        {fmt(r.created_at)}
                      </span>
                      <span>
                        التحذيرات:{" "}
                        <span className={`font-bold ${r.warning_count >= 3 ? "text-destructive" : "text-foreground"}`}>
                          {r.warning_count}/3
                        </span>
                      </span>
                      {r.banned_until && (
                        <span>
                          {banExpired ? "انتهى:" : "ينتهي:"} {fmt(r.banned_until)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {stillBanned && (
                      <Button size="sm" variant="outline" onClick={() => liftBan(r)} className="h-7 gap-1 text-[11px]">
                        <ShieldOff className="h-3 w-3" /> رفع الحظر
                      </Button>
                    )}
                    {r.warning_count > 0 && (
                      <Button size="sm" variant="outline" onClick={() => resetCount(r)} className="h-7 gap-1 text-[11px]">
                        <RefreshCw className="h-3 w-3" /> إعادة تعيين
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deleteWarning(r)} className="h-7 gap-1 text-[11px] text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
