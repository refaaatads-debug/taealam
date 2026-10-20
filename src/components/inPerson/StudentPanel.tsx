import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";

type Option = { id: string; name: string };
type Address = Option & { city_id: string; district?: string | null };
type Teacher = { teacher_id: string; full_name: string; avg_rating: number; distance_km: number; service_radius_km: number };
type RequestRow = { request_group_id: string; subject_name: string; scheduled_at: string; status: string; acceptance_deadline: string; booking_id: string | null; attendance_confirmed_at: string | null };

const localDateTime = (date: Date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
};

export default function InPersonStudentPanel() {
  const { user } = useAuth();
  const [cities, setCities] = useState<Option[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [attendanceCodes, setAttendanceCodes] = useState<Record<string, string>>({});
  const [cityId, setCityId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState(() => localDateTime(new Date(Date.now() + 3 * 60 * 60_000)));
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ street: "", district: "", details: "", latitude: "", longitude: "" });
  const [savingAddress, setSavingAddress] = useState(false);

  const refreshRequests = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("list_my_in_person_request_groups" as any);
    if (error) return;
    setRequests((data || []) as RequestRow[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const { data: pilotEnabled } = await supabase.rpc("is_in_person_test_user" as any);
      if (!active || !pilotEnabled) return;
      setEnabled(true);
      const [cityResult, addressResult, subjectResult] = await Promise.all([
        supabase.from("cities" as any).select("id,name_ar").eq("is_active", true).order("name_ar"),
        supabase.from("user_addresses" as any).select("id,street_address,district,city_id").eq("owner_id", user.id).order("created_at", { ascending: false }),
        supabase.from("subjects").select("id,name").order("name"),
      ]);
      setCities(((cityResult.data || []) as any[]).map((x) => ({ id: x.id, name: x.name_ar })));
      setAddresses(((addressResult.data || []) as any[]).map((x) => ({ id: x.id, name: x.district ? `${x.district} — ${x.street_address}` : x.street_address, city_id: x.city_id })));
      setSubjects(((subjectResult.data || []) as any[]).map((x) => ({ id: x.id, name: x.name })));
      await refreshRequests();
    })();
    return () => { active = false; };
  }, [user, refreshRequests]);

  const searchTeachers = async () => {
    if (!cityId || !addressId || !subjectId) {
      toast.error("اختر المدينة والعنوان والمادة أولاً");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("search_in_person_teachers" as any, {
      p_city_id: cityId, p_subject_id: subjectId, p_address_id: addressId,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "تعذر البحث عن المعلمين");
      return;
    }
    setTeachers((data || []) as Teacher[]);
    setSelectedTeachers([]);
    if (!data?.length) toast.info("لا يوجد معلمون معتمدون ضمن نطاق هذا العنوان حالياً");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("المتصفح لا يدعم تحديد الموقع؛ أدخل الإحداثيات يدوياً");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setAddressDraft((current) => ({
        ...current,
        latitude: coords.latitude.toFixed(6),
        longitude: coords.longitude.toFixed(6),
      })),
      () => toast.error("لم نتمكن من تحديد الموقع. تحقق من إذن الموقع أو أدخل الإحداثيات يدوياً"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const saveAddress = async () => {
    const latitude = Number(addressDraft.latitude);
    const longitude = Number(addressDraft.longitude);
    if (!cityId || !addressDraft.street.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      toast.error("اختر المدينة واكتب العنوان وحدد إحداثيات صحيحة");
      return;
    }
    setSavingAddress(true);
    const { data, error } = await supabase.from("user_addresses" as any).insert({
      owner_id: user!.id,
      city_id: cityId,
      street_address: addressDraft.street.trim(),
      district: addressDraft.district.trim() || null,
      additional_details: addressDraft.details.trim() || null,
      latitude,
      longitude,
    }).select("id,street_address,district,city_id").single();
    setSavingAddress(false);
    if (error || !data) {
      toast.error(error?.message || "تعذر حفظ العنوان");
      return;
    }
    const saved = data as any;
    setAddresses((current) => [{ id: saved.id, city_id: saved.city_id, name: saved.district ? `${saved.district} — ${saved.street_address}` : saved.street_address }, ...current]);
    setAddressId(saved.id);
    setAddressDraft({ street: "", district: "", details: "", latitude: "", longitude: "" });
    toast.success("تم حفظ العنوان واختياره للحصة");
  };

  const submitRequest = async () => {
    const scheduled = new Date(scheduledAt);
    if (!user || !cityId || !addressId || !subjectId || selectedTeachers.length === 0 || Number.isNaN(scheduled.getTime())) {
      toast.error("أكمل بيانات الحصة واختر معلماً واحداً على الأقل");
      return;
    }
    if (scheduled.getTime() - Date.now() < 120 * 60_000) {
      toast.error("يجب إرسال الطلب قبل الموعد بساعتين على الأقل");
      return;
    }
    setLoading(true);
    const key = globalThis.crypto?.randomUUID?.() || `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { error } = await supabase.rpc("create_in_person_request" as any, {
      p_subject_id: subjectId,
      p_scheduled_at: scheduled.toISOString(),
      p_city_id: cityId,
      p_address_id: addressId,
      p_teacher_ids: selectedTeachers,
      p_idempotency_key: key,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "تعذر إرسال طلب الحصة");
      return;
    }
    toast.success("تم إرسال الطلب وحجز 100 دقيقة مؤقتاً حتى القبول أو انتهاء المهلة");
    await refreshRequests();
  };

  const cancelRequest = async (row: RequestRow) => {
    setLoading(true);
    const result = row.booking_id
      ? await supabase.rpc("cancel_in_person_booking" as any, { p_booking_id: row.booking_id, p_reason: "student_cancelled" })
      : await supabase.rpc("cancel_in_person_request_group" as any, { p_request_group_id: row.request_group_id });
    setLoading(false);
    if (result.error) toast.error(result.error.message || "تعذر إلغاء الطلب");
    else {
      toast.success("تم الإلغاء وتحديث الرصيد حسب سياسة الحصة");
      await refreshRequests();
    }
  };

  const confirmAttendance = async (bookingId: string) => {
    const code = (attendanceCodes[bookingId] || "").replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) return toast.error("أدخل رمز الحضور المكوّن من أربعة أرقام");
    setLoading(true);
    const { data, error } = await supabase.rpc("confirm_in_person_attendance_code" as any, {
      p_booking_id: bookingId,
      p_code: code,
    });
    setLoading(false);
    if (error) toast.error(error.message || "تعذر تأكيد الحضور");
    else if (!data) toast.error("رمز الحضور غير صحيح");
    else {
      toast.success("تم تأكيد الحضور واحتساب الحصة");
      setAttendanceCodes((current) => ({ ...current, [bookingId]: "" }));
      await refreshRequests();
    }
  };

  if (!enabled) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>الحصص الحضورية</CardTitle>
        <p className="text-sm text-muted-foreground">مدة التدريس 60 دقيقة، ويُحجز 100 دقيقة من الباقة. يُرسل الطلب قبل الموعد بساعتين على الأقل.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">المدينة
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={cityId} onChange={(e) => { setCityId(e.target.value); setAddressId(""); }}>
              <option value="">اختر المدينة</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">عنوان الزيارة
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              <option value="">اختر عنواناً محفوظاً</option>{addresses.filter((a) => !cityId || a.city_id === cityId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="text-sm">المادة
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">اختر المادة</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-sm">موعد الحصة
            <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
        </div>
        {cityId && (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">إضافة عنوان جديد</CardTitle>
              <p className="text-sm text-muted-foreground">نحفظ الإحداثيات لاختيار المعلمين القريبين. لن نطلب موقعك إلا عند ضغط زر تحديد الموقع.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">الحي
                  <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={addressDraft.district} onChange={(e) => setAddressDraft((v) => ({ ...v, district: e.target.value }))} />
                </label>
                <label className="text-sm">الشارع والعنوان
                  <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={addressDraft.street} onChange={(e) => setAddressDraft((v) => ({ ...v, street: e.target.value }))} />
                </label>
                <label className="text-sm sm:col-span-2">تفاصيل إضافية (اختياري)
                  <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={addressDraft.details} onChange={(e) => setAddressDraft((v) => ({ ...v, details: e.target.value }))} />
                </label>
                <label className="text-sm">خط العرض
                  <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" type="number" step="any" value={addressDraft.latitude} onChange={(e) => setAddressDraft((v) => ({ ...v, latitude: e.target.value }))} />
                </label>
                <label className="text-sm">خط الطول
                  <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" type="number" step="any" value={addressDraft.longitude} onChange={(e) => setAddressDraft((v) => ({ ...v, longitude: e.target.value }))} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={savingAddress} onClick={useCurrentLocation}>
                  <MapPin className="ml-2 h-4 w-4" /> تحديد موقعي
                </Button>
                <Button type="button" disabled={savingAddress} onClick={saveAddress}>
                  {savingAddress ? "جارٍ الحفظ..." : "حفظ العنوان"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <Button variant="outline" onClick={searchTeachers} disabled={loading}>{loading ? "جارٍ البحث..." : "ابحث عن معلمين ضمن النطاق"}</Button>
        {teachers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">الأقرب أولاً، ثم التقييم</p>
            {teachers.map((teacher) => (
              <label key={teacher.teacher_id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
                <input type="checkbox" checked={selectedTeachers.includes(teacher.teacher_id)} onChange={(e) => setSelectedTeachers((current) => e.target.checked ? [...current, teacher.teacher_id] : current.filter((id) => id !== teacher.teacher_id))} />
                <span className="flex-1">{teacher.full_name}</span>
                <span className="text-xs text-muted-foreground">{teacher.distance_km} كم · ★ {teacher.avg_rating}</span>
              </label>
            ))}
            <Button onClick={submitRequest} disabled={loading || selectedTeachers.length === 0}>{loading ? "جارٍ الإرسال..." : "إرسال الطلب وحجز الرصيد"}</Button>
          </div>
        )}
        <div className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">طلباتي الحضورية</h3>
          {requests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات حالية.</p>}
          {requests.slice(0, 5).map((row) => (
            <div key={row.request_group_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div><strong>{row.subject_name || "حصة حضورية"}</strong><div className="text-muted-foreground">{new Date(row.scheduled_at).toLocaleString("ar-SA")} · {row.status === "open" ? `قبول حتى ${new Date(row.acceptance_deadline).toLocaleTimeString("ar-SA")}` : row.status}</div></div>
              {row.booking_id && row.status === "accepted" && (row.attendance_confirmed_at
                ? <span className="text-xs font-medium text-green-700">تم تأكيد الحضور</span>
                : <div className="flex items-center gap-2">
                  <input aria-label="رمز الحضور" className="h-9 w-28 rounded-md border bg-background px-2 text-center tracking-widest" inputMode="numeric" maxLength={4} placeholder="••••" value={attendanceCodes[row.booking_id] || ""} onChange={(e) => setAttendanceCodes((current) => ({ ...current, [row.booking_id!]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                  <Button size="sm" disabled={loading} onClick={() => confirmAttendance(row.booking_id!)}>تأكيد الحضور</Button>
                </div>)}
              {["open", "accepted"].includes(row.status) && !row.attendance_confirmed_at && <Button size="sm" variant="outline" disabled={loading} onClick={() => cancelRequest(row)}>إلغاء</Button>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
