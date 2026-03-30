import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CalendarCheck, Clock, BookOpen, Brain, Star, Video, TrendingUp, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

const upcomingClasses = [
  { subject: "رياضيات", teacher: "أ. سارة المحمدي", date: "اليوم", time: "4:00 م", status: "soon" },
  { subject: "فيزياء", teacher: "أ. خالد العتيبي", date: "غداً", time: "6:00 م", status: "upcoming" },
  { subject: "إنجليزي", teacher: "أ. نورة الشهري", date: "الأربعاء", time: "5:00 م", status: "upcoming" },
];

const pastClasses = [
  { subject: "رياضيات", teacher: "أ. سارة المحمدي", date: "أمس", duration: "60 دقيقة", rating: 5 },
  { subject: "كيمياء", teacher: "أ. أحمد الحربي", date: "السبت", duration: "45 دقيقة", rating: 4 },
];

const recommendations = [
  { name: "أ. فاطمة العمري", subject: "عربي", rating: 4.8, reason: "بناءً على مستواك في القراءة" },
  { name: "أ. عمر السبيعي", subject: "رياضيات", rating: 4.6, reason: "لتقوية الجبر والهندسة" },
];

const StudentDashboard = () => (
  <div className="min-h-screen bg-muted/30">
    <Navbar />
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">مرحباً، أحمد 👋</h1>
        <p className="text-muted-foreground">لديك 3 حصص هذا الأسبوع</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: CalendarCheck, label: "حصص هذا الشهر", value: "12", color: "text-primary" },
          { icon: Clock, label: "ساعات التعلم", value: "18", color: "text-secondary" },
          { icon: TrendingUp, label: "نسبة التقدم", value: "85%", color: "text-accent-foreground" },
          { icon: Star, label: "متوسط التقييم", value: "4.8", color: "text-yellow-500" },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="h-5 w-5 text-secondary" />
                الحصص القادمة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingClasses.map((c, i) => (
                <div key={i} className={`flex items-center justify-between p-4 rounded-xl ${c.status === "soon" ? "bg-accent" : "bg-muted/50"}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{c.subject} - {c.teacher}</p>
                      <p className="text-xs text-muted-foreground">{c.date} • {c.time}</p>
                    </div>
                  </div>
                  {c.status === "soon" && (
                    <Button size="sm" className="gradient-cta text-secondary-foreground" asChild>
                      <Link to="/session">انضم الآن</Link>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Progress */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-secondary" />
                متابعة المستوى
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { subject: "رياضيات", progress: 85 },
                { subject: "فيزياء", progress: 70 },
                { subject: "إنجليزي", progress: 92 },
              ].map((p, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-foreground">{p.subject}</span>
                    <span className="text-muted-foreground">{p.progress}%</span>
                  </div>
                  <Progress value={p.progress} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Past Classes */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">سجل الحصص</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pastClasses.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-sm text-foreground">{c.subject} - {c.teacher}</p>
                    <p className="text-xs text-muted-foreground">{c.date} • {c.duration}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: c.rating }).map((_, j) => (
                      <Star key={j} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-secondary" />
                توصيات الذكاء الاصطناعي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations.map((r, i) => (
                <div key={i} className="p-3 rounded-xl bg-accent/50">
                  <p className="font-semibold text-sm text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground mb-1">{r.subject} • ⭐ {r.rating}</p>
                  <p className="text-xs text-accent-foreground">{r.reason}</p>
                  <Button size="sm" variant="outline" className="mt-2 w-full text-xs" asChild>
                    <Link to="/booking">احجز حصة <ChevronLeft className="h-3 w-3 mr-1" /></Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

export default StudentDashboard;
