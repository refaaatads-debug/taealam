import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, BookOpen, X } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import CountdownTimer from "@/components/CountdownTimer";
import { toast } from "sonner";
import { arabicBookingError } from "@/lib/arabicBookingError";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PendingRequest {
  id: string;
  mode: "online";
  subject_id: string;
  scheduled_at: string;
  status: string;
  expires_at: string | null;
  subject_name?: string;
}

export default function PendingBookingRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [requestsError, setRequestsError] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    fetchRequests();

    const channel = supabase
      .channel("student-pending-requests")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "booking_requests",
        filter: `student_id=eq.${user.id}`,
      }, () => {
        fetchRequests();
      })
      .subscribe();
    const refreshInterval = window.setInterval(fetchRequests, 15_000);

    return () => {
      window.clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchRequests = async () => {
    if (!user) return;

    const { data: onlineData, error: onlineError } = await supabase
      .from("booking_requests" as any)
      .select("*")
      .eq("student_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    setRequestsError(Boolean(onlineError));

    const now = Date.now();
    const valid = ((onlineData || []) as any[]).filter((r: any) => {
      if (!r.expires_at) return true;
      return new Date(r.expires_at).getTime() > now;
    }).map((r: any) => ({ ...r, mode: "online" as const }));
    if (valid.length === 0) { setRequests([]); return; }

    const subjectIds = [...new Set(valid.map((r: any) => r.subject_id).filter(Boolean))];
    const { data: subjects } = subjectIds.length > 0
      ? await supabase.from("subjects").select("id, name").in("id", subjectIds)
      : { data: [] };
    const subjectMap = new Map((subjects ?? []).map(s => [s.id, s.name]));

    setRequests(valid.map((r: any) => ({
      ...r,
      subject_name: subjectMap.get(r.subject_id) || "مادة",
    })).sort((a, b) => new Date(a.expires_at || a.scheduled_at).getTime() - new Date(b.expires_at || b.scheduled_at).getTime()));
  };

  const handleExpire = async (request: PendingRequest) => {
    setRequests(prev => prev.filter(r => r.id !== request.id));
    // Keep the database state aligned with what the student sees. The request
    // disappears from the active list, but remains in Admin history as a
    // request that no teacher accepted before the deadline.
    await supabase
      .from("booking_requests" as any)
      .update({ status: "expired" } as any)
      .eq("id", request.id)
      .eq("student_id", user?.id)
      .eq("status", "open");
  };

  const handleCancel = async (request: PendingRequest) => {
    setCancellingId(request.id);
    try {
      const { error } = await supabase
        .from("booking_requests" as any)
        .update({ status: "cancelled" } as any)
        .eq("id", request.id)
        .eq("student_id", user?.id);
      if (error) throw error;
      setRequests(prev => prev.filter(r => r.id !== request.id));
      toast.success("تم إلغاء الطلب بنجاح");
    } catch (error) {
      toast.error(arabicBookingError(error, "تعذر إلغاء الطلب. حاول مرة أخرى."));
    } finally {
      setCancellingId(null);
    }
  };

  if (requests.length === 0 && !requestsError) return null;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          طلبات حصص الأونلاين قيد الانتظار
          <Badge className="mr-auto bg-orange-500/10 text-orange-600 border-0 text-xs">{requests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requestsError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            تعذر تحديث طلبات الأونلاين. أعد المحاولة.
            <Button size="sm" variant="outline" onClick={() => void fetchRequests()}>إعادة المحاولة</Button>
          </div>
        )}
        {requests.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-4 rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center border">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">{r.subject_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.scheduled_at).toLocaleDateString("ar-SA")} • {new Date(r.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                </p>
                  <p className="text-xs text-muted-foreground mt-0.5">⏳ بانتظار قبول معلم</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {r.expires_at && (
                <CountdownTimer expiresAt={r.expires_at} onExpire={() => void handleExpire(r)} />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                disabled={cancellingId === r.id}
                onClick={() => setConfirmCancelId(r.id)}
                title="إلغاء الطلب"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </CardContent>

      <AlertDialog open={!!confirmCancelId} onOpenChange={(open) => !open && setConfirmCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">إلغاء الطلب</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const request = requests.find((item) => item.id === confirmCancelId);
                if (request) void handleCancel(request);
                setConfirmCancelId(null);
              }}
            >
              نعم، إلغاء الطلب
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
