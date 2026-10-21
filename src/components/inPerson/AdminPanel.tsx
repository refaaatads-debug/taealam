import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { arabicBookingError } from "@/lib/arabicBookingError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck2, CircleDollarSign, Clock3, Landmark, MapPinned, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import GoogleMapLocationPicker, { type MapLocation } from "@/components/profile/GoogleMapLocationPicker";

type TeacherRow = {
  teacher_id: string;
  full_name: string;
  is_enabled: boolean;
  approval_status: string;
  city_name: string | null;
  service_radius_km: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};
type FinancialRow = { booking_id: string; scheduled_at: string; teacher_earning: number; teacher_earning_status: string | null; teacher_compensation: number; compensation_status: string | null; platform_revenue: number; revenue_events: number };
type CityRow = { city_id: string; city_name: string; enabled: boolean; changed_by: string | null; changed_at: string | null };
type AdminSection = "overview" | "approvals" | "settlements" | "cities";

const sar = (value: number) => `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;

const saudiDateParts = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dateKey: `${get("year")}-${get("month")}-${get("day")}`, weekday: String(weekday) };
};

export default function InPersonAdminPanel({ section = "overview" }: { section?: AdminSection }) {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [citySearch, setCitySearch] = useState("");
  const [newCityLocation, setNewCityLocation] = useState<MapLocation | null>(null);
  const [financials, setFinancials] = useState<FinancialRow[]>([]);
  const [sessionCounts, setSessionCounts] = useState({ online: 0, inPerson: 0 });
  const [busy, setBusy] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [cityEnabledFilter, setCityEnabledFilter] = useState("all");
  const [cityFrom, setCityFrom] = useState("");
  const [cityTo, setCityTo] = useState("");
  const [cityDayFilter, setCityDayFilter] = useState("all");
  const [teacherApprovalFilter, setTeacherApprovalFilter] = useState("all");
  const [teacherFrom, setTeacherFrom] = useState("");
  const [teacherTo, setTeacherTo] = useState("");
  const [teacherDay, setTeacherDay] = useState("all");
  const [financialStatusFilter, setFinancialStatusFilter] = useState("all");
  const [financialFrom, setFinancialFrom] = useState("");
  const [financialTo, setFinancialTo] = useState("");
  const [financialDay, setFinancialDay] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [
      { data: teacherRows, error },
      { data: cityRows, error: cityError },
      { data: financialRows },
      onlineCountResult,
      inPersonCountResult,
    ] = await Promise.all([
      supabase.rpc("admin_list_in_person_teachers_with_dates" as any),
      supabase.rpc("admin_list_in_person_cities" as any),
      supabase.rpc("admin_list_in_person_financials" as any),
      (supabase.from as any)("bookings").select("id", { count: "exact", head: true }).eq("delivery_mode", "online"),
      (supabase.from as any)("bookings").select("id", { count: "exact", head: true }).eq("delivery_mode", "in_person"),
    ]);
    if (error) toast.error(arabicBookingError(error, "تعذر تحميل إعدادات الحضوري."));
    else setTeachers((teacherRows || []) as TeacherRow[]);
    if (cityError) toast.error("تعذر تحميل مدن التعليم الحضوري");
    else setCities((cityRows || []) as CityRow[]);
    setFinancials((financialRows || []) as FinancialRow[]);
    if (onlineCountResult.error || inPersonCountResult.error) {
      toast.error("تعذر تحميل إحصاءات أنواع الحصص");
    } else {
      setSessionCounts({
        online: onlineCountResult.count || 0,
        inPerson: inPersonCountResult.count || 0,
      });
    }
    setRefreshing(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filteredCities = useMemo(() => cities.filter((city) => {
    const changed = saudiDateParts(city.changed_at);
    const dateKey = changed?.dateKey || "";
    return (cityEnabledFilter === "all" || city.enabled === (cityEnabledFilter === "enabled"))
      && (!cityFrom || Boolean(dateKey && dateKey >= cityFrom))
      && (!cityTo || Boolean(dateKey && dateKey <= cityTo))
      && (cityDayFilter === "all" || changed?.weekday === cityDayFilter)
      && city.city_name.toLocaleLowerCase().includes(citySearch.trim().toLocaleLowerCase());
  }), [cities, cityEnabledFilter, cityFrom, cityTo, cityDayFilter, citySearch]);

  const filteredTeachers = useMemo(() => teachers.filter((teacher) => {
    const created = saudiDateParts(teacher.created_at);
    const date = created?.dateKey || "";
    return (teacherApprovalFilter === "all" || teacher.approval_status === teacherApprovalFilter)
      && (!teacherFrom || Boolean(date && date >= teacherFrom))
      && (!teacherTo || Boolean(date && date <= teacherTo))
      && (teacherDay === "all" || created?.weekday === teacherDay);
  }), [teachers, teacherApprovalFilter, teacherFrom, teacherTo, teacherDay]);

  const filteredFinancials = useMemo(() => financials.filter((row) => {
    const date = saudiDateParts(row.scheduled_at);
    const dateKey = date?.dateKey || "";
    const status = row.teacher_earning_status || row.compensation_status;
    return (!financialFrom || dateKey >= financialFrom) && (!financialTo || dateKey <= financialTo)
      && (financialDay === "all" || date?.weekday === financialDay)
      && (financialStatusFilter === "all" || status === financialStatusFilter);
  }), [financials, financialFrom, financialTo, financialDay, financialStatusFilter]);

  const monthlyFinance = useMemo(() => {
    const currentMonth = saudiDateParts(new Date().toISOString())?.dateKey.slice(0, 7);
    if (!currentMonth) return [];
    const start = new Date(`${currentMonth}-01T00:00:00Z`);
    return Array.from({ length: 6 }, (_, index) => {
      const month = new Date(start);
      month.setUTCMonth(start.getUTCMonth() - 5 + index);
      const key = month.toISOString().slice(0, 7);
      const rows = financials.filter((row) => saudiDateParts(row.scheduled_at)?.dateKey.startsWith(key));
      return {
        month: month.toLocaleDateString("ar-SA", { month: "short", timeZone: "UTC" }),
        teacher: rows.reduce((sum, row) => sum + (Number(row.teacher_earning) || 0), 0),
        platform: rows.reduce((sum, row) => sum + (Number(row.platform_revenue) || 0), 0),
      };
    });
  }, [financials]);

  const pendingDues = financials.reduce((sum, row) => (
    sum
      + (row.teacher_earning_status === "pending" ? Number(row.teacher_earning) || 0 : 0)
      + (row.compensation_status === "pending" ? Number(row.teacher_compensation) || 0 : 0)
  ), 0);
  const platformRevenue = financials.reduce((sum, row) => sum + (Number(row.platform_revenue) || 0), 0);
  const settledTeacherPayments = financials.reduce((sum, row) => (
    sum
      + (row.teacher_earning_status === "available" ? Number(row.teacher_earning) || 0 : 0)
      + (row.compensation_status === "available" ? Number(row.teacher_compensation) || 0 : 0)
  ), 0);
  const enabledTeachers = teachers.filter((teacher) => teacher.is_enabled && teacher.approval_status === "approved").length;
  const activeCities = cities.filter((city) => city.enabled).length;
  const sectionMeta: Record<AdminSection, { title: string; description: string }> = {
    overview: { title: "نظرة عامة على التعليم الحضوري", description: "مؤشرات التشغيل، المستحقات، والإتاحة في المدن." },
    approvals: { title: "اعتماد المعلمين الحضوريين", description: "مراجعة طلبات المعلمين والتحكم في استقبالهم للحجوزات الحضورية." },
    settlements: { title: "تسوية مستحقات الحضوري", description: "متابعة مستحقات المعلمين وإيراد المنصة والتعويضات حسب حالة التسوية." },
    cities: { title: "مدن التعليم الحضوري", description: "إدارة المدن التي تتوفر فيها الزيارات الحضورية." },
  };

  const saveTeacher = async (teacher: TeacherRow, status: string, enabled: boolean, reason = "") => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_in_person_teacher_review" as any, {
      p_teacher_id: teacher.teacher_id,
      p_approval_status: status,
      p_enabled: enabled,
      p_rejection_reason: reason || null,
    });
    setBusy(false);
    if (error) {
      toast.error(arabicBookingError(error, "تعذر حفظ اعتماد المعلم الحضوري."));
    }
    else { toast.success("تم تحديث اعتماد الحضوري"); await refresh(); }
  };

  const saveCity = async () => {
    if (!newCityLocation || newCityLocation.countryCode.toUpperCase() !== "SA") {
      toast.error("اختر مدينة سعودية من نتائج خرائط Google");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_upsert_saudi_city_from_places" as any, {
      p_name_ar: newCityLocation.city,
      p_name_en: newCityLocation.city,
      p_latitude: newCityLocation.latitude,
      p_longitude: newCityLocation.longitude,
    });
    setBusy(false);
    if (error) toast.error(arabicBookingError(error, "تعذرت إضافة المدينة."));
    else {
      toast.success("تم تسجيل المدينة، والحضوري متوقف فيها افتراضياً");
      setNewCityLocation(null);
      await refresh();
    }
  };

  const setCityAvailability = async (city: CityRow, enabled: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_in_person_city_enabled" as any, {
      p_city_id: city.city_id, p_enabled: enabled,
    });
    setBusy(false);
    if (error) toast.error(arabicBookingError(error, "تعذر تحديث إتاحة المدينة."));
    else {
      toast.success(enabled ? `تم تفعيل الحضوري في ${city.city_name}` : `تم إيقاف الحضوري في ${city.city_name}`);
      await refresh();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-l from-[#123d6b] via-[#164f6b] to-[#0c756a] p-5 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10"><Landmark className="h-6 w-6" /></span>
          <div><h2 className="text-xl font-black">{sectionMeta[section].title}</h2><p className="mt-1 text-sm text-white/75">{sectionMeta[section].description}</p></div>
        </div>
        <Button variant="secondary" className="gap-2 rounded-xl" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> تحديث البيانات
        </Button>
      </div>

      {section === "overview" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "حجوزات حضورية", value: sessionCounts.inPerson.toLocaleString("ar-SA"), note: "إجمالي الحجوزات المسجلة", icon: CalendarCheck2, tone: "text-blue-700 bg-blue-50" },
              { label: "إيراد المنصة", value: sar(platformRevenue), note: "من سجل إيرادات الحضوري", icon: CircleDollarSign, tone: "text-emerald-700 bg-emerald-50" },
              { label: "مستحقات معلقة", value: sar(pendingDues), note: "أجور وتعويضات بانتظار التسوية", icon: Clock3, tone: "text-amber-700 bg-amber-50" },
              { label: "معلمون ومدن مفعّلة", value: `${enabledTeachers} · ${activeCities}`, note: "معلمون معتمدون · مدن متاحة", icon: UsersRound, tone: "text-indigo-700 bg-indigo-50" },
            ].map((metric) => (
              <Card key={metric.label} className="overflow-hidden border-slate-200 shadow-sm">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div><p className="text-xs font-semibold text-muted-foreground">{metric.label}</p><p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{metric.value}</p><p className="mt-1 text-[11px] text-muted-foreground">{metric.note}</p></div>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}><metric.icon className="h-5 w-5" /></span>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <CardTitle className="text-base">الحركة المالية · آخر 6 أشهر</CardTitle>
                <p className="text-xs text-muted-foreground">مقارنة أجر المعلمين بإيراد المنصة من الحجوزات الحضورية.</p>
              </CardHeader>
              <CardContent className="pt-5">
                {financials.length === 0
                  ? <p className="py-12 text-center text-sm text-muted-foreground">لا توجد بيانات مالية حضورية بعد.</p>
                  : <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyFinance} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} width={48} />
                        <Tooltip formatter={(value) => sar(Number(value) || 0)} />
                        <Bar dataKey="teacher" name="أجر المعلمين" fill="#16856f" radius={[5, 5, 0, 0]} />
                        <Bar dataKey="platform" name="إيراد المنصة" fill="#174a78" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">أجر المعلمين المتاح: {sar(settledTeacherPayments)}</Badge>
                  <Badge variant="outline">حصص أونلاين للمقارنة: {sessionCounts.online.toLocaleString("ar-SA")}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-900/10 bg-gradient-to-br from-emerald-50 to-white shadow-sm">
              <CardHeader><CardTitle className="text-base">ملخص التشغيل</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-white bg-white/80 p-3"><span className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-emerald-700" /> طلبات اعتماد معلقة</span><strong className="text-lg tabular-nums">{teachers.filter((teacher) => teacher.approval_status === "pending").length.toLocaleString("ar-SA")}</strong></div>
                <div className="flex items-center justify-between rounded-xl border border-white bg-white/80 p-3"><span className="flex items-center gap-2 text-sm"><MapPinned className="h-4 w-4 text-blue-700" /> مدن مفعّلة</span><strong className="text-lg tabular-nums">{activeCities.toLocaleString("ar-SA")}</strong></div>
                <div className="flex items-center justify-between rounded-xl border border-white bg-white/80 p-3"><span className="flex items-center gap-2 text-sm"><CircleDollarSign className="h-4 w-4 text-amber-700" /> مستحقات متاحة</span><strong className="text-sm tabular-nums">{sar(settledTeacherPayments)}</strong></div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {section === "overview" && <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>إتاحة الحصص الحضورية</CardTitle>
          <p className="text-sm text-muted-foreground">
            الميزة متاحة لحسابات الطلاب والمعلمين والإدارة بحسب الدور والصلاحيات؛ لا يلزم تفعيل حسابات تجريبية منفردة.
          </p>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-6">
            الإتاحة لا تعتمد المعلم أو تفعّل المدن تلقائيًا. يظل الحجز مشروطًا باعتماد المعلم للحضوري،
            وتفعيل المدينة، وتوفر المعلم ومادة التدريس والرصيد، مع تطبيق صلاحيات كل دور.
          </p>
        </CardContent>
      </Card>}

      {section === "cities" && <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>تغطية المدن وتفعيل الخدمة</CardTitle>
          <p className="text-sm text-muted-foreground">الإتاحة مستقلة عن حفظ العناوين. لا يؤدي إيقاف مدينة إلى حذفها أو حذف عناوين المستخدمين.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <GoogleMapLocationPicker value={newCityLocation} onChange={setNewCityLocation} height={180} searchPlaceholder="ابحث عن مدينة سعودية" instruction="اختر المدينة من نتائج خرائط Google؛ لن يُنشأ عنوان مستخدم." />
            <Button disabled={busy || !newCityLocation} onClick={() => void saveCity()}>إضافة مدينة (متوقفة افتراضياً)</Button>
          </div>
          <Input value={citySearch} onChange={(event) => setCitySearch(event.target.value)} placeholder="ابحث باسم المدينة" aria-label="البحث في المدن" />
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={cityEnabledFilter} onChange={(e) => setCityEnabledFilter(e.target.value)} aria-label="حالة إتاحة المدن">
            <option value="all">كل حالات المدن</option><option value="enabled">الحضوري مفعّل</option><option value="disabled">الحضوري متوقف</option>
          </select>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input type="date" value={cityFrom} onChange={(e) => setCityFrom(e.target.value)} aria-label="المدن من تاريخ التغيير" />
            <Input type="date" value={cityTo} onChange={(e) => setCityTo(e.target.value)} aria-label="المدن إلى تاريخ التغيير" />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={cityDayFilter} onChange={(e) => setCityDayFilter(e.target.value)} aria-label="يوم تغيير حالة المدينة">
              <option value="all">كل أيام التغيير</option>{["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            {filteredCities.map((city) => (
              <div key={city.city_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div><strong>{city.city_name}</strong><div className="text-xs text-muted-foreground">{city.enabled ? "الحضوري متاح" : "الحضوري متوقف"}{city.changed_at ? ` · آخر تغيير ${new Date(city.changed_at).toLocaleString("ar-SA")}` : " · لم تُفعّل بعد"}</div></div>
                <Button size="sm" variant={city.enabled ? "outline" : "default"} disabled={busy} onClick={() => void setCityAvailability(city, !city.enabled)}>{city.enabled ? "إيقاف الحضوري" : "تفعيل الحضوري"}</Button>
              </div>
            ))}
            {filteredCities.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مدن تطابق عوامل التصفية.</p>}
          </div>
        </CardContent>
      </Card>}

      {section === "approvals" && <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle>قائمة اعتماد المعلمين</CardTitle><p className="text-sm text-muted-foreground">راجع حالة الاعتماد وموقع الخدمة ونطاق التغطية قبل تفعيل استقبال الطلبات.</p></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={teacherApprovalFilter} onChange={(e) => setTeacherApprovalFilter(e.target.value)} aria-label="حالة اعتماد المعلمين الحضوريين">
              <option value="all">كل حالات الاعتماد</option><option value="pending">بانتظار المراجعة</option><option value="approved">معتمد</option><option value="rejected">مرفوض</option><option value="not_requested">غير مقدم</option>
            </select>
            <Input type="date" value={teacherFrom} onChange={(e) => setTeacherFrom(e.target.value)} aria-label="المعلمون من تاريخ" />
            <Input type="date" value={teacherTo} onChange={(e) => setTeacherTo(e.target.value)} aria-label="المعلمون إلى تاريخ" />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={teacherDay} onChange={(e) => setTeacherDay(e.target.value)} aria-label="يوم تقديم طلب الاعتماد">
              <option value="all">كل أيام التقديم</option>{["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
            </select>
          </div>
          {filteredTeachers.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات اعتماد مطابقة.</p>}
          {filteredTeachers.map((teacher) => (
            <div key={teacher.teacher_id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-40 flex-1"><strong>{teacher.full_name}</strong><div className="text-xs text-muted-foreground">{teacher.city_name || "لم تُحدد مدينة"} · {teacher.latitude == null ? "الموقع غير مكتمل" : `${teacher.service_radius_km} كم نطاق`}</div><div className="text-xs text-muted-foreground" dir="ltr">{teacher.teacher_id}</div></div>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                defaultValue={teacher.approval_status}
                onChange={(e) => void saveTeacher(
                  teacher,
                  e.target.value,
                  e.target.value === "approved" && teacher.is_enabled,
                  rejectionReasons[teacher.teacher_id] || "",
                )}
              >
                <option value="pending">بانتظار المراجعة</option><option value="approved">معتمد</option><option value="rejected">مرفوض</option><option value="not_requested">غير مقدم</option>
              </select>
              <input
                className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm"
                aria-label={`سبب الرفض للمعلم ${teacher.full_name}`}
                placeholder="سبب الرفض (مطلوب عند الرفض)"
                value={rejectionReasons[teacher.teacher_id] || ""}
                onChange={(e) => setRejectionReasons((current) => ({ ...current, [teacher.teacher_id]: e.target.value }))}
              />
              <Button size="sm" variant={teacher.is_enabled ? "outline" : "default"} disabled={busy || teacher.approval_status !== "approved"} onClick={() => void saveTeacher(teacher, "approved", !teacher.is_enabled)}>
                {teacher.is_enabled ? "إيقاف استقبال الطلبات" : "تفعيل الاستقبال"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>}
      {section === "settlements" && <Card className="border-emerald-900/10 shadow-sm">
        <CardHeader className="border-b border-emerald-900/10 bg-gradient-to-l from-emerald-50 to-slate-50"><CardTitle>دفتر تسويات الحضوري</CardTitle><p className="text-sm text-muted-foreground">60 ر.س أجرًا للمعلم و40 ر.س للمنصة بعد تأكيد الحضور، أو 30 ر.س للمعلم و20 ر.س للمنصة عند الإلغاء المتأخر.</p></CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">إيراد المنصة</p><strong className="mt-1 block text-lg text-slate-900">{sar(platformRevenue)}</strong></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-800">مستحقات معلقة</p><strong className="mt-1 block text-lg text-amber-900">{sar(pendingDues)}</strong></div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-800">مستحقات متاحة</p><strong className="mt-1 block text-lg text-emerald-900">{sar(settledTeacherPayments)}</strong></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Input type="date" value={financialFrom} onChange={(e) => setFinancialFrom(e.target.value)} aria-label="المستحقات من تاريخ" />
            <Input type="date" value={financialTo} onChange={(e) => setFinancialTo(e.target.value)} aria-label="المستحقات إلى تاريخ" />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={financialDay} onChange={(e) => setFinancialDay(e.target.value)} aria-label="يوم الأسبوع">
              <option value="all">كل الأيام</option>{["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
            </select>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={financialStatusFilter} onChange={(e) => setFinancialStatusFilter(e.target.value)} aria-label="حالة التسوية">
              <option value="all">كل الحالات</option><option value="available">متاح</option><option value="pending">معلّق</option><option value="adjusted">معدّل</option>
            </select>
          </div>
          {filteredFinancials.slice(0, 50).map((row) => <div key={row.booking_id} className="grid items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm sm:grid-cols-6">
            <span className="font-medium">{new Date(row.scheduled_at).toLocaleString("ar-SA")}</span>
            <span>أجر المعلم: <strong>{sar(Number(row.teacher_earning) || 0)}</strong></span>
            <span>تعويض: <strong>{sar(Number(row.teacher_compensation) || 0)}</strong></span>
            <span>إيراد المنصة: <strong>{sar(Number(row.platform_revenue) || 0)}</strong></span>
            <Badge className={row.teacher_earning_status === "available" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>
              {row.teacher_earning_status === "available" ? "مستحق متاح" : row.teacher_earning_status === "pending" ? "معلّق" : row.teacher_earning_status || "لا يوجد أجر"}
            </Badge>
            <span className="text-xs text-muted-foreground">{row.revenue_events} حركة مالية</span>
          </div>)}
          {filteredFinancials.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد تسويات تطابق عوامل التصفية.</p>}
        </CardContent>
      </Card>}
    </div>
  );
}
