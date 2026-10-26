import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PendingBookingRequests from "@/components/student/PendingBookingRequests";
import InPersonRequestTracking from "@/components/student/InPersonRequestTracking";

export default function StudentLessonRequests() {
  return (
    <Card id="student-lesson-requests" className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold">طلبات الحصص</CardTitle>
        <p className="text-xs text-muted-foreground">طلبات الأونلاين والحضوري في مكان واحد.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <PendingBookingRequests embedded />
        <InPersonRequestTracking embedded />
      </CardContent>
    </Card>
  );
}
