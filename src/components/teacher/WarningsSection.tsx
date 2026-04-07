import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, FileWarning, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const VIOLATION_TYPE_LABELS: Record<string, string> = {
  contact_sharing: "مشاركة معلومات اتصال",
  platform_mention: "ذكر منصة تواصل خارجية",
  coded_message: "رسالة مشفرة",
  chat_violation: "مخالفة محادثة",
  contact_violation: "مخالفة مشاركة اتصال",
};

const VIOLATION_REASONS: Record<string, string> = {
  contact_sharing: "محاولة مشاركة أرقام هواتف أو بريد إلكتروني بهدف التواصل خارج المنصة",
  platform_mention: "ذكر واتساب أو تلغرام أو سناب شات أو وسائل تواصل خارجية",
  coded_message: "استخدام رسائل مموهة لتمرير معلومات اتصال بطريقة غير مباشرة",
  chat_violation: "مخالفة لقواعد المحادثة داخل المنصة",
  contact_violation: "محاولة مشاركة معلومات اتصال شخصية خارج المنصة",
};

export default function WarningsSection() {
  const { user } = useAuth();
  const [warnings, setWarnings] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [warningsRes, violationsRes] = await Promise.all([
        supabase
          .from("user_warnings")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("violations")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setWarnings(warningsRes.data || []);
      setViolations(violationsRes.data || []);
    };
    fetchData();
  }, [user]);

  if (warnings.length === 0 && violations.length === 0) return null;

  const totalWarnings = warnings.reduce((sum, w) => sum + (w.warning_count || 1), 0);
  const isBanned = warnings.some(w => w.is_banned);

  return (
    <Card className="border-0 shadow-card border-destructive/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </div>
          التحذيرات والمخالفات
          <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">{totalWarnings}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Ban status banner */}
        {isBanned && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-bold text-destructive">حسابك محظور مؤقتاً</p>
              <p className="text-xs text-muted-foreground">
                بسبب تجاوز الحد المسموح من المخالفات.
                {warnings.find(w => w.banned_until) && ` ينتهي الحظر في ${new Date(warnings.find(w => w.banned_until)!.banned_until).toLocaleDateString("ar-SA")}`}
              </p>
            </div>
          </div>
        )}

        {/* Warning progress */}
        <div className="bg-muted/30 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground">مستوى التحذيرات</span>
            <span className="text-xs text-muted-foreground">{totalWarnings} / 3</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${totalWarnings >= 3 ? "bg-destructive" : totalWarnings >= 2 ? "bg-orange-500" : "bg-yellow-500"}`}
              style={{ width: `${Math.min((totalWarnings / 3) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">عند الوصول إلى 3 تحذيرات يتم حظر الحساب تلقائياً</p>
        </div>

        {/* Warnings list */}
        {warnings.map((w) => (
          <div key={w.id} className="flex items-start gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm text-foreground">
                  {VIOLATION_TYPE_LABELS[w.warning_type] || w.warning_type}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(w.created_at).toLocaleDateString("ar-SA")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                {w.description || VIOLATION_REASONS[w.warning_type] || "مخالفة لسياسات المنصة"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px]">
                  عدد المرات: {w.warning_count}
                </Badge>
                {w.is_banned && (
                  <Badge variant="destructive" className="text-[10px]">
                    محظور حتى {w.banned_until ? new Date(w.banned_until).toLocaleDateString("ar-SA") : "إشعار آخر"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Recent violations detail */}
        {violations.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-2">
              <FileWarning className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground">تفاصيل آخر المخالفات</span>
            </div>
            {violations.map((v: any) => (
              <div key={v.id} className="p-3 rounded-lg bg-muted/20 border border-border mb-2 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {VIOLATION_TYPE_LABELS[v.violation_type] || v.violation_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(v.created_at).toLocaleDateString("ar-SA")}
                  </span>
                </div>
                <div className="flex items-start gap-2 mt-1">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    {VIOLATION_REASONS[v.violation_type] || "مخالفة لسياسات المنصة"}
                  </p>
                </div>
                {v.is_reviewed && (
                  <Badge variant={v.is_false_positive ? "secondary" : "destructive"} className="text-[10px] mt-1">
                    {v.is_false_positive ? "تم إلغاء المخالفة" : "مخالفة مؤكدة"}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
