import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle, Ban, Calendar, ShieldOff, RefreshCw, Trash2, User, Clock,
  History, ShieldCheck, Lock,
} from "lucide-react";

interface WarningDetails {
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
}

interface AuditEntry {
  id: string;
  action: string;
  description: string | null;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
  before_data: any;
  after_data: any;
  ip_address: string | null;
}

interface Props {
  warning: WarningDetails | null;
  typeLabels: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canLiftBan: boolean;
  canReset: boolean;
  canDelete: boolean;
  onLiftBan: (w: WarningDetails) => void | Promise<void>;
  onReset: (w: WarningDetails) => void | Promise<void>;
  onDelete: (w: WarningDetails) => void | Promise<void>;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "—";

const ACTION_LABELS: Record<string, string> = {
  lift_ban: "رفع الحظر",
  reset_warnings: "إعادة تعيين العداد",
  delete_warning: "حذف التحذير",
  manual_ban: "حظر يدوي",
  manual_warning: "تحذير يدوي",
};

export default function WarningDetailsDialog({
  warning, typeLabels, open, onOpenChange,
  canLiftBan, canReset, canDelete,
  onLiftBan, onReset, onDelete,
}: Props) {
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open || !warning) return;
    setLoadingHistory(true);
    (async () => {
      const { data } = await supabase
        .from("admin_audit_log")
        .select("id, action, description, actor_name, actor_role, created_at, before_data, after_data, ip_address")
        .eq("target_table", "user_warnings")
        .eq("target_id", warning.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setHistory((data as AuditEntry[]) || []);
      setLoadingHistory(false);
    })();
  }, [open, warning?.id]);

  if (!warning) return null;

  const banExpired = warning.banned_until && new Date(warning.banned_until).getTime() < Date.now();
  const stillBanned = warning.is_banned && !banExpired;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-warning" />
            تفاصيل التحذير
          </DialogTitle>
          <DialogDescription className="text-xs">
            راجع جميع البيانات وسجل التغييرات قبل اتخاذ إجراء.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2 -mr-2">
          <div className="space-y-4">
            {/* Summary card */}
            <div className={`p-4 rounded-xl border ${
              stillBanned
                ? "bg-destructive/5 border-destructive/30"
                : warning.warning_count >= 3
                  ? "bg-warning/5 border-warning/30"
                  : "bg-muted/20 border-border"
            }`}>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <p className="font-bold text-sm">{warning.user_name || "غير معروف"}</p>
                <Badge variant="outline" className="text-[10px]">
                  {warning.user_role === "teacher" ? "معلم" : "طالب"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {typeLabels[warning.warning_type] || warning.warning_type}
                </Badge>
                {stillBanned && (
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <Ban className="h-2.5 w-2.5" /> محظور
                  </Badge>
                )}
                {banExpired && <Badge variant="secondary" className="text-[10px]">انتهى الحظر</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] text-muted-foreground">التاريخ</p>
                  <p className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmt(warning.created_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">عداد التحذيرات</p>
                  <p className={`font-bold ${warning.warning_count >= 3 ? "text-destructive" : ""}`}>
                    {warning.warning_count} / 3
                  </p>
                </div>
                {warning.banned_until && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground">{banExpired ? "انتهى في" : "ينتهي في"}</p>
                    <p className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(warning.banned_until)}</p>
                  </div>
                )}
              </div>

              {warning.description && (
                <div className="mt-3 pt-3 border-t border-border/40">
                  <p className="text-[10px] text-muted-foreground mb-1">الوصف الكامل</p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{warning.description}</p>
                </div>
              )}
            </div>

            {/* Change history */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <p className="font-bold text-sm">سجل التغييرات</p>
                <Badge variant="outline" className="text-[10px]">{history.length}</Badge>
              </div>
              {loadingHistory ? (
                <p className="text-xs text-muted-foreground py-4 text-center">جاري التحميل...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center bg-muted/20 rounded-lg">
                  لا توجد عمليات سابقة على هذا التحذير
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="p-2.5 rounded-lg border bg-card text-xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">
                            {ACTION_LABELS[h.action] || h.action}
                          </Badge>
                          <span className="font-bold">{h.actor_name || "—"}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({h.actor_role === "admin" ? "مدير عام" : h.actor_role || "—"})
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{fmt(h.created_at)}</span>
                      </div>
                      {h.description && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{h.description}</p>
                      )}
                      {h.ip_address && (
                        <p className="mt-1 text-[10px] text-muted-foreground font-mono">IP: {h.ip_address}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Action footer */}
        <div className="border-t pt-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            الإجراءات تُسجل تلقائياً في سجل التدقيق
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {stillBanned && (
              canLiftBan ? (
                <Button
                  size="sm" variant="outline"
                  onClick={() => { onLiftBan(warning); onOpenChange(false); }}
                  className="h-8 gap-1 text-[11px]"
                >
                  <ShieldOff className="h-3 w-3" /> رفع الحظر
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="h-8 gap-1 text-[11px]">
                  <Lock className="h-3 w-3" /> رفع الحظر (غير مسموح)
                </Button>
              )
            )}
            {warning.warning_count > 0 && (
              canReset ? (
                <Button
                  size="sm" variant="outline"
                  onClick={() => { onReset(warning); onOpenChange(false); }}
                  className="h-8 gap-1 text-[11px]"
                >
                  <RefreshCw className="h-3 w-3" /> إعادة تعيين
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="h-8 gap-1 text-[11px]">
                  <Lock className="h-3 w-3" /> إعادة تعيين
                </Button>
              )
            )}
            {canDelete ? (
              <Button
                size="sm" variant="ghost"
                onClick={() => { onDelete(warning); onOpenChange(false); }}
                className="h-8 gap-1 text-[11px] text-destructive"
              >
                <Trash2 className="h-3 w-3" /> حذف
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled className="h-8 gap-1 text-[11px]">
                <Lock className="h-3 w-3" /> حذف (مدير عام فقط)
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
