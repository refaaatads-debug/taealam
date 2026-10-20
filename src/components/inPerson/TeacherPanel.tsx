import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RequestRow = { request_group_id: string; student_name: string; subject_name: string; city_name: string; scheduled_at: string; acceptance_deadline: string };
type BookingRow = { id: string; scheduled_at: string; subject_name?: string; subjects?: { name: string } | null };
type EarningRow = { booking_id: string; amount: number; status: string; available_at: string; scheduled_at: string };

export default function InPersonTeacherPanel() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [cities, setCities] = useState<{ id: string; name_ar: string }[]>([]);
  const [location, setLocation] = useState({ city_id: "", latitude: "", longitude: "", radius: "10" });
  const [enabled, setEnabled] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data: pilotEnabled } = await supabase.rpc("is_in_person_test_user" as any);
    if (!pilotEnabled) { setEnabled(false); return; }
    setEnabled(true);
    const [{ data: incoming, error }, { data: upcoming }, { data: earningRows }] = await Promise.all([
      supabase.rpc("list_teacher_in_person_requests" as any),
      supabase.from("bookings" as any).select("id,scheduled_at,subjects(name)")
        .eq("teacher_id", user.id).eq("delivery_mode", "in_person").eq("status", "confirmed")
        .order("scheduled_at", { ascending: true }),
      supabase.rpc("list_my_in_person_teacher_earnings" as any),
    ]);
    if (error) {
      if (!error.message.toLowerCase().includes("pilot")) toast.error(error.message);
      setRequests([]);
    } else setRequests((incoming || []) as RequestRow[]);
    setBookings((upcoming || []) as BookingRow[]);
    setEarnings((earningRows || []) as EarningRow[]);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: pilotEnabled } = await supabase.rpc("is_in_person_test_user" as any);
      if (!pilotEnabled) return;
      const [cityResult, profileResult] = await Promise.all([
      supabase.from("cities" as any).select("id,name_ar").eq("is_active", true).order("name_ar"),
      supabase.from("teacher_profiles" as any)
        .select("city_id,in_person_latitude,in_person_longitude,in_person_service_radius_km")
        .eq("user_id", user.id).maybeSingle(),
      ]);
      setCities((cityResult.data || []) as { id: string; name_ar: string }[]);
      if (profileResult.data) setLocation({
        city_id: profileResult.data.city_id || "",
        latitude: profileResult.data.in_person_latitude?.toString() || "",
        longitude: profileResult.data.in_person_longitude?.toString() || "",
        radius: profileResult.data.in_person_service_radius_km?.toString() || "10",
      });
    })();
  }, [user]);

  const submitLocation = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_in_person_teacher_location" as any, {
      p_city_id: location.city_id,
      p_latitude: Number(location.latitude),
      p_longitude: Number(location.longitude),
      p_service_radius_km: Number(location.radius),
    });
    setBusy(false);
    if (error) toast.error(error.message || "تعذر إرسال موقع الخدمة");
    else toast.success("تم حفظ نطاق الخدمة وإرسال الطلب لمراجعة الإدارة");
  };

  const accept = async (request: RequestRow) => {
    setBusy(true);
    const { error } = await supabase.rpc("accept_in_person_request" as any, { p_request_group_id: request.request_group_id });
    setBusy(false);
    if (error) toast.error(error.message || "تعذر قبول الطلب");
    else { toast.success("تم قبول الحصة وتأكيد الموعد"); await refresh(); }
  };

  const showCode = async (bookingId: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("get_in_person_attendance_code" as any, { p_booking_id: bookingId });
    setBusy(false);
    if (error) toast.error(error.message || "سيظهر الرمز قبل الموعد بساعة");
    else setCodes((current) => ({ ...current, [bookingId]: data as string }));
  };

  const cancel = async (bookingId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("cancel_in_person_booking" as any, { p_booking_id: bookingId, p_reason: "teacher_cancelled" });
    setBusy(false);
    if (error) toast.error(error.message || "تعذر إلغاء الحصة");
    else { toast.success("تم الإلغاء وإعادة الرصيد كاملاً للطالب"); await refresh(); }
  };

  if (!enabled) return null;
  return (
    <Card>
      <CardHeader><CardTitle>الحصص الحضورية</CardTitle><p className="text-sm text-muted-foreground">يُغلق القبول قبل الموعد بساعة. رمز الحضور يظهر قبل الموعد بساعة ويُقبل من بداية الموعد حتى أقل من 15 دقيقة بعدها.</p></CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3 rounded-lg border p-3">
          <h3 className="font-semibold">موقع التدريس ونطاق الخدمة</h3>
          <p className="text-xs text-muted-foreground">أدخل إحداثيات نقطة الانطلاق؛ لن يظهر ملفك للطلاب قبل اعتماد الإدارة للموقع والطلب.</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <select className="h-10 rounded-md border bg-background px-2 text-sm" value={location.city_id} onChange={(e) => setLocation({ ...location, city_id: e.target.value })}>
              <option value="">المدينة</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name_ar}</option>)}
            </select>
            <input aria-label="خط العرض" className="h-10 rounded-md border bg-background px-3 text-sm" type="number" step="any" placeholder="خط العرض" value={location.latitude} onChange={(e) => setLocation({ ...location, latitude: e.target.value })} />
            <input aria-label="خط الطول" className="h-10 rounded-md border bg-background px-3 text-sm" type="number" step="any" placeholder="خط الطول" value={location.longitude} onChange={(e) => setLocation({ ...location, longitude: e.target.value })} />
            <input aria-label="نطاق الخدمة بالكيلومتر" className="h-10 rounded-md border bg-background px-3 text-sm" type="number" min="1" max="100" placeholder="النطاق كم" value={location.radius} onChange={(e) => setLocation({ ...location, radius: e.target.value })} />
          </div>
          <Button size="sm" variant="outline" disabled={busy || !location.city_id || !location.latitude || !location.longitude} onClick={submitLocation}>حفظ الموقع وطلب الاعتماد</Button>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">طلبات بانتظارك</h3>
          {requests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات جديدة ضمن نطاقك.</p>}
          {requests.map((request) => <div key={request.request_group_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><strong>{request.subject_name} · {request.student_name}</strong><div className="text-sm text-muted-foreground">{request.city_name} · {new Date(request.scheduled_at).toLocaleString("ar-SA")}</div></div>
            <Button disabled={busy} onClick={() => accept(request)}>قبول الحصة</Button>
          </div>)}
        </section>
        <section className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">مواعيدي القادمة</h3>
          {bookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><strong>{booking.subjects?.name || "حصة حضورية"}</strong><div className="text-sm text-muted-foreground">{new Date(booking.scheduled_at).toLocaleString("ar-SA")}</div>
              {codes[booking.id] && <div className="mt-2 text-lg font-bold tracking-[0.3em]">{codes[booking.id]}</div>}
            </div>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => showCode(booking.id)}>إظهار رمز الحضور</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => cancel(booking.id)}>إلغاء</Button></div>
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
    </Card>
  );
}
