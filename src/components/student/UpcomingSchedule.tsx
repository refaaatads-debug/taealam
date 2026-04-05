import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Video, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  upcomingClasses: any[];
}

export default function UpcomingSchedule({ upcomingClasses }: Props) {
  if (upcomingClasses.length === 0) return null;

  // Group by date
  const grouped = upcomingClasses.reduce<Record<string, any[]>>((acc, c) => {
    const dateKey = new Date(c.scheduled_at).toLocaleDateString("ar-SA");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(c);
    return acc;
  }, {});

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          جدول الحصص القادمة
          <Badge className="mr-auto bg-primary/10 text-primary border-0 text-xs">{upcomingClasses.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-right py-2 px-3 font-semibold">التاريخ</th>
                <th className="text-right py-2 px-3 font-semibold">الوقت</th>
                <th className="text-right py-2 px-3 font-semibold">المادة</th>
                <th className="text-right py-2 px-3 font-semibold">المعلم</th>
                <th className="text-right py-2 px-3 font-semibold">الحالة</th>
                <th className="text-right py-2 px-3 font-semibold">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {upcomingClasses.map((c: any) => {
                const isToday = new Date(c.scheduled_at).toDateString() === new Date().toDateString();
                const time = new Date(c.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                const date = new Date(c.scheduled_at).toLocaleDateString("ar-SA", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <tr key={c.id} className={`border-b last:border-0 ${isToday ? "bg-accent/50" : ""}`}>
                    <td className="py-3 px-3 font-medium">{isToday ? "اليوم" : date}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {time}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold">{c.subjects?.name || "حصة"}</td>
                    <td className="py-3 px-3">{c.teacher_name || "معلم"}</td>
                    <td className="py-3 px-3">
                      {c.status === "confirmed" ? (
                        <Badge className="bg-secondary/10 text-secondary border-0 text-[10px]">مؤكدة ✓</Badge>
                      ) : (
                        <Badge className="bg-orange-500/10 text-orange-600 border-0 text-[10px]">قيد الانتظار</Badge>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        {isToday && c.status === "confirmed" && (
                          <Button size="sm" className="gradient-cta text-secondary-foreground rounded-lg h-7 text-xs" asChild>
                            <Link to={`/session?booking=${c.id}`}><Video className="h-3 w-3 ml-1" />انضم</Link>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="rounded-lg h-7 text-xs" asChild>
                          <Link to={`/chat?booking=${c.id}`}><MessageSquare className="h-3 w-3" /></Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
