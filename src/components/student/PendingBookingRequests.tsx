import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import CountdownTimer from "@/components/CountdownTimer";

interface PendingRequest {
  id: string;
  subject_id: string;
  scheduled_at: string;
  status: string;
  expires_at: string;
  subject_name?: string;
}

export default function PendingBookingRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);

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

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchRequests = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("booking_requests" as any)
      .select("*")
      .eq("student_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) { setRequests([]); return; }

    // Filter expired
    const now = Date.now();
    const valid = (data as any[]).filter((r: any) => {
      if (!r.expires_at) return true;
      return new Date(r.expires_at).getTime() > now;
    });

    if (valid.length === 0) { setRequests([]); return; }

    const subjectIds = [...new Set(valid.map((r: any) => r.subject_id).filter(Boolean))];
    const { data: subjects } = subjectIds.length > 0
      ? await supabase.from("subjects").select("id, name").in("id", subjectIds)
      : { data: [] };
    const subjectMap = new Map((subjects ?? []).map(s => [s.id, s.name]));

    setRequests(valid.map((r: any) => ({
      ...r,
      subject_name: subjectMap.get(r.subject_id) || "مادة",
    })));
  };

  const handleExpire = (id: string) => {
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  if (requests.length === 0) return null;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          طلبات حصص قيد الانتظار
          <Badge className="mr-auto bg-orange-500/10 text-orange-600 border-0 text-xs">{requests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
                <p className="text-xs text-muted-foreground mt-0.5">⏳ في انتظار قبول معلم</p>
              </div>
            </div>
            {r.expires_at && (
              <CountdownTimer expiresAt={r.expires_at} onExpire={() => handleExpire(r.id)} />
            )}
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
