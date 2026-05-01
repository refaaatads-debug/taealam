import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Ban, ShieldCheck, Trash2, RefreshCw, Calendar,
  ShieldOff, GraduationCap, BookOpen, Lock, Eye, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/auditLog";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import WarningsAdvancedFilter, {
  applyWarningFilters, DEFAULT_WARNING_FILTERS, type WarningFilters,
} from "./WarningsAdvancedFilter";
import WarningsExport from "./WarningsExport";
import WarningDetailsDialog from "./WarningDetailsDialog";

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

type DeliveryStatus = "sent" | "failed";
type DeliveryMap = Record<string, { kind: "lift_ban" | "reset"; status: DeliveryStatus; at: number }>;

interface Props {
  roleFilter?: "all" | "student" | "teacher";
}

export default function UserWarningsList({ roleFilter = "all" }: Props) {
  const { isFullAdmin, can, loading: permLoading } = useAdminPermissions();

  // Permission gates
  const canManage = isFullAdmin || can("manage_violations");
  const canLiftBan = canManage;
  const canReset = canManage;
  const canDelete = isFullAdmin; // delete restricted to full admins only

  const [rows, setRows] = useState<WarningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<WarningFilters>({
    ...DEFAULT_WARNING_FILTERS,
    role: roleFilter,
  });
  const [detailsRow, setDetailsRow] = useState<WarningRow | null>(null);
  const [delivery, setDelivery] = useState<DeliveryMap>({});

  const setDeliveryFor = (id: string, kind: "lift_ban" | "reset", status: DeliveryStatus) => {
    setDelivery((d) => ({ ...d, [id]: { kind, status, at: Date.now() } }));
    // Auto-clear status badge after 8 seconds for cleanliness
    window.setTimeout(() => {
      setDelivery((d) => {
        const next = { ...d };
        if (next[id] && Date.now() - next[id].at >= 8000) delete next[id];
        return next;
      });
    }, 8500);
  };

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

  // Keep external roleFilter in sync with filter state
  useEffect(() => {
    setFilters((f) => ({ ...f, role: roleFilter }));
  }, [roleFilter]);

  const availableTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.warning_type))).sort(),
    [rows]
  );

  const filtered = useMemo(() => applyWarningFilters(rows, filters), [rows, filters]);

  const liftBan = async (row: WarningRow) => {
    if (!canLiftBan) { toast.error("لا تملك صلاحية رفع الحظر"); return; }
    if (!confirm(`رفع الحظر عن ${row.user_name}؟`)) return;

    const { error } = await supabase.from("user_warnings")
      .update({ is_banned: false, banned_until: null })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }

    // Send notification + track delivery status
    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: row.user_id,
      title: "✅ تم رفع الحظر",
      body: "تم رفع الحظر عن حسابك. يمكنك العودة لاستخدام المنصة.",
      type: "warning",
    });
    setDeliveryFor(row.id, "lift_ban", notifErr ? "failed" : "sent");
    if (notifErr) {
      toast.warning(`تم رفع الحظر — لكن فشل إرسال الإشعار: ${notifErr.message}`);
    } else {
      toast.success("تم رفع الحظر وإرسال إشعار للمستخدم");
    }

    await logAdminAction({
      action: "lift_ban", category: "violations",
      description: `رفع حظر عن ${row.user_name}`,
      target_table: "user_warnings", target_id: row.id,
      before: { is_banned: row.is_banned, banned_until: row.banned_until },
      after: { is_banned: false, banned_until: null },
      metadata: { notification_delivered: !notifErr },
    });
    fetchData();
  };

  const resetCount = async (row: WarningRow) => {
    if (!canReset) { toast.error("لا تملك صلاحية إعادة التعيين"); return; }
    if (!confirm(`إعادة تعيين عداد التحذيرات لـ ${row.user_name}؟`)) return;

    const { error } = await supabase.from("user_warnings")
      .update({ warning_count: 0, is_banned: false, banned_until: null })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }

    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: row.user_id,
      title: "🔔 تم إعادة تعيين عداد التحذيرات",
      body: "تم إعادة تعيين عداد التحذيرات الخاص بك. يرجى الالتزام بسياسة المنصة.",
      type: "warning",
    });
    setDeliveryFor(row.id, "reset", notifErr ? "failed" : "sent");
    if (notifErr) {
      toast.warning(`تم إعادة التعيين — لكن فشل إرسال الإشعار: ${notifErr.message}`);
    } else {
      toast.success("تم إعادة التعيين وإرسال إشعار للمستخدم");
    }

    await logAdminAction({
      action: "reset_warnings", category: "violations",
      description: `إعادة تعيين عداد تحذيرات ${row.user_name}`,
      target_table: "user_warnings", target_id: row.id,
      before: { warning_count: row.warning_count, is_banned: row.is_banned },
      after: { warning_count: 0, is_banned: false },
      metadata: { notification_delivered: !notifErr },
    });
    fetchData();
  };

  const deleteWarning = async (row: WarningRow) => {
    if (!canDelete) { toast.error("الحذف متاح للمدير العام فقط"); return; }
    if (!confirm("حذف هذا التحذير نهائياً؟ لا يمكن التراجع.")) return;
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
    const scoped = rows.filter((r) => roleFilter === "all" || r.user_role === roleFilter);
    return {
      total: scoped.length,
      active_ban: scoped.filter((r) =>
        r.is_banned && (!r.banned_until || new Date(r.banned_until).getTime() >= now)
      ).length,
      shown: filtered.length,
    };
  }, [rows, filtered, roleFilter]);

  const roleLabel = isFullAdmin ? "مدير عام" : canManage ? "مراجع تحذيرات" : "صلاحية محدودة";

  return (
    <div className="space-y-3">
      {/* Header with role badge + export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {counts.shown} / {counts.total} تحذير
          </Badge>
          <Badge variant="outline" className="gap-1 bg-destructive/5 text-destructive border-destructive/30">
            <Ban className="h-3 w-3" />
            {counts.active_ban} محظور حالياً
          </Badge>
          {!permLoading && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <ShieldCheck className="h-2.5 w-2.5" />
              {roleLabel}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <WarningsExport rows={filtered} typeLabels={TYPE_LABELS} />
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1 h-9">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Advanced filter */}
      <WarningsAdvancedFilter
        filters={filters}
        setFilters={setFilters}
        typeLabels={TYPE_LABELS}
        availableTypes={availableTypes}
      />

      {/* Permission notice for non-managers */}
      {!permLoading && !canManage && (
        <div className="p-3 rounded-lg border bg-muted/30 text-xs flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span>أنت في وضع العرض فقط. تواصل مع المدير العام لمنحك صلاحية <strong>manage_violations</strong> لاتخاذ إجراءات.</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-10 w-10 text-success mx-auto mb-2 opacity-60" />
          لا توجد تحذيرات مطابقة للفلتر
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const banExpired = r.banned_until && new Date(r.banned_until).getTime() < Date.now();
            const stillBanned = r.is_banned && !banExpired;
            const delivState = delivery[r.id];
            return (
              <div
                key={r.id}
                onClick={() => setDetailsRow(r)}
                className={`p-4 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${
                  stillBanned
                    ? "bg-destructive/5 border-destructive/30 hover:border-destructive/50"
                    : r.warning_count >= 3
                      ? "bg-warning/5 border-warning/30 hover:border-warning/50"
                      : "bg-muted/20 border-border hover:border-foreground/20"
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
                      {delivState && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] gap-1 ${
                            delivState.status === "sent"
                              ? "bg-success/10 text-success border-success/30"
                              : "bg-destructive/10 text-destructive border-destructive/30"
                          }`}
                        >
                          {delivState.status === "sent" ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                          {delivState.status === "sent" ? "تم تسليم الإشعار" : "فشل الإشعار"}
                        </Badge>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
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
                  <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setDetailsRow(r)}
                      className="h-7 gap-1 text-[11px]"
                    >
                      <Eye className="h-3 w-3" /> تفاصيل
                    </Button>

                    {stillBanned && canLiftBan && (
                      <Button size="sm" variant="outline" onClick={() => liftBan(r)} className="h-7 gap-1 text-[11px]">
                        <ShieldOff className="h-3 w-3" /> رفع الحظر
                      </Button>
                    )}
                    {stillBanned && !canLiftBan && (
                      <Button size="sm" variant="outline" disabled className="h-7 gap-1 text-[11px] opacity-60">
                        <Lock className="h-3 w-3" /> رفع الحظر
                      </Button>
                    )}

                    {r.warning_count > 0 && canReset && (
                      <Button size="sm" variant="outline" onClick={() => resetCount(r)} className="h-7 gap-1 text-[11px]">
                        <RefreshCw className="h-3 w-3" /> إعادة تعيين
                      </Button>
                    )}

                    {canDelete ? (
                      <Button size="sm" variant="ghost" onClick={() => deleteWarning(r)} className="h-7 gap-1 text-[11px] text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled className="h-7 gap-1 text-[11px] opacity-50" title="الحذف للمدير العام فقط">
                        <Lock className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WarningDetailsDialog
        warning={detailsRow}
        typeLabels={TYPE_LABELS}
        open={!!detailsRow}
        onOpenChange={(o) => !o && setDetailsRow(null)}
        canLiftBan={canLiftBan}
        canReset={canReset}
        canDelete={canDelete}
        onLiftBan={liftBan}
        onReset={resetCount}
        onDelete={deleteWarning}
      />
    </div>
  );
}
