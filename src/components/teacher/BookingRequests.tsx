import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CheckCircle, Users, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import CountdownTimer from "@/components/CountdownTimer";

interface BookingRequest {
  id: string;
  student_id: string;
  subject_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  expires_at: string;
  student_name?: string;
  subject_name?: string;
}

export default function BookingRequests() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());
  const { play: playSound } = useNotificationSound();
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    fetchRequests();

    const channel = supabase
      .channel("teacher-booking-requests")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "booking_requests",
      }, () => {
        playSound("booking");
        fetchRequests();
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "booking_requests",
      }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchRequests = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("booking_requests" as any)
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) { setRequests([]); return; }

    const now = Date.now();
    const validData = (data as any[]).filter((r: any) => {
      if (!r.expires_at) return true;
      return new Date(r.expires_at).getTime() > now;
    });

    if (validData.length === 0) { setRequests([]); return; }

    const studentIds = [...new Set(validData.map((r: any) => r.student_id))];
    const subjectIds = [...new Set(validData.map((r: any) => r.subject_id).filter(Boolean))];

    const [{ data: profiles }, { data: subjects }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds),
      subjectIds.length > 0 ? supabase.from("subjects").select("id, name").in("id", subjectIds) : { data: [] },
    ]);

    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
    const subjectMap = new Map((subjects ?? []).map(s => [s.id, s.name]));

    setRequests(validData.map((r: any) => ({
      ...r,
      student_name: profileMap.get(r.student_id) || "طالب",
      subject_name: subjectMap.get(r.subject_id) || "مادة",
    })));
  };

  const handleExpire = useCallback((id: string) => {
    setExpiredIds(prev => new Set(prev).add(id));
  }, []);

  const handleAccept = async (request: BookingRequest) => {
    if (!user) return;
    if (request.expires_at && new Date(request.expires_at).getTime() <= Date.now()) {
      toast.info("انتهت صلاحية هذا الطلب");
      fetchRequests();
      return;
    }

    // Check for time overlap with existing confirmed bookings (not just any active booking)
    const requestStart = new Date(request.scheduled_at).getTime();
    const requestEnd = requestStart + (request.duration_minutes || 45) * 60 * 1000;

    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("id, scheduled_at, duration_minutes")
      .eq("teacher_id", user.id)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", new Date(requestStart - 24 * 60 * 60 * 1000).toISOString())
      .lte("scheduled_at", new Date(requestEnd + 24 * 60 * 60 * 1000).toISOString());

    if (existingBookings && existingBookings.length > 0) {
      const hasOverlap = existingBookings.some(b => {
        const bStart = new Date(b.scheduled_at).getTime();
        const bEnd = bStart + (b.duration_minutes || 45) * 60 * 1000;
        return requestStart < bEnd && requestEnd > bStart;
      });

      if (hasOverlap) {
        toast.error("لديك حصة محجوزة في نفس الوقت. اختر وقتاً مختلفاً.");
        // إرسال إشعار للطالب بأن المعلم غير متاح
        await supabase.from("notifications").insert({
          user_id: request.student_id,
          title: "المعلم غير متاح ⏰",
          body: `المعلم ${profile?.full_name || "المعلم"} لديه حصة أخرى في نفس الوقت (${new Date(request.scheduled_at).toLocaleDateString("ar-SA")} - ${new Date(request.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}). سيتم عرض طلبك لمعلمين آخرين.`,
          type: "booking",
        });
        return;
      }
    }

    setAccepting(request.id);
    try {
      // Atomic acceptance - prevents double-acceptance by multiple teachers
      const { data: accepted, error: rpcError } = await supabase.rpc(
        "accept_booking_request" as any,
        { _request_id: request.id, _teacher_id: user.id }
      );

      if (rpcError) throw rpcError;
      if (!accepted) {
        toast.info("تم قبول هذا الطلب من معلم آخر بالفعل");
        fetchRequests();
        setAccepting(null);
        return;
      }

      // Link booking to student's active subscription (deduction happens after session completion)
      const { data: activeSub } = await supabase
        .from("user_subscriptions")
        .select("id, sessions_remaining")
        .eq("user_id", request.student_id)
        .eq("is_active", true)
        .gt("sessions_remaining", 0)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
        student_id: request.student_id,
        teacher_id: user.id,
        subject_id: request.subject_id,
        scheduled_at: request.scheduled_at,
        duration_minutes: request.duration_minutes,
        status: "confirmed",
        used_subscription: !!activeSub,
        subscription_id: activeSub?.id || null,
      }).select("id").single();

      if (bookingError) throw bookingError;

      await supabase.from("notifications").insert({
        user_id: request.student_id,
        title: "تم قبول طلبك! ✅",
        body: `قبل المعلم ${profile?.full_name || "معلم"} طلب حصتك في ${request.subject_name}. جهّز نفسك!`,
        type: "booking",
      });

      await supabase.from("chat_messages").insert({
        booking_id: booking.id,
        sender_id: user.id,
        content: `مرحباً! أنا ${profile?.full_name || "معلمك"} وقبلت طلب حصتك 🎉 لا تتردد في أي استفسار قبل الحصة!`,
      });

      try {
        await supabase.functions.invoke("create-zoom-meeting", {
          body: { booking_id: booking.id },
        });
      } catch {
        console.log("Zoom meeting will be created when session starts");
      }

      toast.success("تم قبول الطلب وإنشاء الحجز بنجاح! 🎉");
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
      fetchRequests();
    } finally {
      setAccepting(null);
    }
  };

  const activeRequests = requests.filter(r => !expiredIds.has(r.id));

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarCheck className="h-4 w-4 text-primary" />
          </div>
          طلبات الحصص المتاحة
          {activeRequests.length > 0 && <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">{activeRequests.length} جديد</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد طلبات حصص جديدة</p>
        ) : (
          activeRequests.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center border">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">{r.student_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.subject_name} • {new Date(r.scheduled_at).toLocaleDateString("ar-SA")} • {new Date(r.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.duration_minutes} دقيقة</p>
                  {r.expires_at && (
                    <div className="mt-1.5">
                      <CountdownTimer expiresAt={r.expires_at} onExpire={() => handleExpire(r.id)} showLabel />
                    </div>
                  )}
                </div>
              </div>
              <Button 
                size="sm" 
                className="gradient-cta text-secondary-foreground rounded-xl shadow-button gap-1.5" 
                onClick={() => handleAccept(r)}
                disabled={accepting === r.id || expiredIds.has(r.id)}
              >
                {accepting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                اقبل الطلب
              </Button>
            </motion.div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
