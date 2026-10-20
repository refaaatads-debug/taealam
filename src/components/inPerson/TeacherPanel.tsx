import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CancelSessionDialog from "@/components/teacher/CancelSessionDialog";

type RequestRow = { request_group_id: string; student_name: string; subject_name: string; city_name: string; scheduled_at: string; acceptance_deadline: string };
type BookingRow = { id: string; student_id: string; scheduled_at: string; subject_name?: string; subjects?: { name: string } | null };
type EarningRow = { booking_id: string; amount: number; status: string; available_at: string; scheduled_at: string };
type CityStatus = { city_id: string | null; city_name: string | null; city_enabled: boolean | null };

export default function InPersonTeacherPanel() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [cityStatus, setCityStatus] = useState<CityStatus | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data: pilotEnabled } = await supabase.rpc("is_in_person_test_user" as any);
    if (!pilotEnabled) { setEnabled(false); return; }
    setEnabled(true);
    const [{ data: incoming, error }, { data: upcoming }, { data: earningRows }, { data: cityRows }] = await Promise.all([
      supabase.rpc("list_teacher_in_person_requests" as any),
      supabase.from("bookings" as any).select("id,student_id,scheduled_at,subjects(name)")
        .eq("teacher_id", user.id).eq("delivery_mode", "in_person").eq("status", "confirmed")
        .order("scheduled_at", { ascending: true }),
      supabase.rpc("list_my_in_person_teacher_earnings" as any),
      supabase.rpc("get_my_in_person_city_status" as any),
    ]);
    if (error) {
      if (!error.message.toLowerCase().includes("pilot")) toast.error(error.message);
      setRequests([]);
    } else setRequests((incoming || []) as RequestRow[]);
    setBookings((upcoming || []) as unknown as BookingRow[]);
    setEarnings((earningRows || []) as EarningRow[]);
    setCityStatus(((cityRows || [])[0] as CityStatus | undefined) || null);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const accept = async (request: RequestRow) => {
    setBusy(true);
    const { error } = await supabase.rpc("accept_in_person_request" as any, { p_request_group_id: request.request_group_id });
    setBusy(false);
    if (error) toast.error(error.message || "تعذر قبول الطلب");
    else { toast.success("تم قبول الحصة وتأكيد الموعد"); await refresh(); }
  };

  const reject = async (request: RequestRow) => {
    setRejecting(request.request_group_id);
    const { data, error } = await supabase.rpc("reject_in_person_request" as any, {
      p_request_group_id: request.request_group_id,
    });
    setRejecting(null);
    if (error) toast.error(error.message || "تعذر رفض الطلب");
    else if (!data) toast.info("تمت معالجة الطلب أو انتهت مهلة القبول");
    else { toast.success("تم رفض الطلب؛ سيظل متاحاً للمعلمين الآخرين"); await refresh(); }
  };

  const showCode = async (bookingId: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("get_in_person_attendance_code" as any, { p_booking_id: bookingId });
    setBusy(false);
    if (error) toast.error(error.message || "سيظهر الرمز قبل الموعد بساعة");
    else setCodes((current) => ({ ...current, [bookingId]: data as string }));
  };

  if (!enabled) return null;
  return (
    <Card>
      <CardHeader><CardTitle>الحصص الحضورية</CardTitle><p className="text-sm text-muted-foreground">يُغلق القبول قبل الموعد بساعة. رمز الحضور يظهر قبل الموعد بساعة ويُقبل من بداية الموعد حتى أقل من 15 دقيقة بعدها.</p>
        {cityStatus?.city_name && cityStatus.city_enabled === false && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">الخدمة لم تُفعّل في مدينتك بعد.</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <h3 className="font-semibold">طلبات بانتظارك</h3>
          {requests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات جديدة ضمن نطاقك.</p>}
          {requests.map((request) => <div key={request.request_group_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><strong>{request.subject_name} · {request.student_name}</strong><div className="text-sm text-muted-foreground">{request.city_name} · {new Date(request.scheduled_at).toLocaleString("ar-SA")}</div></div>
             <div className="flex gap-2">
               <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy || rejecting === request.request_group_id} onClick={() => void reject(request)}>
                 {rejecting === request.request_group_id ? "جارٍ الرفض..." : "رفض الطلب"}
               </Button>
               <Button disabled={busy || Boolean(rejecting)} onClick={() => accept(request)}>قبول الحصة</Button>
             </div>
          </div>)}
        </section>
        <section className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">مواعيدي القادمة</h3>
          {bookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><strong>{booking.subjects?.name || "حصة حضورية"}</strong><div className="text-sm text-muted-foreground">{new Date(booking.scheduled_at).toLocaleString("ar-SA")}</div>
              {codes[booking.id] && <div className="mt-2 text-lg font-bold tracking-[0.3em]">{codes[booking.id]}</div>}
            </div>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => showCode(booking.id)}>إظهار رمز الحضور</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => setCancelTarget(booking)}>إلغاء</Button></div>
          </div>)}
        </section>
        <section className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">مستحقات الحضوري</h3>
          {earnings.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مستحقات مسجلة.</p>}
          {earnings.slice(0, 5).map((earning) => <div key={earning.booking_id} className="flex justify-between gap-2 rounded-lg border p-3 text-sm">
            <span>{new Date(earning.scheduled_at).toLocaleDateString("ar-SA")} · {earning.status === "available" ? "متاح" : earning.status === "pending" ? `متاح بعد ${new Date(earning.available_at).toLocaleString("ar-SA")}` : "معدّل"}</span>
            <strong>{earning.amount} ر.س</strong>
          </div>)}
        </section>
      </CardContent>
      <CancelSessionDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        bookingId={cancelTarget?.id ?? null}
        studentId={cancelTarget?.student_id}
        deliveryMode="in_person"
        onCancelled={() => { setCancelTarget(null); void refresh(); }}
      />
    </Card>
  );
}
