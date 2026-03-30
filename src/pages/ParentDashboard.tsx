import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Users, CreditCard, Bell, TrendingUp, BookOpen } from "lucide-react";

const children = [
  {
    name: "أحمد",
    grade: "الصف الثالث ثانوي",
    progress: 85,
    upcomingClasses: 3,
    subjects: ["رياضيات", "فيزياء", "إنجليزي"],
  },
  {
    name: "سارة",
    grade: "الصف الأول متوسط",
    progress: 78,
    upcomingClasses: 2,
    subjects: ["عربي", "رياضيات"],
  },
];

const payments = [
  { desc: "حصة رياضيات - أحمد", amount: 80, date: "اليوم", status: "paid" },
  { desc: "حصة فيزياء - أحمد", amount: 90, date: "أمس", status: "paid" },
  { desc: "حصة عربي - سارة", amount: 65, date: "قبل يومين", status: "pending" },
];

const notifications = [
  { text: "حصة أحمد في الرياضيات بعد ساعة", time: "منذ 30 دقيقة", type: "reminder" },
  { text: "تقرير أداء سارة الأسبوعي جاهز", time: "منذ ساعة", type: "report" },
  { text: "تم تأكيد حجز حصة الفيزياء", time: "منذ 3 ساعات", type: "booking" },
];

const ParentDashboard = () => (
  <div className="min-h-screen bg-muted/30">
    <Navbar />
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">مرحباً، أبو أحمد 👋</h1>
        <p className="text-muted-foreground">متابعة أبنائك في مكان واحد</p>
      </div>

      {/* Children */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {children.map((c, i) => (
          <Card key={i} className="border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
                  <Users className="h-6 w-6 text-accent-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">{c.name}</h3>
                  <p className="text-xs text-muted-foreground">{c.grade}</p>
                </div>
                <Badge variant="secondary" className="mr-auto bg-accent text-accent-foreground">
                  {c.upcomingClasses} حصص قادمة
                </Badge>
              </div>
              <div className="flex gap-2 mb-4">
                {c.subjects.map((s) => (
                  <span key={s} className="text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground">{s}</span>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">نسبة التقدم</span>
                  <span className="font-semibold text-foreground">{c.progress}%</span>
                </div>
                <Progress value={c.progress} className="h-2" />
              </div>
              <Button variant="outline" className="w-full mt-4">
                <BookOpen className="h-4 w-4 ml-2" />
                عرض التقارير
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-secondary" />
              المدفوعات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm text-foreground">{p.desc}</p>
                  <p className="text-xs text-muted-foreground">{p.date}</p>
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm text-foreground">{p.amount} ر.س</p>
                  <Badge variant={p.status === "paid" ? "secondary" : "outline"} className="text-xs">
                    {p.status === "paid" ? "مدفوع" : "معلق"}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-secondary" />
              الإشعارات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications.map((n, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-foreground">{n.text}</p>
                <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
);

export default ParentDashboard;
