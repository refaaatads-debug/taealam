import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, PhoneCall, Radio, ShieldCheck, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useInternalCall } from "@/contexts/InternalCallContext";
import { toast } from "sonner";
import PhoneCallDialog from "./PhoneCallDialog";

interface CallStudentButtonProps {
  bookingId?: string | null;
  studentId?: string;
  studentName?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
  iconOnly?: boolean;
}

export default function CallStudentButton({
  bookingId,
  studentId: targetStudentId,
  studentName,
  variant = "outline",
  size = "sm",
  className,
  iconOnly = false,
}: CallStudentButtonProps) {
  const { startInternalCall, hasActiveCall } = useInternalCall();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [studentId, setStudentId] = useState<string>();
  const [studentPhone, setStudentPhone] = useState<string>();
  const [resolvedName, setResolvedName] = useState(studentName || "الطالب");
  const [loading, setLoading] = useState(false);
  const [startingInternal, setStartingInternal] = useState(false);

  useEffect(() => {
    if (!chooserOpen || (!bookingId && !targetStudentId)) return;
    setLoading(true);
    (async () => {
      let resolvedStudentId = targetStudentId;
      if (bookingId) {
        const { data: booking } = await supabase
          .from("bookings")
          .select("student_id")
          .eq("id", bookingId)
          .maybeSingle();
        resolvedStudentId = booking?.student_id || resolvedStudentId;
      }
      if (resolvedStudentId) {
        setStudentId(resolvedStudentId);
        const [{ data: privateProfile }, { data: publicProfile }] = await Promise.all([
          supabase.from("profiles").select("phone").eq("user_id", resolvedStudentId).maybeSingle(),
          supabase.from("public_profiles").select("full_name").eq("user_id", resolvedStudentId).maybeSingle(),
        ]);
        setStudentPhone(privateProfile?.phone || "");
        setResolvedName(studentName || publicProfile?.full_name || "الطالب");
      }
    })().finally(() => setLoading(false));
  }, [chooserOpen, bookingId, targetStudentId, studentName]);

  const handleInternalCall = async () => {
    if (!studentId) return toast.error("تعذر تحديد الطالب");
    setStartingInternal(true);
    const result = await startInternalCall({ studentId, bookingId, studentName: resolvedName });
    setStartingInternal(false);
    if (!result.success) {
      if (result.code === "STUDENT_BUSY") {
        toast.warning("الطالب مشغول", { description: "الطالب داخل جلسة مع معلم آخر الآن، لا يمكن الاتصال به." });
      } else {
        toast.error("تعذر بدء الاتصال الداخلي", { description: result.message });
      }
      return;
    }
    setChooserOpen(false);
    toast.success("تم إرسال الاتصال الداخلي للطالب");
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setChooserOpen(true)}
        className={className}
        title="الاتصال بالطالب"
      >
        <Phone className="h-4 w-4" />
        {!iconOnly && <span className="mr-2">اتصل بالطالب</span>}
      </Button>

      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent dir="rtl" className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <PhoneCall className="h-5 w-5 text-primary" />
              الاتصال بـ {resolvedName}
            </DialogTitle>
            <DialogDescription>اختر طريقة الاتصال المناسبة. رقم الطالب يبقى مخفيًا في الحالتين.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
          ) : (
            <div className="grid gap-3 py-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!studentId || startingInternal || hasActiveCall}
                onClick={handleInternalCall}
                className={`group rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-5 text-right transition hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 ${!bookingId ? "sm:col-span-2" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-emerald-500 p-2.5 text-white"><Radio className="h-5 w-5" /></span>
                  <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">داخل المنصة</Badge>
                </div>
                <h3 className="mt-4 font-black text-slate-800">اتصال داخلي صوتي</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">يرن لدى الطالب ويمكنه القبول أو الرفض، حتى عند عدم وجود حجز. يُغلق تلقائيًا بعد دقيقتين.</p>
                <div className="mt-4 flex items-center gap-3 text-[11px] font-bold text-emerald-700">
                  <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" />دقيقتان</span>
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />اتصال آمن</span>
                </div>
                {startingInternal && <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700"><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ فحص حالة الطالب…</div>}
              </button>

              {bookingId && (
                <button
                  type="button"
                  onClick={() => { setChooserOpen(false); setPhoneOpen(true); }}
                  className="group rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-5 text-right transition hover:border-blue-400 hover:bg-blue-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-xl bg-blue-600 p-2.5 text-white"><Phone className="h-5 w-5" /></span>
                    <Badge className="border-0 bg-blue-100 text-blue-700 hover:bg-blue-100">عبر الهاتف</Badge>
                  </div>
                  <h3 className="mt-4 font-black text-slate-800">اتصال هاتفي</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-600">الاتصال الحالي عبر شبكة الهاتف باستخدام رصيد محفظة المكالمات.</p>
                  <p className="mt-4 text-[11px] font-bold text-blue-700">المحاسبة حسب المدة الفعلية</p>
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PhoneCallDialog
        open={phoneOpen}
        onOpenChange={setPhoneOpen}
        bookingId={bookingId}
        studentId={studentId}
        studentPhone={studentPhone}
      />
    </>
  );
}