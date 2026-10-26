import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import InPersonTeacherPanel from "@/components/inPerson/TeacherPanel";
import BookingRequests from "@/components/teacher/BookingRequests";

interface TeacherLessonRequestsProps {
  onAccepted?: () => void;
}

export default function TeacherLessonRequests({ onAccepted }: TeacherLessonRequestsProps) {
  return (
    <Card id="booking-requests" className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold">طلبات الحصص</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">طلبات الأونلاين والحضوري في مكان واحد.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <BookingRequests embedded onAccepted={onAccepted} />
        <InPersonTeacherPanel embedded />
      </CardContent>
    </Card>
  );
}
