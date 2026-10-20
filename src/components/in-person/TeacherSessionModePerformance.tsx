import { MapPin, Monitor, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TeacherSessionModePerformanceProps {
  onlineCompletedCount: number;
  inPersonCompletedCount: number;
  teachingMinutes: number;
  packageCreditMinutes: number;
  className?: string;
}

const TeacherSessionModePerformance = ({
  onlineCompletedCount,
  inPersonCompletedCount,
  teachingMinutes,
  packageCreditMinutes,
  className = "",
}: TeacherSessionModePerformanceProps) => (
  <Card dir="rtl" className={`border-0 shadow-card ${className}`} data-testid="teacher-session-mode-performance">
    <CardHeader className="pb-4">
      <CardTitle className="flex items-center gap-2 text-base">
        <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
        أداء الحصص
      </CardTitle>
      <p className="text-xs text-muted-foreground">الحصص المكتملة حسب طريقة التقديم</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3" data-testid="online-completed-count">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Monitor className="h-4 w-4 text-primary" aria-hidden="true" />
            عن بُعد
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-foreground">{onlineCompletedCount}</p>
          <p className="text-xs text-muted-foreground">حصة مكتملة</p>
        </div>
        <div className="rounded-xl border border-secondary/20 bg-secondary/[0.04] p-3" data-testid="in-person-completed-count">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-4 w-4 text-secondary" aria-hidden="true" />
            حضوري
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-foreground">{inPersonCompletedCount}</p>
          <p className="text-xs text-muted-foreground">حصة مكتملة</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 px-4 py-3" data-testid="session-minutes-breakdown">
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm text-muted-foreground">دقائق التدريس</span>
          <span className="font-bold tabular-nums text-foreground" data-testid="teaching-minutes">{teachingMinutes} دقيقة</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 py-1.5">
          <span className="text-sm text-muted-foreground">دقائق رصيد الباقة</span>
          <span className="font-bold tabular-nums text-foreground" data-testid="package-credit-minutes">{packageCreditMinutes} دقيقة</span>
        </div>
        <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-relaxed text-muted-foreground">
          دقائق التدريس ودقائق رصيد الباقة قيمتان منفصلتان.
        </p>
      </div>
    </CardContent>
  </Card>
);

export default TeacherSessionModePerformance;
