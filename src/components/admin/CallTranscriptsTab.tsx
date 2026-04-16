import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, AlertTriangle, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TranscriptRow {
  id: string;
  call_log_id: string | null;
  twilio_call_sid: string;
  speaker: string;
  text: string;
  is_violation: boolean;
  violation_type: string | null;
  created_at: string;
}

interface GroupedCall {
  callSid: string;
  callLogId: string | null;
  startedAt: string;
  transcripts: TranscriptRow[];
  violationCount: number;
}

const CallTranscriptsTab = () => {
  const [calls, setCalls] = useState<GroupedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<string | null>(null);

  useEffect(() => {
    loadTranscripts();
    const channel = supabase
      .channel("call-transcripts-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_transcripts" }, () => loadTranscripts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadTranscripts = async () => {
    const { data, error } = await supabase
      .from("call_transcripts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { console.error(error); setLoading(false); return; }

    const groups = new Map<string, GroupedCall>();
    for (const row of (data as TranscriptRow[]) || []) {
      const g = groups.get(row.twilio_call_sid) || {
        callSid: row.twilio_call_sid,
        callLogId: row.call_log_id,
        startedAt: row.created_at,
        transcripts: [],
        violationCount: 0,
      };
      g.transcripts.push(row);
      if (row.is_violation) g.violationCount++;
      if (new Date(row.created_at) < new Date(g.startedAt)) g.startedAt = row.created_at;
      groups.set(row.twilio_call_sid, g);
    }
    // Sort transcripts inside each group chronologically
    const arr = Array.from(groups.values()).map(g => ({
      ...g,
      transcripts: g.transcripts.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    }));
    arr.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
    setCalls(arr);
    setLoading(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          تفريغ المكالمات الهاتفية
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          تفريغ نصي لحظي لكل مكالمة بين المعلم والطالب — مع رصد تلقائي لمحاولات تبادل بيانات شخصية.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : calls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Phone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            لا توجد تفريغات مكالمات بعد.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-2">
            <ScrollArea className="h-[70vh]">
              {calls.map(call => (
                <Card
                  key={call.callSid}
                  className={`cursor-pointer mb-2 transition-all ${selectedCall === call.callSid ? "ring-2 ring-primary" : "hover:bg-accent/40"}`}
                  onClick={() => setSelectedCall(call.callSid)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs">
                        <p className="font-mono text-[10px] text-muted-foreground truncate" title={call.callSid}>
                          {call.callSid.slice(0, 18)}...
                        </p>
                        <p className="mt-1">{new Date(call.startedAt).toLocaleString("ar-SA")}</p>
                        <p className="text-muted-foreground mt-0.5">{call.transcripts.length} مقطع</p>
                      </div>
                      {call.violationCount > 0 && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <AlertTriangle className="h-3 w-3" />
                          {call.violationCount}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </ScrollArea>
          </div>

          <div className="lg:col-span-2">
            {selectedCall ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>تفريغ المكالمة</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{selectedCall}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] pr-3">
                    <div className="space-y-2">
                      {calls.find(c => c.callSid === selectedCall)?.transcripts.map(t => (
                        <div
                          key={t.id}
                          className={`p-3 rounded-lg border ${t.is_violation ? "bg-destructive/10 border-destructive/40" : "bg-muted/40 border-border"}`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span>{new Date(t.created_at).toLocaleTimeString("ar-SA")}</span>
                            {t.is_violation && (
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <AlertTriangle className="h-3 w-3" />
                                {t.violation_type || "مخالفة"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm leading-relaxed">{t.text}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-20 text-center text-muted-foreground">
                  اختر مكالمة لعرض تفريغها
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallTranscriptsTab;
