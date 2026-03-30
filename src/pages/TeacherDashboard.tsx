import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, DollarSign, Users, TrendingUp, Clock, CheckCircle, XCircle } from "lucide-react";

const requests = [
  { student: "أحمد محمد", subject: "رياضيات", date: "الأحد 4:00 م", status: "pending" },
  { student: "سارة علي", subject: "رياضيات", date: "الاثنين 6:00 م", status: "pending" },
  { student: "خالد سعود", subject: "رياضيات", date: "الثلاثاء 5:00 م", status: "accepted" },
];

const schedule = [
  { time: "4:00 م", student: "خالد سعود", subject: "جبر", duration: "60 دقيقة" },
  { time: "6:00 م", student: "منى أحمد", subject: "هندسة", duration: "45 دقيقة" },
];

const TeacherDashboard = () => (
  <div className="min-h-screen bg-muted/30">
    <Navbar />
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">مرحباً، أ. سارة 👋</h1>
        <p className="text-muted-foreground">لديك 2 حصة اليوم</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: DollarSign, label: "أرباح الشهر", value: "4,200 ر.س", color: "text-secondary" },
          { icon: Users, label: "عدد الطلاب", value: "32", color: "text-primary" },
          { icon: CalendarCheck, label: "حصص هذا الشهر", value: "28", color: "text-accent-foreground" },
          { icon: TrendingUp, label: "التقييم", value: "4.9", color: "text-yellow-500" },
        ].map((s, i) => (
          <Card key={i} className="border-0 shadow-card">
            <CardContent className="p-5">
              <s.icon className={`h-6 w-6 ${s.color} mb-2`} />
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedule */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-secondary" />
              جدول اليوم
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {schedule.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-accent/50">
                <div>
                  <p className="font-semibold text-sm text-foreground">{s.student} - {s.subject}</p>
                  <p className="text-xs text-muted-foreground">{s.time} • {s.duration}</p>
                </div>
                <Button size="sm" className="gradient-cta text-secondary-foreground">ابدأ الحصة</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Requests */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">طلبات الحجز</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm text-foreground">{r.student}</p>
                  <p className="text-xs text-muted-foreground">{r.date}</p>
                </div>
                {r.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-secondary hover:text-secondary">
                      <CheckCircle className="h-5 w-5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                      <XCircle className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary" className="bg-accent text-accent-foreground">مقبول</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">تحديد الأسعار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {["رياضيات", "جبر", "هندسة"].map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium text-foreground">{s}</span>
                <span className="font-bold text-secondary">{80 + i * 10} ر.س/ساعة</span>
              </div>
            ))}
            <Button variant="outline" className="w-full mt-2">تعديل الأسعار</Button>
          </CardContent>
        </Card>

        {/* Earnings Chart placeholder */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-secondary" />
              إحصائيات الأرباح
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {["يناير", "فبراير", "مارس"].map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{m}</span>
                    <span className="font-semibold text-foreground">{(3000 + i * 600).toLocaleString()} ر.س</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full gradient-cta rounded-full" style={{ width: `${60 + i * 15}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
);

export default TeacherDashboard;
