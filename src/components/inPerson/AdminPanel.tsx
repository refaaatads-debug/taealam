import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TeacherRow = {
  teacher_id: string;
  full_name: string;
  is_enabled: boolean;
  approval_status: string;
  city_name: string | null;
  service_radius_km: number | null;
  latitude: number | null;
  longitude: number | null;
};
type FinancialRow = { booking_id: string; scheduled_at: string; teacher_earning: number; teacher_earning_status: string | null; teacher_compensation: number; compensation_status: string | null; platform_revenue: number; revenue_events: number };

export default function InPersonAdminPanel() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [cities, setCities] = useState<{ id: string; name_ar: string }[]>([]);
  const [financials, setFinancials] = useState<FinancialRow[]>([]);
  const [sessionCounts, setSessionCounts] = useState({ online: 0, inPerson: 0 });
  const [userId, setUserId] = useState("");
  const [pilotRole, setPilotRole] = useState("student");
  const [busy, setBusy] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [
      { data: teacherRows, error },
      { data: cityRows },
      { data: financialRows },
      onlineCountResult,
      inPersonCountResult,
    ] = await Promise.all([
      supabase.rpc("admin_list_in_person_teachers" as any),
      supabase.from("cities" as any).select("id,name_ar").order("name_ar"),
      supabase.rpc("admin_list_in_person_financials" as any),
      (supabase.from as any)("bookings").select("id", { count: "exact", head: true }).eq("delivery_mode", "online"),
      (supabase.from as any)("bookings").select("id", { count: "exact", head: true }).eq("delivery_mode", "in_person"),
    ]);
    if (error) toast.error(error.message || "تعذر تحميل إعدادات الحضوري");
    else setTeachers((teacherRows || []) as TeacherRow[]);
    setCities((cityRows || []) as { id: string; name_ar: string }[]);
    setFinancials((financialRows || []) as FinancialRow[]);
    if (onlineCountResult.error || inPersonCountResult.error) {
      toast.error("تعذر تحميل إحصاءات أنواع الحصص");
    } else {
      setSessionCounts({
        online: onlineCountResult.count || 0,
        inPerson: inPersonCountResult.count || 0,
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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
      const message = error.message?.includes("Teacher profile must be approved with a complete service location")
        ? "تعذر تفعيل استقبال الطلبات. يجب اعتماد ملف المعلم الأساسي، واختيار «حضوري» أو «عن بُعد وحضوري»، وحفظ موقع الخدمة ونطاقه من ملف المعلم."
        : error.message || "تعذر حفظ اعتماد المعلم";
      toast.error(message);
    }
    else { toast.success("تم تحديث اعتماد الحضوري"); await refresh(); }
  };

  const setPilot = async (enabled: boolean) => {
    if (!userId.trim()) return toast.error("أدخل معرّف الحساب الذي تم التحقق منه");
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_in_person_tester" as any, {
      p_user_id: userId.trim(),
      p_role: pilotRole,
      p_enabled: enabled,
    });
    setBusy(false);
    if (error) toast.error(error.message || "تعذر تحديث حساب التجربة");
    else { toast.success(enabled ? "تم تفعيل حساب التجربة المحدد" : "تم إيقاف حساب التجربة"); setUserId(""); }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">حصص أونلاين</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-black tabular-nums">{sessionCounts.online.toLocaleString("ar-SA")}</p><p className="text-xs text-muted-foreground">إجمالي الحجوزات المسجلة</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">حصص حضورية</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-black tabular-nums">{sessionCounts.inPerson.toLocaleString("ar-SA")}</p><p className="text-xs text-muted-foreground">إجمالي الحجوزات المسجلة</p></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>إدارة الحصص الحضورية</CardTitle><p className="text-sm text-muted-foreground">لا يُفعّل أي حساب تلقائياً. أضف فقط معرّفات حسابات التجربة التي تم التحقق منها.</p></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto_auto]">
            <input className="h-10 rounded-md border bg-background px-3 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="معرّف الحساب (UUID)" dir="ltr" />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={pilotRole} onChange={(e) => setPilotRole(e.target.value)}>
              <option value="student">طالب</option><option value="teacher">معلم</option><option value="admin">إدارة</option>
            </select>
            <Button disabled={busy} onClick={() => setPilot(true)}>تفعيل الحساب المحدد</Button>
            <Button variant="outline" disabled={busy} onClick={() => setPilot(false)}>إيقاف الحساب</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>مدن الخدمة</CardTitle>
          <p className="text-sm text-muted-foreground">تُضاف المدينة تلقائياً من نتائج خرائط Google عند اختيار موقع سعودي؛ لا تُقبل أسماء مدن يدوية.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">{cities.map((city) => <span key={city.id} className="rounded-full border px-3 py-1 text-sm">{city.name_ar}</span>)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>اعتماد المعلمين الحضوريين</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {teachers.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات اعتماد حالياً.</p>}
          {teachers.map((teacher) => (
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
      </Card>
      <Card>
        <CardHeader><CardTitle>تسوية مستحقات الحضوري</CardTitle><p className="text-sm text-muted-foreground">تظهر 60 ر.س للمعلم و40 ر.س للمنصة بعد تأكيد الرمز، أو 30 ر.س للمعلم و20 ر.س للمنصة عند الإلغاء المتأخر.</p></CardHeader>
        <CardContent className="space-y-2">
          {financials.slice(0, 20).map((row) => <div key={row.booking_id} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-5">
            <span>{new Date(row.scheduled_at).toLocaleString("ar-SA")}</span><span>أجر المعلم: {row.teacher_earning} ر.س</span>
            <span>تعويض: {row.teacher_compensation} ر.س {row.compensation_status ? `(${row.compensation_status === "available" ? "متاح" : "معلّق"})` : ""}</span>
            <span>إيراد المنصة: {row.platform_revenue} ر.س</span><span>{row.teacher_earning_status === "available" ? "متاح" : row.teacher_earning_status || "لا يوجد أجر"}</span>
          </div>)}
          {financials.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تسويات حضورية حتى الآن.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
