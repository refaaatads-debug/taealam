import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Option = { id: string; name: string; enabled?: boolean };
type Address = Option & { city_id: string; district?: string | null };
type Teacher = { teacher_id: string; full_name: string; avg_rating: number; distance_km: number; service_radius_km: number };
type RequestRow = { request_group_id: string; subject_name: string; scheduled_at: string; status: string; acceptance_deadline: string; booking_id: string | null; attendance_confirmed_at: string | null };

const localDateTime = (date: Date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
};

const localDateKey = (date: Date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const appointmentTimes = Array.from({ length: 16 }, (_, index) => {
  const hour = index + 8;
  return `${String(hour).padStart(2, "0")}:00`;
});

const availableTimesForDate = (dateKey: string) =>
  appointmentTimes.filter((time) => new Date(`${dateKey}T${time}`).getTime() - Date.now() >= 120 * 60_000);

const formatAppointmentTime = (dateTime: string) => {
  const date = new Date(dateTime);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit" });
};

const formatAcceptanceTimeLeft = (deadline: string, now: number) => {
  const minutesLeft = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 60_000));
  if (minutesLeft === 0) return "أقل من دقيقة";
  if (minutesLeft < 60) return `${minutesLeft} دقيقة`;
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  return minutes ? `${hours} ساعة و${minutes} دقيقة` : `${hours} ساعة`;
};

const firstAvailableAppointment = () => {
  const earliest = Date.now() + 120 * 60_000;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    for (const time of appointmentTimes) {
      const candidate = new Date(`${localDateKey(day)}T${time}`);
      if (candidate.getTime() >= earliest) return localDateTime(candidate);
    }
  }
  return localDateTime(new Date(earliest));
};

export default function InPersonStudentPanel() {
  const { user } = useAuth();
  const [cities, setCities] = useState<Option[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [requestsError, setRequestsError] = useState(false);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [attendanceCodes, setAttendanceCodes] = useState<Record<string, string>>({});
  const [cityId, setCityId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState(firstAvailableAppointment);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [cityUnavailableMessage, setCityUnavailableMessage] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [bookingSuccess, setBookingSuccess] = useState<{ subject: string; teacherCount: number; scheduledAt: string } | null>(null);

  const refreshRequests = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("list_my_in_person_request_groups" as any);
    if (error) {
      setRequestsError(true);
      setRequestsLoaded(true);
      return;
    }
    setRequestsError(false);
    setRequestsLoaded(true);
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
        supabase.from("cities" as any).select("id,name_ar,in_person_enabled").eq("is_active", true).order("name_ar"),
        supabase.from("user_addresses" as any).select("id,street_address,district,city_id").eq("owner_id", user.id).order("created_at", { ascending: false }),
        supabase.from("subjects").select("id,name").order("name"),
      ]);
      if (cityResult.error || addressResult.error || subjectResult.error) {
        if (!active) return;
        setLoadError(true);
        return;
      }
      setLoadError(false);
      setCities(((cityResult.data || []) as any[]).map((x) => ({ id: x.id, name: x.name_ar, enabled: Boolean(x.in_person_enabled) })));
      setAddresses(((addressResult.data || []) as any[]).map((x) => ({ id: x.id, name: x.district ? `${x.district} — ${x.street_address}` : x.street_address, city_id: x.city_id })));
      setSubjects(((subjectResult.data || []) as any[]).map((x) => ({ id: x.id, name: x.name })));
      await refreshRequests();
    })();
    return () => { active = false; };
  }, [user, refreshRequests, reloadKey]);

  useEffect(() => {
    if (!user || !enabled) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
      void refreshRequests();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [user, enabled, refreshRequests]);

  const searchTeachers = async () => {
    if (!cityId || !addressId || !subjectId) {
      toast.error("اختر المدينة والعنوان والمادة أولاً");
      return;
    }
    const appointment = new Date(scheduledAt);
    if (Number.isNaN(appointment.getTime()) || appointment.getTime() - Date.now() < 120 * 60_000) {
      toast.error("اختر موعدًا بعد ساعتين على الأقل من الآن");
      return;
    }
    const selectedCity = cities.find((city) => city.id === cityId);
    if (!selectedCity?.enabled) {
      setTeachers([]);
      setSelectedTeachers([]);
      setSearchError("");
      setHasSearched(false);
      setCityUnavailableMessage(`الحصص الحضورية غير متاحة في ${selectedCity?.name || "هذه المدينة"} حاليًا. يمكنك حجز حصة أونلاين.`);
      return;
    }
    setCityUnavailableMessage("");
    setSearchError("");
    setHasSearched(true);
    setTeachers([]);
    setSelectedTeachers([]);
    setLoading(true);
    const { data, error } = await supabase.rpc("search_in_person_teachers" as any, {
      p_city_id: cityId, p_subject_id: subjectId, p_address_id: addressId,
      p_scheduled_at: new Date(scheduledAt).toISOString(),
    });
    setLoading(false);
    if (error) {
      if (error.message?.includes("In-person service is unavailable in this city")) {
        setTeachers([]);
        setSelectedTeachers([]);
        setCityUnavailableMessage(`الحصص الحضورية غير متاحة في ${selectedCity?.name || "هذه المدينة"} حاليًا. يمكنك حجز حصة أونلاين.`);
        setSearchError("");
        return;
      }
      setSearchError("تعذر تحميل بيانات البحث. تحقق من الاتصال ثم أعد المحاولة.");
      toast.error("تعذر تحميل البيانات. يمكنك إعادة المحاولة.");
      return;
    }
    setSearchError("");
    setTeachers((data || []) as Teacher[]);
    setSelectedTeachers([]);
    setHasSearched(true);
    if (!data?.length) toast.info("لا يوجد معلمون متاحون لهذه المادة في مدينتك حاليًا.");
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
      if (error.message?.includes("In-person service is unavailable in this city")) {
        const city = cities.find((item) => item.id === cityId)?.name || "";
        setCityUnavailableMessage(`الحصص الحضورية غير متاحة في ${city} حاليًا. يمكنك حجز حصة أونلاين.`);
        setSearchError("");
      } else {
        toast.error(
          error.message?.includes("already has an online lesson")
            ? "لديك حصة أونلاين في هذا الموعد. اختر وقتاً آخر."
            : error.message || "تعذر إرسال طلب الحصة"
        );
      }
      return;
    }
    setBookingSuccess({
      subject: subjects.find((subject) => subject.id === subjectId)?.name || "المادة المختارة",
      teacherCount: selectedTeachers.length,
      scheduledAt: scheduled.toISOString(),
    });
    setSelectedTeachers([]);
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
  const selectedCity = cities.find((city) => city.id === cityId);
  return (
    <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
      <CardHeader className="border-b bg-gradient-to-l from-primary/10 via-background to-secondary/10">
        <CardTitle>الحصص الحضورية</CardTitle>
        <p className="text-sm text-muted-foreground">مدة التدريس 60 دقيقة، ويُحجز 100 دقيقة من الباقة. يُرسل الطلب قبل الموعد بساعتين على الأقل.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dialog open={Boolean(bookingSuccess)} onOpenChange={(open) => !open && setBookingSuccess(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تم إرسال طلبك بنجاح</DialogTitle>
              <DialogDescription>
                تم إرسال طلب حصة حضورية إلى {bookingSuccess?.teacherCount} معلم متخصص في {bookingSuccess?.subject}.
                تم حجز الرصيد مؤقتاً حتى القبول أو انتهاء المهلة.
              </DialogDescription>
            </DialogHeader>
            {bookingSuccess && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                {new Date(bookingSuccess.scheduledAt).toLocaleString("ar-SA", { weekday: "long", hour: "numeric", minute: "2-digit" })}
                <div className="mt-1 text-muted-foreground">
                  {new Date(bookingSuccess.scheduledAt).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })} · 60 دقيقة · {bookingSuccess.subject}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:justify-center">
              <Button variant="outline" onClick={() => setBookingSuccess(null)}>حجز حصة أخرى</Button>
              <Button asChild><Link to="/student">متابعة للوحة الطالب</Link></Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {loadError && <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">تعذر تحميل بيانات المدن أو العناوين. أعد المحاولة قبل المتابعة. <Button size="sm" variant="outline" className="ms-2" onClick={() => setReloadKey((value) => value + 1)}>إعادة المحاولة</Button></div>}
        <div className="flex items-center justify-center gap-2 py-1">
          <span className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm">1 · بيانات الحصة</span>
          <span className="h-px w-8 bg-border" />
          <span className={`rounded-xl px-3 py-2 text-xs font-bold ${teachers.length ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>2 · اختيار المعلم</span>
          <span className="h-px w-8 bg-border" />
          <span className="rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">3 · إرسال الطلب</span>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.03] via-card to-secondary/[0.04] p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
            <div><h3 className="font-black text-foreground">بيانات الحصة الحضورية</h3><p className="mt-1 text-xs text-muted-foreground">اختر عنوان الزيارة والمادة والموعد المناسب.</p></div>
            <div className="flex gap-2"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">60 دقيقة تدريس</span><span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-bold text-secondary">100 دقيقة من الرصيد</span></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">المدينة
            <select className="mt-1.5 h-11 w-full rounded-xl border border-input bg-muted/40 px-3 font-normal outline-none transition focus:ring-2 focus:ring-primary/20" value={cityId} onChange={(e) => { setCityId(e.target.value); setCityUnavailableMessage(""); setAddressId((current) => addresses.some((a) => a.id === current && a.city_id === e.target.value) ? current : ""); setTeachers([]); setSelectedTeachers([]); setSearchError(""); setHasSearched(false); }}>
              <option value="">اختر مدينة متاحة</option>
              {cities.filter((c) => c.enabled).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {selectedCity && !selectedCity.enabled && <option value={selectedCity.id} disabled>{selectedCity.name} · الحضوري غير متاح</option>}
            </select>
          </label>
          <label className="text-sm font-semibold">عنوان الزيارة
            <select className="mt-1.5 h-11 w-full rounded-xl border border-input bg-muted/40 px-3 font-normal outline-none transition focus:ring-2 focus:ring-primary/20" value={addressId} disabled={addresses.length === 0} onChange={(e) => { const address = addresses.find((item) => item.id === e.target.value); setAddressId(e.target.value); setCityUnavailableMessage(""); if (address) setCityId(address.city_id); setTeachers([]); setSelectedTeachers([]); setSearchError(""); setHasSearched(false); }}>
              <option value="">اختر عنوان الحصة</option>{addresses.map((a) => <option key={a.id} value={a.id}>{a.name} · {cities.find((city) => city.id === a.city_id)?.name || "مدينة"}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">المادة
            <select className="mt-1.5 h-11 w-full rounded-xl border border-input bg-muted/40 px-3 font-normal outline-none transition focus:ring-2 focus:ring-primary/20" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTeachers([]); setSelectedTeachers([]); setSearchError(""); setHasSearched(false); }}>
              <option value="">اختر المادة</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 space-y-4 border-t border-border/50 pt-4" dir="rtl">
          <div>
            <h4 className="text-sm font-bold text-foreground">اختر يوم الحصة</h4>
            <p className="mt-1 text-xs text-muted-foreground">موعد واحد لكل طلب، والحجز متاح قبل ساعتين على الأقل.</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="أيام الحصة">
            {Array.from({ length: 7 }, (_, index) => {
              const day = new Date();
              day.setHours(0, 0, 0, 0);
              day.setDate(day.getDate() + index);
              const key = localDateKey(day);
              const active = scheduledAt.slice(0, 10) === key;
              const dayTimes = availableTimesForDate(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={dayTimes.length === 0}
                  onClick={() => {
                    const preferredTime = scheduledAt.slice(11, 16);
                    const nextTime = dayTimes.includes(preferredTime) ? preferredTime : dayTimes[0];
                    const next = `${key}T${nextTime}`;
                    setScheduledAt(next);
                    setTeachers([]);
                    setSelectedTeachers([]);
                    setSearchError("");
                    setHasSearched(false);
                  }}
                  aria-pressed={active}
                  className={`flex min-w-[76px] shrink-0 flex-col items-center rounded-xl border-2 px-3 py-2.5 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : dayTimes.length === 0
                      ? "cursor-not-allowed border-border/40 bg-muted/30 text-muted-foreground/40"
                      : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.04]"
                  }`}
                >
                  <span className="font-semibold">{index === 0 ? "اليوم" : day.toLocaleDateString("ar-SA", { weekday: "short" })}</span>
                  <span className="mt-1 text-lg font-black leading-tight">{day.toLocaleDateString("ar-SA", { day: "numeric" })}</span>
                  <span className="mt-0.5 text-[10px]">{day.toLocaleDateString("ar-SA", { month: "short" })}</span>
                </button>
              );
            })}
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">اختر الساعة</h4>
              <span className="text-[11px] text-muted-foreground">مدة الحصة 60 دقيقة</span>
            </div>
            {[
              { label: "صباحًا", times: appointmentTimes.filter((time) => Number(time.slice(0, 2)) < 12) },
              { label: "مساءً", times: appointmentTimes.filter((time) => Number(time.slice(0, 2)) >= 12) },
            ].map((period) => (
              <div key={period.label} className="mb-3 last:mb-0">
                <p className="mb-2 text-xs font-bold text-muted-foreground">{period.label}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
                  {period.times.map((time) => {
                    const candidate = new Date(`${scheduledAt.slice(0, 10)}T${time}`);
                    const unavailable = candidate.getTime() - Date.now() < 120 * 60_000;
                    const active = scheduledAt.slice(11, 16) === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={unavailable}
                        aria-pressed={active}
                        onClick={() => {
                          setScheduledAt(`${scheduledAt.slice(0, 10)}T${time}`);
                          setTeachers([]);
                          setSelectedTeachers([]);
                          setSearchError("");
                          setHasSearched(false);
                        }}
                        className={`rounded-lg border px-2 py-2.5 text-xs font-bold transition-colors ${
                          unavailable
                            ? "cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/40 line-through"
                            : active
                              ? "border-secondary bg-secondary text-secondary-foreground shadow-sm"
                              : "border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.04]"
                        }`}
                      >
                        {formatAppointmentTime(`${scheduledAt.slice(0, 10)}T${time}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-secondary/20 bg-secondary/[0.06] p-3.5" aria-live="polite">
            <p className="text-xs font-bold text-muted-foreground">ملخص الموعد</p>
            <p className="mt-1.5 text-sm font-bold text-foreground">
              {new Date(scheduledAt).toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })} · {formatAppointmentTime(scheduledAt)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">حصة حضورية واحدة · 60 دقيقة تدريس · يُحجز 100 دقيقة من الرصيد</p>
          </div>
        </div>
        </div>
        {addresses.length === 0 && (
          <div className="rounded-md border border-dashed p-3 text-sm" role="status">
            <p>لا يوجد عنوان محفوظ. أكمل عنوانك أولاً من ملفك الشخصي لتحديد المدينة.</p>
            <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" to="/profile">إضافة عنوان من الملف الشخصي</Link>
          </div>
        )}
        {addresses.length > 0 && cityId && !hasAddressInSelectedCity && (
          <div className="rounded-md border border-dashed p-3 text-sm" role="status">
            <p>لا يوجد عنوان محفوظ لهذه المدينة. أضف العنوان من قسم العناوين في ملفك الشخصي أولاً.</p>
            <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" to="/profile">احفظ عنوانك من الخريطة في الملف الشخصي</Link>
          </div>
        )}
        {((selectedCity && !selectedCity.enabled && addressId) || cityUnavailableMessage) && <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{cityUnavailableMessage || `الحصص الحضورية غير متاحة في ${selectedCity?.name} حاليًا. يمكنك حجز حصة أونلاين.`} <Link className="font-semibold underline" to="/booking">الحجز الأونلاين</Link></div>}
        {searchError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-3 text-sm text-destructive">{searchError}</div>}
        <Button variant="outline" className="h-11 rounded-xl px-5" onClick={searchTeachers} disabled={loading || !cityId || !addressId || !subjectId}>{loading ? "جارٍ البحث..." : "ابحث عن معلمين ضمن النطاق"}</Button>
        {loading && teachers.length === 0 && hasSearched && (
          <div role="status" className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">جارٍ البحث عن معلمين متاحين لهذا الموعد...</div>
        )}
        {!loading && hasSearched && teachers.length === 0 && !searchError && !cityUnavailableMessage && (
          <div role="status" className="rounded-xl border border-dashed border-border p-4 text-sm">
            <p className="font-semibold text-foreground">لا توجد نتائج لهذا الموعد</p>
            <p className="mt-1 text-muted-foreground">جرّب ساعة أو يومًا آخر للعثور على معلم متاح.</p>
          </div>
        )}
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
          {requestsError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            تعذر تحميل حالة الطلبات. أعد المحاولة.
            <Button size="sm" variant="outline" className="ms-2" onClick={() => void refreshRequests()}>إعادة المحاولة</Button>
          </div>}
          {requestsLoaded && !requestsError && requests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات حالية.</p>}
          {requests.slice(0, 5).map((row) => (
            <div key={row.request_group_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <strong>{row.subject_name || "حصة حضورية"}</strong>
                <div className="text-muted-foreground">{new Date(row.scheduled_at).toLocaleString("ar-SA")}</div>
                <div className={row.status === "open" ? "mt-1 font-medium text-amber-700" : "mt-1 text-muted-foreground"}>
                  {row.status === "open"
                    ? new Date(row.acceptance_deadline).getTime() <= now
                      ? "انتهت مهلة القبول، جارٍ تحديث حالة الطلب"
                      : `بانتظار قبول المعلم · متبقي ${formatAcceptanceTimeLeft(row.acceptance_deadline, now)}`
                    : row.status === "accepted"
                      ? "تم قبول الطلب"
                      : row.status === "expired"
                        ? "انتهت مهلة القبول أو اعتذر جميع المعلمين"
                        : row.status === "cancelled"
                          ? "تم إلغاء الطلب"
                          : row.status}
                </div>
              </div>
              {row.booking_id && row.status === "accepted" && (row.attendance_confirmed_at
                ? <span className="text-xs font-medium text-green-700">تم تأكيد الحضور</span>
                : Date.now() >= new Date(row.scheduled_at).getTime() && Date.now() < new Date(row.scheduled_at).getTime() + 15 * 60_000
                  ? <div className="flex items-center gap-2">
                  <input aria-label="رمز الحضور" className="h-9 w-28 rounded-md border bg-background px-2 text-center tracking-widest" inputMode="numeric" maxLength={4} placeholder="••••" value={attendanceCodes[row.booking_id] || ""} onChange={(e) => setAttendanceCodes((current) => ({ ...current, [row.booking_id!]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                  <Button size="sm" disabled={loading} onClick={() => confirmAttendance(row.booking_id!)}>تأكيد الحضور</Button>
                  </div>
                  : <span className="text-xs text-muted-foreground">يظهر إدخال الرمز عند بداية الحصة</span>)}
              {["open", "accepted"].includes(row.status) && !row.attendance_confirmed_at && <Button size="sm" variant="outline" disabled={loading} onClick={() => cancelRequest(row)}>إلغاء</Button>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
