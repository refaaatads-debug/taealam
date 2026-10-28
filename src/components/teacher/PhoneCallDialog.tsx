import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  studentId?: string;
  bookingId?: string;
}
const terminal = ["completed", "failed", "canceled"];
const labels: Record<string, string> = {
  initiated: "جارٍ بدء الاتصال", ringing: "يرنّ لدى الطرفين", in_progress: "المكالمة جارية",
  completed: "انتهت المكالمة", failed: "تعذر الاتصال", canceled: "أُلغيت المكالمة",
};

export default function PhoneCallDialog({ open, onOpenChange, studentId, bookingId }: Props) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [price, setPrice] = useState(0.3);
  const [minutes, setMinutes] = useState(5);
  const [loading, setLoading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState("idle");
  const [duration, setDuration] = useState(0);
  const [cost, setCost] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let current = true;
    setLoading(true); setMinutes(5); setCallId(null); setStatus("idle"); setCost(null); setDuration(0);
    void Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "call_price_per_minute").maybeSingle(),
    ]).then(([wallet, settings]) => {
      if (!current) return;
      if (wallet.error) throw wallet.error;
      setBalance(Number(wallet.data?.balance || 0));
      const configured = Number.parseFloat(String(settings.data?.value ?? ""));
      setPrice(Number.isFinite(configured) && configured >= 0 ? configured : 0.3);
    }).catch(() => {
      if (current) toast.error("تعذر تحميل المحفظة");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, user?.id, studentId, bookingId]);

  // Do not subscribe to raw call_logs: realtime payloads can include private phones.
  useEffect(() => {
    if (!open || !callId || terminal.includes(status)) return;
    let current = true;
    const refresh = async () => {
      const { data, error } = await supabase.from("teacher_call_history")
        .select("status,duration_minutes,cost").eq("id", callId).maybeSingle();
      if (!current || error || !data) return;
      setStatus(data.status); setDuration(Number(data.duration_minutes || 0)); setCost(Number(data.cost || 0));
      if (terminal.includes(data.status) && user) {
        const wallet = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
        if (current && !wallet.error) setBalance(Number(wallet.data?.balance || 0));
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => { current = false; clearInterval(timer); };
  }, [open, callId, status, user?.id]);

  const required = Math.round(minutes * price * 100) / 100;
  const active = callId !== null && !terminal.includes(status);
  const start = async () => {
    if (calling || active || balance < required || (!bookingId && !studentId)) return;
    setCalling(true);
    try {
      const { data, error } = await supabase.functions.invoke("make-phone-call", {
        body: { studentId, bookingId, estimatedMinutes: minutes },
      });
      if (error || !data?.success || !data.callLogId) throw new Error("تعذر بدء الاتصال");
      setBalance(Number(data.newBalance)); setCost(Number(data.cost)); setCallId(data.callLogId); setStatus("initiated");
      toast.success("بدأ الاتصال المخفي بالطرفين");
    } catch { toast.error("تعذر بدء الاتصال. تحقق من الحجز والرصيد ثم حاول مجدداً."); }
    finally { setCalling(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> اتصال هاتفي برقم مخفي</DialogTitle>
      <DialogDescription>تتصل المنصة بالطرفين من رقمها، دون كشف رقم الطالب أو المعلم. سعر الدقيقة: {price.toFixed(2)} ريال.</DialogDescription></DialogHeader>
    {loading ? <Loader2 className="mx-auto animate-spin" /> : <>
      <p className="flex items-center gap-2"><Wallet className="h-4 w-4" /> رصيد المحفظة: {balance.toFixed(2)} ريال</p>
      {callId ? <div className="space-y-2 rounded-xl bg-muted p-4" role="status">
        <p>{labels[status] || "جارٍ تحديث حالة المكالمة"}</p>
        <p>{terminal.includes(status) ? "التكلفة المسجلة" : "المبلغ المحجوز"}: {(cost || 0).toFixed(2)} ريال</p>
        {terminal.includes(status) && <p>المدة: {duration.toFixed(1)} دقيقة. تُحدّث المحفظة بعد تسوية المكالمة.</p>}
      </div> : <>
        <Label htmlFor="masked-call-minutes">المدة المقدرة بالدقائق</Label>
        <Input id="masked-call-minutes" type="number" min={1} max={60} value={minutes}
          onChange={(event) => setMinutes(Math.min(60, Math.max(1, Number(event.target.value) || 1)))} />
        <p className="text-sm text-muted-foreground">يُحجز {required.toFixed(2)} ريال وتُسوّى التكلفة حسب المدة الفعلية.</p>
        {balance < required && <Link to="/teacher-wallet" className="text-sm text-destructive underline">الرصيد غير كافٍ — اشحن محفظة المكالمات</Link>}
        <Button onClick={() => void start()} disabled={calling || balance < required || (!bookingId && !studentId)}>
          {calling ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Phone className="ml-2 h-4 w-4" />} تأكيد الاتصال المخفي
        </Button>
      </>}
      <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق النافذة</Button>
    </>}
  </DialogContent></Dialog>;
}
