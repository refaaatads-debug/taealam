import { useCallback, useEffect, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { arabicBookingError } from "@/lib/arabicBookingError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RequestRow = {
  request_group_id: string;
  subject_name: string | null;
  scheduled_at: string;
  status: string;
  acceptance_deadline: string;
  booking_id: string | null;
  attendance_confirmed_at: string | null;
};

const statusLabel = (status: string) => {
  if (status === "open") return "بانتظار رد المعلمين";
  if (status === "accepted") return "قُبل الطلب — الحصة في الجدول";
  if (status === "expired") return "انتهت المهلة أو اعتذر المعلمون";
  if (status === "cancelled") return "أُلغي الطلب";
  if (status === "rejected") return "رُفض الطلب";
  return status;
};

export default function InPersonRequestTracking({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("list_my_in_person_request_groups" as any);
    setLoadError(Boolean(error));
    if (!error) setRows((data || []) as RequestRow[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refresh();
    const interval = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 15_000);
    const channel = supabase
      .channel("student-in-person-request-tracking")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "in_person_request_groups",
        filter: `student_id=eq.${user.id}`,
      }, () => void refresh())
      .subscribe();
    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const cancel = async (row: RequestRow) => {
    setBusyId(row.request_group_id);
    const { error } = row.booking_id
      ? await supabase.rpc("cancel_in_person_booking" as any, {
          p_booking_id: row.booking_id,
          p_reason: "student_cancelled",
        })
      : await supabase.rpc("cancel_in_person_request_group" as any, {
          p_request_group_id: row.request_group_id,
        });
    setBusyId(null);
    if (error) {
      toast.error(arabicBookingError(error, "تعذر إلغاء الطلب الحضوري."));
      return;
    }
    toast.success("تم إلغاء الطلب وتحديث الرصيد حسب السياسة");
    await refresh();
  };

  if (!user) return null;

  // Accepted bookings are presented in the schedule/history table below so the
  // same lesson is not listed twice.
  const trackingRows = rows.filter((row) => row.status !== "accepted");
  const visibleRows = trackingRows.slice(0, 20);
  if (trackingRows.length === 0 && !loadError && !embedded) return null;
  const Root = embedded ? "section" : Card;
  const Header = embedded ? "div" : CardHeader;
  const Content = embedded ? "div" : CardContent;
  return (
    <Root id="in-person-requests" className={embedded ? "space-y-3" : "border-0 shadow-card"}>
      <Header className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <MapPin className="h-5 w-5 text-amber-600" />
          {embedded ? "طلبات الحضوري" : "متابعة الطلبات الحضورية"}
          <Badge variant="outline" className="mr-auto">{trackingRows.length}</Badge>
        </CardTitle>
        {!embedded && <p className="text-xs text-muted-foreground">تظهر الطلبات المقبولة كحجوزات في الجدول أدناه لتجنب تكرار الحصة.</p>}
      </Header>
      <Content className="space-y-3">
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
            تعذر تحديث الطلبات الحضورية.
            <Button size="sm" variant="outline" onClick={() => void refresh()}>إعادة المحاولة</Button>
          </div>
        )}
        {!loadError && trackingRows.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد طلبات حضورية حالية أو سابقة.</p>
        )}
        {visibleRows.map((row) => {
          const deadlineMs = new Date(row.acceptance_deadline).getTime();
          const minutesLeft = Math.max(0, Math.ceil((deadlineMs - now) / 60_000));
          const canCancel = ["open", "accepted"].includes(row.status) && !row.attendance_confirmed_at;
          return (
            <div key={row.request_group_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{row.subject_name || "حصة حضورية"}</strong>
                  <Badge variant={row.status === "open" ? "secondary" : "outline"}>{statusLabel(row.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(row.scheduled_at).toLocaleString("ar-SA")}
                </p>
                {row.status === "open" && Number.isFinite(deadlineMs) && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <Clock className="h-3 w-3" />
                    {minutesLeft > 0 ? `مهلة القبول: ${minutesLeft} دقيقة` : "انتهت مهلة القبول، جارٍ تحديث الحالة"}
                  </p>
                )}
                {row.attendance_confirmed_at && (
                  <p className="mt-1 text-xs text-green-700">تم تأكيد الحضور؛ الحصة تظهر في الجدول.</p>
                )}
              </div>
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.request_group_id}
                  onClick={() => void cancel(row)}
                >
                  {busyId === row.request_group_id ? "جارٍ الإلغاء..." : "إلغاء الطلب"}
                </Button>
              )}
            </div>
          );
        })}
        {trackingRows.length > visibleRows.length && (
          <p className="text-center text-xs text-muted-foreground">تُعرض أحدث {visibleRows.length} طلبًا من أصل {trackingRows.length}.</p>
        )}
      </Content>
    </Root>
  );
}
