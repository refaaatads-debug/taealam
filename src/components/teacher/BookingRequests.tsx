import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CheckCircle, Users, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface BookingRequest {
  id: string;
  student_id: string;
  subject_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  student_name?: string;
  subject_name?: string;
}

export default function BookingRequests() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchRequests();

    // Realtime subscription for new requests
    const channel = supabase
      .channel("teacher-booking-requests")
      .on("postgres_changes", {
        event: "*",
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
    
    // Get open requests (RLS will filter to teacher's subjects)
    const { data } = await supabase
      .from("booking_requests" as any)
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) { setRequests([]); return; }

    // Enrich with student names and subject names
    const studentIds = [...new Set((data as any[]).map((r: any) => r.student_id))];
    const subjectIds = [...new Set((data as any[]).map((r: any) => r.subject_id).filter(Boolean))];

    const [{ data: profiles }, { data: subjects }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds),
      subjectIds.length > 0 ? supabase.from("subjects").select("id, name").in("id", subjectIds) : { data: [] },
    ]);

    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
    const subjectMap = new Map((subjects ?? []).map(s => [s.id, s.name]));

    setRequests((data as any[]).map((r: any) => ({
      ...r,
      student_name: profileMap.get(r.student_id) || "طالب",
      subject_name: subjectMap.get(r.subject_id) || "مادة",
    })));
  };

  const handleAccept = async (request: BookingRequest) => {
    if (!user) return;
    setAccepting(request.id);
    try {
      // Update request status to accepted
      const { error: updateError } = await supabase
        .from("booking_requests" as any)
        .update({
          status: "accepted",
          accepted_by: user.id,
          accepted_at: new Date().toISOString(),
        } as any)
        .eq("id", request.id)
        .eq("status", "open"); // Ensure it's still open (first-come-first-served)

      if (updateError) throw updateError;

      // Create actual booking
      const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
        student_id: request.student_id,
        teacher_id: user.id,
        subject_id: request.subject_id,
        scheduled_at: request.scheduled_at,
        duration_minutes: request.duration_minutes,
        status: "confirmed",
      }).select("id").single();

      if (bookingError) throw bookingError;

      // Notify student
      await supabase.from("notifications").insert({
        user_id: request.student_id,
        title: "تم قبول طلبك! ✅",
        body: `قبل المعلم ${profile?.full_name || "معلم"} طلب حصتك في ${request.subject_name}. جهّز نفسك!`,
        type: "booking",
      });

      // Send welcome chat message
      await supabase.from("chat_messages").insert({
        booking_id: booking.id,
        sender_id: user.id,
        content: `مرحباً! أنا ${profile?.full_name || "معلمك"} وقبلت طلب حصتك 🎉 لا تتردد في أي استفسار قبل الحصة!`,
      });

      // Create Zoom meeting automatically
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
      if (e.message?.includes("0 rows")) {
        toast.info("تم قبول هذا الطلب من معلم آخر بالفعل");
      } else {
        toast.error(e.message || "حدث خطأ");
      }
      fetchRequests();
    } finally {
      setAccepting(null);
    }
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarCheck className="h-4 w-4 text-primary" />
          </div>
          طلبات الحصص المتاحة
          {requests.length > 0 && <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">{requests.length} جديد</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد طلبات حصص جديدة</p>
        ) : (
          requests.map((r) => (
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
                </div>
              </div>
              <Button 
                size="sm" 
                className="gradient-cta text-secondary-foreground rounded-xl shadow-button gap-1.5" 
                onClick={() => handleAccept(r)}
                disabled={accepting === r.id}
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
