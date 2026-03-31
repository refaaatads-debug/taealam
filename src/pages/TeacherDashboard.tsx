import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, DollarSign, Users, TrendingUp, Clock, CheckCircle, XCircle, Star, BarChart3, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const requests = [
  { student: "أحمد محمد", subject: "رياضيات", date: "الأحد 4:00 م", status: "pending" },
  { student: "سارة علي", subject: "رياضيات", date: "الاثنين 6:00 م", status: "pending" },
  { student: "خالد سعود", subject: "رياضيات", date: "الثلاثاء 5:00 م", status: "accepted" },
];

const schedule = [
  { time: "4:00 م", student: "خالد سعود", subject: "جبر", duration: "60 دقيقة" },
  { time: "6:00 م", student: "منى أحمد", subject: "هندسة", duration: "45 دقيقة" },
];

const earningsData = [
  { month: "يناير", amount: 3000, percent: 50 },
  { month: "فبراير", amount: 3600, percent: 65 },
  { month: "مارس", amount: 4200, percent: 80 },
  { month: "أبريل", amount: 4800, percent: 90 },
];

const TeacherDashboard = () => (
  <div className="min-h-screen bg-muted/30">
    <Navbar />
    <div className="container py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl md:text-3xl font-black text-foreground">مرحباً، أ. سارة 👋</h1>
          <p className="text-muted-foreground">لديك 2 حصة اليوم • <span className="text-secondary font-semibold">تقييم ممتاز</span></p>
        </motion.div>
        <Button variant="outline" className="rounded-xl gap-2" asChild>
          <Link to="/profile"><Settings className="h-4 w-4" /> إعدادات الحساب</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: DollarSign, label: "أرباح الشهر", value: "4,200 ر.س", color: "text-secondary", bg: "bg-secondary/10" },
          { icon: Users, label: "عدد الطلاب", value: "32", color: "text-primary", bg: "bg-primary/10" },
          { icon: CalendarCheck, label: "حصص هذا الشهر", value: "28", color: "text-accent-foreground", bg: "bg-accent" },
          { icon: Star, label: "التقييم", value: "4.9", color: "text-gold", bg: "bg-gold/10" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300">
              <CardContent className="p-5">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <p className="text-2xl font-black text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedule */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-secondary" />
              </div>
              جدول اليوم
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {schedule.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center justify-between p-4 rounded-2xl bg-accent/50 border border-accent">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl gradient-cta flex items-center justify-center">
                    <Users className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">{s.student} - {s.subject}</p>
                    <p className="text-xs text-muted-foreground">{s.time} • {s.duration}</p>
                  </div>
                </div>
                <Button size="sm" className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                  <Link to="/session">ابدأ الحصة</Link>
                </Button>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Requests */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarCheck className="h-4 w-4 text-primary" />
              </div>
              طلبات الحجز
              <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">2 جديد</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center border">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">{r.student}</p>
                    <p className="text-xs text-muted-foreground">{r.subject} • {r.date}</p>
                  </div>
                </div>
                {r.status === "pending" ? (
                  <div className="flex gap-1.5">
                    <Button size="icon" className="h-9 w-9 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary border-0">
                      <CheckCircle className="h-4.5 w-4.5" />
                    </Button>
                    <Button size="icon" className="h-9 w-9 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive border-0">
                      <XCircle className="h-4.5 w-4.5" />
                    </Button>
                  </div>
                ) : (
                  <Badge className="bg-accent text-accent-foreground border-0 rounded-lg">مقبول</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-gold" />
              </div>
              تحديد الأسعار
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {["رياضيات", "جبر", "هندسة"].map((s, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                <span className="text-sm font-bold text-foreground">{s}</span>
                <span className="font-black text-primary">{80 + i * 10} ر.س<span className="text-xs text-muted-foreground font-normal">/ساعة</span></span>
              </div>
            ))}
            <Button variant="outline" className="w-full mt-2 rounded-xl">تعديل الأسعار</Button>
          </CardContent>
        </Card>

        {/* Earnings Chart */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-secondary" />
              </div>
              إحصائيات الأرباح
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {earningsData.map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground font-medium">{m.month}</span>
                    <span className="font-black text-foreground">{m.amount.toLocaleString()} ر.س</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${m.percent}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }} className="h-full gradient-cta rounded-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-xl bg-accent/50 border border-accent">
              <p className="text-xs font-bold text-accent-foreground">📈 أرباحك زادت 40% مقارنة بالشهر الماضي!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
);

export default TeacherDashboard;
