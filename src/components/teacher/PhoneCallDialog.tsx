import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Wallet, Loader2, AlertTriangle } from "lucide-react";
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
  const [callActive, setCallActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (open && user) {
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => setBalance(Number(data?.balance || 0)));
      setPhone(studentPhone || "");
      setMinutes(5);
      setCallActive(false);
      setElapsed(0);
    }
  }, [open, user?.id, studentPhone]);

  // Live timer when call active
  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [callActive]);

  const requiredCost = minutes * PRICE_PER_MINUTE;
  const insufficient = balance < requiredCost;
  const liveCost = (elapsed / 60) * PRICE_PER_MINUTE;

  const handleCall = async () => {
    if (!phone.trim()) {
      toast.error("أدخل رقم الهاتف");
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
        description: `خُصم ${data.cost} ريال — رصيدك الجديد ${Number(data.newBalance).toFixed(2)} ريال`,
      });
      setBalance(Number(data.newBalance));
      setCallActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ";
      toast.error("تعذّر بدء المكالمة", { description: msg });
    } finally {
      setCalling(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

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
            <div className="text-5xl font-bold text-primary tabular-nums">{formatTime(elapsed)}</div>
            <p className="text-sm text-muted-foreground">المكالمة جارية</p>
            <div className="text-lg">التكلفة الحالية: <strong>{liveCost.toFixed(2)} ريال</strong></div>
            <Button onClick={() => onOpenChange(false)} variant="outline">إغلاق</Button>
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

              <div>
                <Label>المدة المقدّرة (دقائق)</Label>
                <Input type="number" value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} min={1} max={60} />
              </div>

              <div className="flex justify-between p-3 rounded-lg border">
                <span>التكلفة المتوقعة:</span>
                <strong>{requiredCost.toFixed(2)} ريال</strong>
              </div>

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
