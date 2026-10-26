import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { arabicBookingError } from "@/lib/arabicBookingError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CancelSessionDialog from "@/components/teacher/CancelSessionDialog";
import { ExternalLink, MapPin } from "lucide-react";

type AddressSnapshot = { street_address?: string | null; district?: string | null; latitude?: number | string | null; longitude?: number | string | null };
type RequestRow = { request_group_id: string; student_name: string; subject_name: string; teaching_stage?: string | null; city_name: string; scheduled_at: string; acceptance_deadline: string; offered_teacher_rate_sar: number; offered_platform_share_sar: number; pricing_source: string; street_address?: string | null; district?: string | null; latitude?: string | null; longitude?: string | null };
type BookingRow = { id: string; student_id: string; scheduled_at: string; session_status?: string | null; attendance_confirmed_at?: string | null; subject_name?: string; visit_address_snapshot?: AddressSnapshot | null; subjects?: { name: string } | null };
type CityStatus = { city_id: string | null; city_name: string | null; city_enabled: boolean | null };

export default function InPersonTeacherPanel({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [cityStatus, setCityStatus] = useState<CityStatus | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data: pilotEnabled } = await supabase.rpc("is_in_person_test_user" as any);
    if (!pilotEnabled) { setEnabled(false); return; }
    setEnabled(true);
    const [{ data: incoming, error }, { data: requestLocations, error: locationsError }, { data: upcoming }, { data: cityRows }] = await Promise.all([
      supabase.rpc("list_teacher_in_person_requests_priced" as any),
      supabase.rpc("list_teacher_in_person_request_locations" as any),
      supabase.from("bookings" as any).select("id,student_id,scheduled_at,session_status,attendance_confirmed_at,visit_address_snapshot,subjects(name)")
        .eq("teacher_id", user.id).eq("delivery_mode", "in_person").eq("status", "confirmed")
        .order("scheduled_at", { ascending: true }),
      supabase.rpc("get_my_in_person_city_status" as any),
    ]);
    if (error) {
      if (!error.message.toLowerCase().includes("pilot")) {
        toast.error(arabicBookingError(error, "تعذر تحميل طلبات الحصص الحضورية."));
      }
      setRequests([]);
    } else {
      const locations = new Map<string, AddressSnapshot>(
        (requestLocations || []).map((location: any) => [
          location.request_group_id,
          location as AddressSnapshot,
        ] as [string, AddressSnapshot]),
      );
      setRequests((incoming || []).map((request: any) => ({ ...request, ...(locations.get(request.request_group_id) || {}) })) as RequestRow[]);
    }
    setLocationError(Boolean(locationsError));
    if (locationsError) toast.error("تعذر تحميل موقع الحصة الحضورية");
    setBookings((upcoming || []) as unknown as BookingRow[]);
    setCityStatus(((cityRows || [])[0] as CityStatus | undefined) || null);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user || !enabled) return;
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [user, enabled, refresh]);

  const accept = async (request: RequestRow) => {
    setBusy(true);
    const { error } = await supabase.rpc("accept_in_person_request" as any, { p_request_group_id: request.request_group_id });
    setBusy(false);
    if (error) toast.error(arabicBookingError(error, "تعذر قبول الطلب الحضوري."));
    else { toast.success("تم قبول الحصة وتأكيد الموعد"); await refresh(); }
  };

  const reject = async (request: RequestRow) => {
    setRejecting(request.request_group_id);
    const { data, error } = await supabase.rpc("reject_in_person_request" as any, {
      p_request_group_id: request.request_group_id,
    });
    setRejecting(null);
    if (error) toast.error(arabicBookingError(error, "تعذر رفض الطلب الحضوري."));
    else if (!data) toast.info("تمت معالجة الطلب أو انتهت مهلة القبول");
    else { toast.success("تم رفض الطلب؛ سيظل متاحاً للمعلمين الآخرين"); await refresh(); }
  };

  const showCode = async (bookingId: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("get_in_person_attendance_code" as any, { p_booking_id: bookingId });
    setBusy(false);
    if (error) toast.error(arabicBookingError(error, "سيظهر رمز الحضور قبل الموعد بساعة."));
    else setCodes((current) => ({ ...current, [bookingId]: data as string }));
  };

  const mapUrl = (latitude?: number | string | null, longitude?: number | string | null) => {
    if (latitude == null || longitude == null || String(latitude).trim() === "" || String(longitude).trim() === "") return null;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  };
  const locationDetails = (address?: AddressSnapshot | RequestRow | null, cityName?: string | null) => {
    if (!address) return null;
    const street = address.street_address?.trim();
    const district = address.district?.trim();
    const url = mapUrl(address.latitude, address.longitude);
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-medium">{[street, district, cityName].filter(Boolean).join(" · ") || "العنوان غير متاح"}</span>
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-2">عرض الموقع <ExternalLink className="h-3 w-3" /></a>}
      </div>
    );
  };

  if (!enabled) return null;
  const Root = embedded ? "section" : Card;
  const Header = embedded ? "div" : CardHeader;
  const Content = embedded ? "div" : CardContent;
  return (
    <Root id="in-person-sessions" className={embedded ? "space-y-3" : "overflow-hidden rounded-2xl border-0 shadow-card"}>
      <Header><CardTitle className="text-lg font-bold leading-6">{embedded ? "طلبات الحضوري" : "الحصص الحضورية"}</CardTitle><p className="text-sm leading-6 text-muted-foreground">مهلة قبول الطلب ساعة من إرساله. رمز الحضور يظهر قبل الموعد بساعة ويُقبل من بداية الموعد حتى أقل من 15 دقيقة بعدها.</p>
        {cityStatus?.city_name && cityStatus.city_enabled === false && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">الخدمة لم تُفعّل في مدينتك بعد.</p>}
      </Header>
      <Content className="space-y-5">
        <section className="space-y-2">
          <h3 className="font-semibold">طلبات بانتظارك</h3>
          {locationError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">تعذر تحميل عنوان الحصة. أعد تحميل الصفحة قبل قبول طلب حضوري.</p>}
          {requests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات جديدة ضمن نطاقك.</p>}
          {requests.map((request) => <div key={request.request_group_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1"><strong>{request.subject_name} · {request.student_name} <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">حضوري</span></strong>{request.teaching_stage && <div className="mt-1 text-sm text-muted-foreground">المرحلة الدراسية: {request.teaching_stage}</div>}<div className="text-sm text-muted-foreground">{new Date(request.scheduled_at).toLocaleString("ar-SA")}</div><div className="mt-1 text-sm font-semibold text-emerald-800">أجرك لهذه الحصة: {Number(request.offered_teacher_rate_sar)} ر.س · ينتهي قبول الطلب: {new Date(request.acceptance_deadline).toLocaleString("ar-SA")}</div>{locationDetails(request, request.city_name)}</div>
             <div className="flex gap-2">
               <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy || rejecting === request.request_group_id} onClick={() => void reject(request)}>
                 {rejecting === request.request_group_id ? "جارٍ الرفض..." : "رفض الطلب"}
               </Button>
                <Button disabled={busy || Boolean(rejecting) || locationError || (!request.street_address && !mapUrl(request.latitude, request.longitude))} onClick={() => accept(request)}>قبول الحصة</Button>
             </div>
          </div>)}
        </section>
        <section className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">مواعيدي القادمة</h3>
          {bookings.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مواعيد حضورية قادمة.</p>}
          {bookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1"><strong>{booking.subjects?.name || "حصة حضورية"} <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">حضوري</span></strong><div className="text-sm text-muted-foreground">{new Date(booking.scheduled_at).toLocaleString("ar-SA")}</div>
              {locationDetails(booking.visit_address_snapshot, null)}
              {booking.session_status === "in_progress" && <div className="mt-2 text-sm font-bold text-emerald-700">تم تأكيد الحضور — الحصة جارية</div>}
              {codes[booking.id] && !booking.attendance_confirmed_at && <div className="mt-2 text-lg font-bold tracking-[0.3em]">{codes[booking.id]}</div>}
            </div>
            <div className="flex gap-2">
              {booking.session_status !== "in_progress" && !booking.attendance_confirmed_at && <Button size="sm" variant="outline" disabled={busy} onClick={() => showCode(booking.id)}>إظهار رمز الحضور</Button>}
              {booking.session_status !== "in_progress" && <Button size="sm" variant="destructive" disabled={busy} onClick={() => setCancelTarget(booking)}>إلغاء</Button>}
            </div>
          </div>)}
        </section>
      </Content>
      <CancelSessionDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        bookingId={cancelTarget?.id ?? null}
        studentId={cancelTarget?.student_id}
        deliveryMode="in_person"
        onCancelled={() => { setCancelTarget(null); void refresh(); }}
      />
    </Root>
  );
}
