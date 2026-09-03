import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, CalendarDays, CheckCircle2, Clock3, Copy, Eye, FileText,
  GraduationCap, Loader2, RefreshCw, Search, UserRound, UsersRound,
  XCircle, Zap, UserPlus, ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ExportCSVButton from "@/components/admin/ExportCSVButton";
import { notificationTemplates } from "@/lib/notificationTemplates";

type RecordSource = "booking" | "request";

type BookingRecord = {
  id: string;
  source: RecordSource;
  status: string;
  student_id: string;
  teacher_id: string | null;
  subject_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  accepted_at?: string | null;
  expires_at?: string | null;
  student_name: string;
  student_phone: string | null;
  teacher_name: string;
  teacher_phone: string | null;
  subject_name: string;
  accepted_by?: string | null;
};

type DirectoryPerson = {
  user_id: string;
  full_name: string;
  phone: string | null;
};

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  pending: { label: "قيد الانتظار", tone: "border-amber-200 bg-amber-50 text-amber-700", icon: Clock3 },
  open: { label: "طلب مفتوح", tone: "border-sky-200 bg-sky-50 text-sky-700", icon: Zap },
  confirmed: { label: "مقبول ومؤكد", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  accepted: { label: "تم قبول الطلب", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  completed: { label: "مكتمل", tone: "border-violet-200 bg-violet-50 text-violet-700", icon: CheckCircle2 },
  rejected: { label: "مرفوض من المعلم", tone: "border-rose-200 bg-rose-50 text-rose-700", icon: XCircle },
  cancelled: { label: "ملغى", tone: "border-slate-200 bg-slate-100 text-slate-600", icon: XCircle },
  expired: { label: "غير مقبول من أي معلم", tone: "border-orange-200 bg-orange-50 text-orange-700", icon: Clock3 },
};

const FILTERS = [
  { value: "all", label: "كل الحالات" },
  { value: "open", label: "طلبات مفتوحة" },
  { value: "pending", label: "قيد الانتظار" },
  { value: "confirmed", label: "مقبولة ومؤكدة" },
  { value: "accepted", label: "تم قبول الطلب" },
  { value: "completed", label: "مكتملة" },
  { value: "rejected", label: "مرفوضة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "expired", label: "غير مقبول من أي معلم" },
];

const REQUEST_UPDATE_STATUSES = [
  { value: "open", label: "طلب مفتوح" },
  { value: "accepted", label: "تم قبول الطلب" },
  { value: "rejected", label: "مرفوض" },
  { value: "cancelled", label: "ملغى" },
  { value: "expired", label: "غير مقبول من أي معلم" },
];

const BOOKING_UPDATE_STATUSES = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "confirmed", label: "مؤكد" },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغى" },
];

const money = (value: number | null) =>
  value === null || value === undefined ? "غير محدد" : `${Number(value).toLocaleString("ar-SA")} ر.س`;

const dateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "غير محدد";

const dateOnly = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" }) : "غير محدد";

const toDateTimeLocal = (value?: string | null) => {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const localDateKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const getMeta = (status: string) => STATUS_META[status] || {
  label: status || "غير محدد",
  tone: "border-slate-200 bg-slate-100 text-slate-600",
  icon: Activity,
};

function StatusBadge({ status }: { status: string }) {
  const meta = getMeta(status);
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.tone}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function PersonPill({ icon: Icon, name, detail, muted = false }: { icon: any; name: string; detail?: string | null; muted?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${muted ? "bg-slate-100 text-slate-400" : "bg-primary/10 text-primary"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 text-right">
        <p className="truncate text-sm font-bold text-foreground">{name}</p>
        {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

export default function AdminBookingsTab() {
  const [records, setRecords] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dailyDate, setDailyDate] = useState(localDateKey(new Date()));
  const [selected, setSelected] = useState<BookingRecord | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [nextStatus, setNextStatus] = useState("");
  const [students, setStudents] = useState<DirectoryPerson[]>([]);
  const [teachers, setTeachers] = useState<DirectoryPerson[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentRequest, setAssignmentRequest] = useState<BookingRecord | null>(null);
  const [assignmentStudentId, setAssignmentStudentId] = useState("");
  const [assignmentTeacherId, setAssignmentTeacherId] = useState("");
  const [assignmentSubjectId, setAssignmentSubjectId] = useState("");
  const [assignmentScheduledAt, setAssignmentScheduledAt] = useState("");
  const [assignmentDuration, setAssignmentDuration] = useState("45");
  const [assignmentPrice, setAssignmentPrice] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);

  const fetchAssignmentOptions = useCallback(async () => {
    const [{ data: profileRows }, { data: roleRows }, { data: teacherRows }, { data: subjectRows }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, phone").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("teacher_profiles").select("user_id").eq("is_approved", true),
      supabase.from("subjects").select("id, name").order("name"),
    ]);

    const profiles = (profileRows || []) as DirectoryPerson[];
    const roles = new Map((roleRows || []).map((row: any) => [row.user_id, row.role]));
    const approvedTeacherIds = new Set((teacherRows || []).map((row: any) => row.user_id));
    setStudents(profiles.filter((profile) => roles.get(profile.user_id) === "student"));
    setTeachers(profiles.filter((profile) => roles.get(profile.user_id) === "teacher" && approvedTeacherIds.has(profile.user_id)));
    setSubjects((subjectRows || []) as { id: string; name: string }[]);
  }, []);

  const fetchRecords = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [{ data: bookings, error: bookingsError }, { data: requests, error: requestsError }] = await Promise.all([
        supabase.from("bookings").select("*").order("created_at", { ascending: false }).range(0, 4999),
        supabase.from("booking_requests" as any).select("*").order("created_at", { ascending: false }).range(0, 4999),
      ]);
      if (bookingsError) throw bookingsError;
      if (requestsError) throw requestsError;

      const bookingRows = (bookings || []) as any[];
      const requestRows = (requests || []) as any[];
      // An open request is no longer waiting once its acceptance window ends.
      // Persist the terminal state so Admin reflects the real outcome instead
      // of showing a stale open request.
      const expiredRequestIds = requestRows
        .filter((row) => row.status === "open" && row.expires_at && new Date(row.expires_at).getTime() <= Date.now())
        .map((row) => row.id);
      if (expiredRequestIds.length > 0) {
        const { error: expiryError } = await supabase
          .from("booking_requests" as any)
          .update({ status: "expired" } as any)
          .in("id", expiredRequestIds)
          .eq("status", "open");
        if (!expiryError) {
          requestRows.forEach((row) => {
            if (expiredRequestIds.includes(row.id)) row.status = "expired";
          });
        }
      }
      const userIds = [...new Set([
        ...bookingRows.flatMap((row) => [row.student_id, row.teacher_id]),
        ...requestRows.flatMap((row) => [row.student_id, row.accepted_by]),
      ].filter(Boolean))];
      const subjectIds = [...new Set([
        ...bookingRows.map((row) => row.subject_id),
        ...requestRows.map((row) => row.subject_id),
      ].filter(Boolean))];

      const [{ data: profiles }, { data: subjects }] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("user_id, full_name, phone").in("user_id", userIds) : Promise.resolve({ data: [] as any[] }),
        subjectIds.length ? supabase.from("subjects").select("id, name").in("id", subjectIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const subjectMap = new Map((subjects || []).map((s: any) => [s.id, s.name]));
      const person = (id: string | null | undefined, fallback: string) => {
        const profile = id ? profileMap.get(id) : null;
        return { name: profile?.full_name?.trim() || fallback, phone: profile?.phone || null };
      };

      const normalizedBookings: BookingRecord[] = bookingRows.map((row) => {
        const student = person(row.student_id, "طالب غير معروف");
        const teacher = person(row.teacher_id, "معلم غير محدد");
        return {
          ...row,
          source: "booking",
          student_name: student.name,
          student_phone: student.phone,
          teacher_name: teacher.name,
          teacher_phone: teacher.phone,
          subject_name: subjectMap.get(row.subject_id) || "مادة غير محددة",
          expires_at: row.expires_at,
        };
      });
      const normalizedRequests: BookingRecord[] = requestRows.map((row) => {
        const student = person(row.student_id, "طالب غير معروف");
        const teacher = person(row.accepted_by, row.status === "open" ? "بانتظار اختيار المعلم" : "معلم غير محدد");
        return {
          ...row,
          source: "request",
          teacher_id: row.accepted_by || null,
          student_name: student.name,
          student_phone: student.phone,
          teacher_name: teacher.name,
          teacher_phone: teacher.phone,
          subject_name: subjectMap.get(row.subject_id) || "مادة غير محددة",
          expires_at: row.expires_at,
        };
      });
      setRecords([...normalizedBookings, ...normalizedRequests].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
    } catch (error: any) {
      console.error("Admin bookings fetch failed", error);
      toast.error("تعذر تحميل بيانات الحجوزات");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchAssignmentOptions();
    const channel = supabase
      .channel("admin-bookings-operations")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchRecords(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_requests" }, () => fetchRecords(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRecords, fetchAssignmentOptions]);

  useEffect(() => {
    setNextStatus(selected?.status || "");
  }, [selected]);

  const counts = useMemo(() => ({
    total: records.length,
    open: records.filter((r) => r.status === "open").length,
    pending: records.filter((r) => r.status === "pending").length,
    confirmed: records.filter((r) => r.status === "confirmed" || r.status === "accepted").length,
    completed: records.filter((r) => r.status === "completed").length,
    rejected: records.filter((r) => r.status === "rejected").length,
    expired: records.filter((r) => r.status === "expired").length,
    cancelled: records.filter((r) => r.status === "cancelled").length,
  }), [records]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesSource = sourceFilter === "all" || record.source === sourceFilter;
      const created = new Date(record.created_at);
      const matchesFrom = !dateFrom || created >= new Date(`${dateFrom}T00:00:00`);
      const matchesTo = !dateTo || created <= new Date(`${dateTo}T23:59:59.999`);
      const searchable = [record.student_name, record.teacher_name, record.subject_name, record.id, record.student_phone, record.teacher_phone].join(" ").toLowerCase();
      return matchesStatus && matchesSource && matchesFrom && matchesTo && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [records, query, statusFilter, sourceFilter, dateFrom, dateTo]);

  const dailyRecords = useMemo(
    () => records.filter((record) => localDateKey(record.scheduled_at) === dailyDate),
    [records, dailyDate],
  );

  const dailyCounts = useMemo(() => ({
    total: dailyRecords.length,
    open: dailyRecords.filter((record) => record.status === "open" || record.status === "expired").length,
    pending: dailyRecords.filter((record) => record.status === "pending").length,
    confirmed: dailyRecords.filter((record) => record.status === "confirmed" || record.status === "accepted").length,
    completed: dailyRecords.filter((record) => record.status === "completed").length,
    rejected: dailyRecords.filter((record) => record.status === "rejected").length,
    cancelled: dailyRecords.filter((record) => record.status === "cancelled").length,
  }), [dailyRecords]);

  const updateStatus = async () => {
    if (!selected || !nextStatus || nextStatus === selected.status) return;
    setSavingStatus(true);
    try {
      const table = selected.source === "booking" ? "bookings" : "booking_requests";
      const { error } = await supabase.from(table as any).update({
        status: nextStatus,
        ...(selected.source === "request" && nextStatus === "accepted" ? { accepted_at: new Date().toISOString() } : {}),
      }).eq("id", selected.id);
      if (error) throw error;
      toast.success("تم تحديث حالة الطلب بنجاح");
      setSelected({ ...selected, status: nextStatus, updated_at: new Date().toISOString() });
      fetchRecords(true);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحديث حالة الحجز");
    } finally {
      setSavingStatus(false);
    }
  };

  const openAssignment = (request?: BookingRecord | null) => {
    setAssignmentRequest(request || null);
    setAssignmentStudentId(request?.student_id || "");
    setAssignmentTeacherId("");
    setAssignmentSubjectId(request?.subject_id || "");
    setAssignmentScheduledAt(toDateTimeLocal(request?.scheduled_at));
    setAssignmentDuration(String(request?.duration_minutes || 45));
    setAssignmentPrice(request?.price == null ? "" : String(request.price));
    setAssignmentNotes(request?.notes || "");
    setAssignmentOpen(true);
    fetchAssignmentOptions();
  };

  const assignBookingDirectly = async () => {
    if (!assignmentStudentId || !assignmentTeacherId || !assignmentSubjectId || !assignmentScheduledAt) {
      toast.error("اختر الطالب والمعلم والمادة والموعد أولًا");
      return;
    }
    const scheduledDate = new Date(assignmentScheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      toast.error("الموعد المحدد غير صحيح");
      return;
    }

    setSavingAssignment(true);
    const subjectName = subjects.find((subject) => subject.id === assignmentSubjectId)?.name || "المادة";
    const teacherName = teachers.find((teacher) => teacher.user_id === assignmentTeacherId)?.full_name || "المعلم";
    let createdBookingId: string | null = null;
    try {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          student_id: assignmentStudentId,
          teacher_id: assignmentTeacherId,
          subject_id: assignmentSubjectId,
          scheduled_at: scheduledDate.toISOString(),
          duration_minutes: Number(assignmentDuration),
          status: "confirmed" as any,
          price: assignmentPrice.trim() ? Number(assignmentPrice) : null,
          notes: assignmentNotes.trim() || null,
        } as any)
        .select("id")
        .single();
      if (bookingError || !booking) throw bookingError || new Error("تعذر إنشاء الحصة");
      createdBookingId = booking.id;

      if (assignmentRequest) {
        const { error: requestError } = await supabase
          .from("booking_requests" as any)
          .update({
            status: "accepted",
            accepted_by: assignmentTeacherId,
            accepted_at: new Date().toISOString(),
          } as any)
          .eq("id", assignmentRequest.id);
        if (requestError) throw requestError;
      }

      const studentNotification = notificationTemplates.bookingConfirmed({
        teacherName,
        subjectName,
      });
      await supabase.from("notifications").insert([
        { user_id: assignmentStudentId, ...studentNotification },
        {
          user_id: assignmentTeacherId,
          title: "📌 تم تعيين حصة جديدة لك",
          body: `تم تعيين حصة ${subjectName} لك مع الطالب في ${dateTime(scheduledDate.toISOString())}. راجع جدولك للاطلاع على التفاصيل.`,
          type: "booking_confirmed",
        },
      ]);

      toast.success(assignmentRequest ? "تم تحويل الطلب إلى حصة وتعيين المعلم" : "تم إنشاء الحصة وتعيين المعلم مباشرة");
      setAssignmentOpen(false);
      setAssignmentRequest(null);
      setSelected(null);
      fetchRecords(true);
    } catch (error: any) {
      if (createdBookingId && assignmentRequest) {
        await supabase.from("bookings").delete().eq("id", createdBookingId);
      }
      toast.error(error?.message || "تعذر تعيين الحصة");
    } finally {
      setSavingAssignment(false);
    }
  };

  const exportData = filteredRecords.map((record) => ({
    النوع: record.source === "request" ? "طلب حجز" : "حجز",
    الطالب: record.student_name,
    المعلم: record.teacher_name,
    المادة: record.subject_name,
    الموعد: dateTime(record.scheduled_at),
    المدة: `${record.duration_minutes || 0} دقيقة`,
    السعر: money(record.price),
    الحالة: getMeta(record.status).label,
    "تاريخ الطلب": dateTime(record.created_at),
  }));

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/20">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground">مركز الحجوزات</h1>
              <p className="text-xs text-muted-foreground">متابعة الطلبات والحصص من لحظة الإرسال حتى الإكمال</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">تحديث لحظي مفعّل</span>
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => fetchRecords(true)} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button size="sm" className="gap-2 rounded-xl" onClick={() => openAssignment()}>
            <UserPlus className="h-3.5 w-3.5" /> تعيين حصة مباشرة
          </Button>
          <ExportCSVButton data={exportData} headers={Object.keys(exportData[0] || {}).map((key) => ({ key, label: key }))} filename="مركز-الحجوزات" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          { label: "إجمالي السجلات", value: counts.total, icon: Activity, tone: "text-slate-700 bg-slate-100" },
          { label: "طلبات مفتوحة", value: counts.open, icon: Zap, tone: "text-sky-700 bg-sky-100" },
          { label: "قيد الانتظار", value: counts.pending, icon: Clock3, tone: "text-amber-700 bg-amber-100" },
          { label: "مقبولة / مؤكدة", value: counts.confirmed, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-100" },
          { label: "مكتملة", value: counts.completed, icon: GraduationCap, tone: "text-violet-700 bg-violet-100" },
          { label: "مرفوضة", value: counts.rejected, icon: XCircle, tone: "text-rose-700 bg-rose-100" },
          { label: "غير مقبول", value: counts.expired, icon: Clock3, tone: "text-orange-700 bg-orange-100" },
          { label: "ملغاة", value: counts.cancelled, icon: XCircle, tone: "text-slate-600 bg-slate-100" },
        ].map((item) => (
          <Card key={item.label} className="border-0 shadow-sm">
            <CardContent className="flex items-center gap-2.5 p-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone}`}><item.icon className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold text-muted-foreground">{item.label}</p>
                <p className="text-xl font-black text-foreground">{item.value.toLocaleString("ar-SA")}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 bg-gradient-to-l from-[#f0f7ff] via-white to-[#effcf8] shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-black"><CalendarDays className="h-4 w-4 text-primary" /> الحالة اليومية للحصص والطلبات</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">ملخص كل ما هو مجدول في اليوم المختار، بما فيه الطلبات التي تحتاج تدخّل الأدمن.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input type="date" value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} className="h-9 w-[150px] rounded-xl bg-white text-xs" />
              <Button variant="outline" size="sm" className="h-9 rounded-xl bg-white text-xs" onClick={() => setDailyDate(localDateKey(new Date()))}>اليوم</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "إجمالي اليوم", value: dailyCounts.total, tone: "text-slate-700 bg-slate-100" },
            { label: "طلبات / تدخل", value: dailyCounts.open, tone: "text-orange-700 bg-orange-100" },
            { label: "قيد الانتظار", value: dailyCounts.pending, tone: "text-amber-700 bg-amber-100" },
            { label: "مؤكدة", value: dailyCounts.confirmed, tone: "text-emerald-700 bg-emerald-100" },
            { label: "مكتملة", value: dailyCounts.completed, tone: "text-violet-700 bg-violet-100" },
            { label: "مرفوضة", value: dailyCounts.rejected, tone: "text-rose-700 bg-rose-100" },
            { label: "ملغاة", value: dailyCounts.cancelled, tone: "text-slate-600 bg-slate-100" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/80 bg-white/80 p-3">
              <p className="text-[10px] font-semibold text-muted-foreground">{item.label}</p>
              <p className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-lg font-black ${item.tone}`}>{item.value.toLocaleString("ar-SA")}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-white pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-base font-black">سجل الطلبات والحجوزات</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">يعرض الطلبات المفتوحة والمرفوضة والمؤكدة وجميع حالات الحصص</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث باسم الطالب أو المعلم أو المادة..." className="h-9 rounded-xl border-border/70 pr-9 text-xs" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[150px] rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{FILTERS.map((filter) => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 w-[125px] rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="request">طلبات الحجز</SelectItem>
                  <SelectItem value="booking">الحجوزات</SelectItem>
                </SelectContent>
              </Select>
              <Input aria-label="من تاريخ الإنشاء" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-[135px] rounded-xl text-xs" />
              <Input aria-label="إلى تاريخ الإنشاء" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-[135px] rounded-xl text-xs" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-5 text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary"><Search className="h-7 w-7" /></div>
              <p className="font-bold text-foreground">لا توجد نتائج مطابقة</p>
              <p className="mt-1 text-xs text-muted-foreground">جرّب تغيير الحالة أو البحث أو نطاق التاريخ.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-right">
                <thead className="bg-slate-50/80 text-[11px] font-bold text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">الطالب / المعلم</th>
                    <th className="px-4 py-3">نوع الطلب</th>
                    <th className="px-4 py-3">الحصة</th>
                    <th className="px-4 py-3">الموعد</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-5 py-3 text-left">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredRecords.map((record) => (
                    <tr key={`${record.source}-${record.id}`} className="group transition-colors hover:bg-primary/[0.025]">
                      <td className="px-5 py-3.5">
                        <div className="flex min-w-[235px] items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/15 text-primary"><UsersRound className="h-4 w-4" /></div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-foreground">{record.student_name}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">مع {record.teacher_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className={`rounded-lg text-[10px] ${record.source === "request" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
                          {record.source === "request" ? "طلب حجز" : "حجز مؤكد"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-bold text-foreground">{record.subject_name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{record.duration_minutes || 0} دقيقة · {money(record.price)}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-foreground">{dateOnly(record.scheduled_at)}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{dateTime(record.scheduled_at).split("،").pop()}</p>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={record.status} /></td>
                      <td className="px-5 py-3.5 text-left">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs opacity-80 group-hover:opacity-100" onClick={() => setSelected(record)}>
                            <Eye className="h-3.5 w-3.5" /> التفاصيل
                          </Button>
                          {record.source === "request" && (record.status === "expired" || record.status === "open") && (
                            <Button size="sm" className="gap-1.5 rounded-xl bg-orange-600 text-xs hover:bg-orange-700" onClick={() => openAssignment(record)}>
                              <ArrowLeftRight className="h-3.5 w-3.5" /> تعيين
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/50 bg-slate-50/50 px-5 py-3 text-[11px] text-muted-foreground">
            <span>يظهر {filteredRecords.length.toLocaleString("ar-SA")} من أصل {records.length.toLocaleString("ar-SA")} سجل</span>
            <span>تتم المزامنة تلقائيًا عند إنشاء أو تحديث أي طلب</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-0 bg-[#f7f9fc] p-0 shadow-[0_30px_100px_-30px_rgba(15,31,61,0.45)] sm:rounded-[28px]" dir="rtl">
          {selected && (
            <>
              <DialogHeader className="relative overflow-hidden bg-gradient-to-l from-[#102b55] via-[#174477] to-[#167d72] px-6 pb-6 pt-6 text-white">
                <div className="absolute -left-12 -top-16 h-40 w-40 rounded-full bg-white/10" />
                <DialogTitle className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-white/60">{selected.source === "request" ? "تفاصيل طلب الحجز" : "تفاصيل الحجز"}</p>
                    <p className="text-lg font-black">{selected.student_name}</p>
                    <p className="mt-1 text-xs text-white/65">رقم العملية: {selected.id.slice(0, 12)}…</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <Card className="border-border/60 shadow-none"><CardContent className="p-4"><p className="mb-3 text-[11px] font-bold text-muted-foreground">بيانات الطالب</p><PersonPill icon={UserRound} name={selected.student_name} detail={selected.student_phone || `المعرّف: ${selected.student_id.slice(0, 12)}…`} /></CardContent></Card>
                  <Card className="border-border/60 shadow-none"><CardContent className="p-4"><p className="mb-3 text-[11px] font-bold text-muted-foreground">بيانات المعلم</p><PersonPill icon={GraduationCap} name={selected.teacher_name} detail={selected.teacher_phone || (selected.teacher_id ? `المعرّف: ${selected.teacher_id.slice(0, 12)}…` : "لم يتم قبول الطلب بعد")} muted={!selected.teacher_id} /></CardContent></Card>
                </div>

                <Card className="border-border/60 shadow-none">
                  <CardHeader className="border-b border-border/50 px-4 py-3"><CardTitle className="flex items-center gap-2 text-sm font-black"><FileText className="h-4 w-4 text-primary" /> تفاصيل الحصة</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm md:grid-cols-4">
                    <div><p className="text-[11px] text-muted-foreground">المادة</p><p className="mt-1 font-bold">{selected.subject_name}</p></div>
                    <div><p className="text-[11px] text-muted-foreground">الموعد</p><p className="mt-1 font-bold">{dateTime(selected.scheduled_at)}</p></div>
                    <div><p className="text-[11px] text-muted-foreground">المدة</p><p className="mt-1 font-bold">{selected.duration_minutes || 0} دقيقة</p></div>
                    <div><p className="text-[11px] text-muted-foreground">القيمة</p><p className="mt-1 font-bold text-secondary">{money(selected.price)}</p></div>
                    {selected.notes && <div className="col-span-2 border-t border-border/50 pt-3 md:col-span-4"><p className="text-[11px] text-muted-foreground">ملاحظات الطالب</p><p className="mt-1 whitespace-pre-wrap font-medium">{selected.notes}</p></div>}
                  </CardContent>
                </Card>

                <Card className="border-border/60 shadow-none">
                  <CardHeader className="border-b border-border/50 px-4 py-3"><CardTitle className="flex items-center gap-2 text-sm font-black"><Activity className="h-4 w-4 text-primary" /> التسلسل الزمني والحالة</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 p-4 text-xs md:grid-cols-3">
                    <div><p className="text-muted-foreground">وقت إرسال الطلب</p><p className="mt-1 font-bold">{dateTime(selected.created_at)}</p></div>
                    <div><p className="text-muted-foreground">آخر تحديث</p><p className="mt-1 font-bold">{dateTime(selected.updated_at)}</p></div>
                    <div><p className="text-muted-foreground">وقت القبول</p><p className="mt-1 font-bold">{dateTime(selected.accepted_at)}</p></div>
                    {selected.source === "request" && <div className="col-span-2 border-t border-border/50 pt-3 md:col-span-3"><p className="text-muted-foreground">آخر موعد لقبول الطلب</p><p className={`mt-1 font-bold ${selected.status === "expired" ? "text-orange-700" : "text-foreground"}`}>{dateTime(selected.expires_at)}{selected.status === "expired" && " · لم يقبله أي معلم"}</p></div>}
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 md:flex-row md:items-center">
                  <div className="flex-1"><p className="text-xs font-black text-amber-900">تحديث إداري للحالة</p><p className="mt-0.5 text-[11px] text-amber-800/70">يُسجل التغيير مباشرة ويظهر للطرفين حسب صلاحيات النظام.</p></div>
                  <div className="flex gap-2">
                    <Select value={nextStatus} onValueChange={setNextStatus}>
                      <SelectTrigger className="h-9 w-[150px] rounded-xl border-amber-200 bg-white text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{(selected.source === "request" ? REQUEST_UPDATE_STATUSES : BOOKING_UPDATE_STATUSES).map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" className="h-9 rounded-xl" onClick={updateStatus} disabled={savingStatus || nextStatus === selected.status}>
                      {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الحالة"}
                    </Button>
                  </div>
                </div>
                {selected.source === "request" && (selected.status === "expired" || selected.status === "open") && (
                  <Button className="w-full gap-2 rounded-xl bg-orange-600 hover:bg-orange-700" onClick={() => openAssignment(selected)}>
                    <ArrowLeftRight className="h-4 w-4" /> تعيين هذا الطلب لمعلم محدد
                  </Button>
                )}
                <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                  <button className="inline-flex items-center gap-1 hover:text-primary" onClick={() => navigator.clipboard?.writeText(selected.id).then(() => toast.success("تم نسخ رقم العملية"))}><Copy className="h-3 w-3" /> نسخ رقم العملية</button>
                  <span>المصدر: {selected.source === "request" ? "booking_requests" : "bookings"}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentOpen} onOpenChange={(open) => { if (!open && !savingAssignment) { setAssignmentOpen(false); setAssignmentRequest(null); } }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-[28px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <UserPlus className="h-5 w-5 text-primary" />
              {assignmentRequest ? "تحويل الطلب إلى حصة لمعلم محدد" : "تعيين حصة مباشرة"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {assignmentRequest
                ? "هذا استثناء إداري لطلب لم يقبله أي معلم. بعد الحفظ يصبح حجزًا مؤكدًا بين الطالب والمعلم المختار."
                : "أنشئ حجزًا مؤكدًا مباشرة بين طالب ومعلم، دون انتظار طلب قبول عام."}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>الطالب</Label>
                <Select value={assignmentStudentId} onValueChange={setAssignmentStudentId}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر الطالب" /></SelectTrigger>
                  <SelectContent>
                    {students.map((student) => <SelectItem key={student.user_id} value={student.user_id}>{student.full_name || "طالب بدون اسم"}{student.phone ? ` · ${student.phone}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>المعلم المعين</Label>
                <Select value={assignmentTeacherId} onValueChange={setAssignmentTeacherId}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر معلمًا معتمدًا" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => <SelectItem key={teacher.user_id} value={teacher.user_id}>{teacher.full_name || "معلم بدون اسم"}{teacher.phone ? ` · ${teacher.phone}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">القائمة تعرض المعلمين المعتمدين فقط.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>المادة</Label>
                <Select value={assignmentSubjectId} onValueChange={setAssignmentSubjectId}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر المادة" /></SelectTrigger>
                  <SelectContent>{subjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>موعد الحصة</Label>
                <Input type="datetime-local" value={assignmentScheduledAt} onChange={(event) => setAssignmentScheduledAt(event.target.value)} className="rounded-xl" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>مدة الحصة</Label>
                <Select value={assignmentDuration} onValueChange={setAssignmentDuration}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 دقيقة</SelectItem>
                    <SelectItem value="45">45 دقيقة</SelectItem>
                    <SelectItem value="60">60 دقيقة</SelectItem>
                    <SelectItem value="90">90 دقيقة</SelectItem>
                    <SelectItem value="120">120 دقيقة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>القيمة (اختياري)</Label>
                <Input type="number" min="0" value={assignmentPrice} onChange={(event) => setAssignmentPrice(event.target.value)} placeholder="مثال: 80" className="rounded-xl" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>ملاحظة الحصة (اختياري)</Label>
              <Textarea value={assignmentNotes} onChange={(event) => setAssignmentNotes(event.target.value)} placeholder="سبب التعيين أو أي ملاحظات تظهر في تفاصيل الحصة..." className="min-h-[80px] rounded-xl" />
            </div>

            {assignmentStudentId && assignmentTeacherId && assignmentSubjectId && assignmentScheduledAt && (
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 text-xs">
                <p className="font-black text-primary">معاينة قبل التعيين</p>
                <p className="mt-1 text-foreground">
                  {students.find((student) => student.user_id === assignmentStudentId)?.full_name || "الطالب"} مع{" "}
                  {teachers.find((teacher) => teacher.user_id === assignmentTeacherId)?.full_name || "المعلم"} ·{" "}
                  {subjects.find((subject) => subject.id === assignmentSubjectId)?.name || "المادة"} ·{" "}
                  {dateTime(new Date(assignmentScheduledAt).toISOString())} · {assignmentDuration} دقيقة
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="rounded-xl" onClick={() => { setAssignmentOpen(false); setAssignmentRequest(null); }} disabled={savingAssignment}>إلغاء</Button>
              <Button className="gap-2 rounded-xl" onClick={assignBookingDirectly} disabled={savingAssignment}>
                {savingAssignment ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                {assignmentRequest ? "تحويل وتعيين الحصة" : "إنشاء الحصة وتعيينها"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}