import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Wallet, Loader2, AlertTriangle, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const PRICE_PER_MINUTE = 0.30;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId?: string;
  studentPhone?: string;
  bookingId?: string;
}

export default function PhoneCallDialog({ open, onOpenChange, studentId, studentPhone, bookingId }: Props) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [phone, setPhone] = useState(studentPhone || "");
  const [minutes, setMinutes] = useState(5);
  const [calling, setCalling] = useState(false);
  const [callLogId, setCallLogId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<string>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const [actualCost, setActualCost] = useState<number | null>(null);

  useEffect(() => {
    if (open && user) {
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => setBalance(Number(data?.balance || 0)));
      setPhone(studentPhone || "");
      setMinutes(5);
      setCallLogId(null);
      setCallStatus("idle");
      setElapsed(0);
      setActualDuration(null);
      setActualCost(null);
    }
  }, [open, user?.id, studentPhone]);

  // Live timer ONLY while call is actually answered (in_progress)
  useEffect(() => {
    if (callStatus !== "in_progress") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [callStatus]);

  // Realtime updates from call-status-webhook
  useEffect(() => {
    if (!callLogId) return;
    const channel = supabase
      .channel(`call_log_${callLogId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "call_logs", filter: `id=eq.${callLogId}` },
        (payload) => {
          const row = payload.new as { status?: string; duration_minutes?: number; cost?: number };
          if (row.status) setCallStatus(row.status);
          if (row.status && ["completed", "failed", "canceled"].includes(row.status)) {
            if (typeof row.duration_minutes === "number") setActualDuration(row.duration_minutes);
            if (typeof row.cost === "number") setActualCost(row.cost);
            if (user) {
              supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle()
                .then(({ data }) => setBalance(Number(data?.balance || 0)));
            }
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [callLogId, user?.id]);

  const requiredCost = minutes * PRICE_PER_MINUTE;
  const insufficient = balance < requiredCost;
  const liveCost = (elapsed / 60) * PRICE_PER_MINUTE;
  const callActive = ["initiated", "ringing", "in_progress"].includes(callStatus);
  const callEnded = ["completed", "failed", "canceled"].includes(callStatus);

  const statusLabel: Record<string, string> = {
    initiated: "جارٍ الاتصال...",
    ringing: "يرنّ لدى الطالب...",
    in_progress: "المكالمة جارية ✅",
    completed: "انتهت المكالمة",
    failed: "تعذّر الاتصال",
    canceled: "أُلغيت المكالمة",
  };

  const handleCall = async () => {
    if (!phone.trim()) {
      toast.error("رقم الطالب غير متوفر");
      return;
    }
    if (insufficient) {
      toast.error("رصيد غير كافٍ");
      return;
    }
    setCalling(true);
    try {
      const { data, error } = await supabase.functions.invoke("make-phone-call", {
        body: { studentPhone: phone, estimatedMinutes: minutes, bookingId, studentId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل");
      toast.success("تم بدء المكالمة 📞", {
        description: `حُجز ${data.cost} ريال مؤقتاً — سيُسترد الفرق تلقائياً`,
      });
      setBalance(Number(data.newBalance));
      setCallLogId(data.callLogId);
      setCallStatus("initiated");
      setElapsed(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ";
      toast.error("تعذّر بدء المكالمة", { description: msg });
    } finally {
      setCalling(false);
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const formatMinutes = (m: number) => formatTime(Math.round(m * 60));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" /> مكالمة هاتفية مدفوعة
          </DialogTitle>
          <DialogDescription>سعر الدقيقة: <strong>{PRICE_PER_MINUTE} ريال</strong></DialogDescription>
        </DialogHeader>

        {callActive ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-sm font-medium text-muted-foreground">
              {statusLabel[callStatus] || "جارٍ..."}
            </div>
            {callStatus === "in_progress" ? (
              <>
                <div className="text-5xl font-bold text-primary tabular-nums">{formatTime(elapsed)}</div>
                <div className="text-lg">التكلفة الحالية: <strong>{liveCost.toFixed(2)} ريال</strong></div>
                <p className="text-xs text-muted-foreground">
                  ⏱️ العداد يبدأ من لحظة رد الطالب فقط
                </p>
              </>
            ) : (
              <div className="py-8 flex flex-col items-center gap-3">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {callStatus === "ringing" ? "في انتظار رد الطالب..." : "جارٍ الاتصال بالشبكة..."}
                </p>
              </div>
            )}
            <Button onClick={() => onOpenChange(false)} variant="outline" size="sm">
              إخفاء النافذة (المكالمة مستمرة)
            </Button>
          </div>
        ) : callEnded ? (
          <div className="text-center py-6 space-y-3">
            <div className={`flex items-center justify-center gap-2 text-lg font-semibold ${callStatus === "completed" ? "text-primary" : "text-destructive"}`}>
              <PhoneOff className="h-5 w-5" />
              {statusLabel[callStatus]}
            </div>
            {actualDuration !== null && (
              <div className="text-3xl font-bold tabular-nums">{formatMinutes(actualDuration)}</div>
            )}
            {actualCost !== null && (
              <div className="text-base">التكلفة الفعلية: <strong>{actualCost.toFixed(2)} ريال</strong></div>
            )}
            <p className="text-xs text-muted-foreground">رصيدك الحالي: {balance.toFixed(2)} ريال</p>
            <Button onClick={() => onOpenChange(false)}>إغلاق</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="flex items-center gap-2 text-sm"><Wallet className="h-4 w-4" /> رصيدك</span>
                <strong className={insufficient ? "text-destructive" : "text-primary"}>{balance.toFixed(2)} ريال</strong>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border text-sm text-muted-foreground">
                🔒 رقم هاتف الطالب محميّ ومخفي وفق سياسة الخصوصية. سيتم الاتصال تلقائياً دون عرض الرقم.
                {!phone && (
                  <div className="mt-2 text-destructive text-xs">
                    تعذّر الحصول على رقم الطالب — لا يمكن إجراء المكالمة.
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/30 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                  <div className="space-y-1">
                    <p className="font-semibold text-destructive">
                      تنبيه قانوني — يُسمع للطرفين قبل الوصل:
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ستُشغّل المنصة رسالة صوتية تحذّر من تبادل المعلومات الشخصية (أرقام، واتساب، روابط خارجية).
                      أي مخالفة موثّقة من الطالب قد تؤدي لإيقاف حسابك.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label>المدة المقدّرة (دقائق)</Label>
                <Input type="number" value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} min={1} max={60} />
              </div>

              <div className="flex justify-between p-3 rounded-lg border">
                <span>التكلفة المحجوزة:</span>
                <strong>{requiredCost.toFixed(2)} ريال</strong>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 يُحجز هذا المبلغ مؤقتاً، ويُحاسب على المدة الفعلية فقط بعد انتهاء المكالمة (الفرق يُسترد).
              </p>

              {insufficient && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    رصيدك غير كافٍ.{" "}
                    <Link to="/teacher/wallet" className="underline font-semibold">اشحن المحفظة</Link>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button onClick={handleCall} disabled={calling || insufficient || !phone.trim()}>
                {calling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4 ml-1" />}
                تأكيد الاتصال
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
