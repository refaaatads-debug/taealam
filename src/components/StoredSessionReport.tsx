import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { parseStoredReport } from "@/lib/storedSessionReport";

interface Props {
  aiReport: string | null;
  showViolations?: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-xl p-2.5 text-center">
      <p className="text-lg font-black text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// Report under a recorded session: measured values only, or "not enough data".
export default function StoredSessionReport({ aiReport, showViolations = false }: Props) {
  const view = parseStoredReport(aiReport);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-foreground">تقرير الحصة</span>
      </div>
      {view.status === "insufficient" ? (
        <div className="text-center py-4 bg-muted/30 rounded-xl">
          <p className="text-sm text-muted-foreground">لا توجد بيانات كافية</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {view.durationMinutes !== undefined && <Stat label="دقيقة" value={String(view.durationMinutes)} />}
            {view.teacherSpeakingMinutes !== undefined && <Stat label="كلام المعلم" value={`${view.teacherSpeakingMinutes}د`} />}
            {view.studentSpeakingMinutes !== undefined && <Stat label="كلام الطالب" value={`${view.studentSpeakingMinutes}د`} />}
            {view.silenceMinutes !== undefined && <Stat label="صمت" value={`${view.silenceMinutes}د`} />}
            {view.messages !== undefined && <Stat label="رسالة" value={String(view.messages)} />}
            {view.questions !== undefined && <Stat label="سؤال" value={String(view.questions)} />}
            {showViolations && view.violations !== undefined && <Stat label="مخالفة" value={String(view.violations)} />}
          </div>
          {view.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {view.topics.map((t, i) => <Badge key={i} variant="outline" className="text-xs">{t}</Badge>)}
            </div>
          )}
          {view.summary && (
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-accent/30 rounded-2xl p-3">{view.summary}</div>
          )}
        </div>
      )}
    </div>
  );
}
