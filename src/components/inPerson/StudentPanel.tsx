import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

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
  const hasAddressInSelectedCity = addresses.some((address) => address.city_id === cityId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>الحصص الحضورية</CardTitle>
        <p className="text-sm text-muted-foreground">مدة التدريس 60 دقيقة، ويُحجز 100 دقيقة من الباقة. يُرسل الطلب قبل الموعد بساعتين على الأقل.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">المدينة
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={cityId} disabled={cities.length === 0} onChange={(e) => { setCityId(e.target.value); setAddressId(""); }}>
              <option value="">اختر المدينة</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">عنوان الزيارة
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={addressId} disabled={addresses.length === 0} onChange={(e) => setAddressId(e.target.value)}>
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
        {cities.length === 0 && (
          <div className="rounded-md border border-dashed p-3 text-sm" role="status">
            <p>لا توجد مدن محفوظة بعد. احفظ مدينتك أو عنوانك من الخريطة في ملفك الشخصي؛ ستظهر المدينة هنا تلقائياً.</p>
            <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" to="/profile">إضافة المدينة والعنوان من الملف الشخصي</Link>
          </div>
        )}
        {cities.length > 0 && addresses.length > 0 && cityId && !hasAddressInSelectedCity && (
          <div className="rounded-md border border-dashed p-3 text-sm" role="status">
            <p>لا يوجد عنوان محفوظ لهذه المدينة. أضف العنوان من قسم العناوين في ملفك الشخصي أولاً.</p>
            <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" to="/profile">احفظ عنوانك من الخريطة في الملف الشخصي</Link>
          </div>
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
