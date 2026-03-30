import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Users, CreditCard, Bell, TrendingUp, BookOpen, Star, Shield, ChevronLeft, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const children = [
  { name: "أحمد", grade: "الصف الثالث ثانوي", progress: 85, upcomingClasses: 3, subjects: ["رياضيات", "فيزياء", "إنجليزي"], avgRating: 4.8 },
  { name: "سارة", grade: "الصف الأول متوسط", progress: 78, upcomingClasses: 2, subjects: ["عربي", "رياضيات"], avgRating: 4.6 },
];

const payments = [
  { desc: "حصة رياضيات - أحمد", amount: 80, date: "اليوم", status: "paid" },
  { desc: "حصة فيزياء - أحمد", amount: 90, date: "أمس", status: "paid" },
  { desc: "حصة عربي - سارة", amount: 65, date: "قبل يومين", status: "pending" },
];

const notifications = [
  { text: "حصة أحمد في الرياضيات بعد ساعة", time: "منذ 30 دقيقة", type: "reminder", urgent: true },
  { text: "تقرير أداء سارة الأسبوعي جاهز", time: "منذ ساعة", type: "report", urgent: false },
  { text: "تم تأكيد حجز حصة الفيزياء", time: "منذ 3 ساعات", type: "booking", urgent: false },
];

const ParentDashboard = () => (
  <div className="min-h-screen bg-muted/30">
    <Navbar />
    <div className="container py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground">مرحباً، أبو أحمد 👋</h1>
          <p className="text-muted-foreground">متابعة أبنائك في مكان واحد</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl gap-2"><Shield className="h-4 w-4" /> الرقابة الأبوية</Button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "إجمالي الإنفاق", value: "1,245 ر.س", icon: CreditCard, color: "text-primary", bg: "bg-primary/10" },
          { label: "الحصص المكتملة", value: "24", icon: BookOpen, color: "text-secondary", bg: "bg-secondary/10" },
          { label: "متوسط التقييم", value: "4.7", icon: Star, color: "text-gold", bg: "bg-gold/10" },
          { label: "التقدم العام", value: "82%", icon: TrendingUp, color: "text-accent-foreground", bg: "bg-accent" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-0 shadow-card">
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

      {/* Children Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {children.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}>
            <Card className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center">
                    <span className="text-xl font-black text-primary-foreground">{c.name[0]}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-foreground text-lg">{c.name}</h3>
                    <p className="text-xs text-muted-foreground">{c.grade}</p>
                  </div>
                  <Badge className="bg-accent text-accent-foreground border-0 rounded-xl">
                    {c.upcomingClasses} حصص قادمة
                  </Badge>
                </div>
                <div className="flex gap-2 mb-5 flex-wrap">
                  {c.subjects.map((s) => (
                    <span key={s} className="text-xs bg-muted px-3 py-1.5 rounded-lg text-muted-foreground font-medium">{s}</span>
                  ))}
                </div>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">نسبة التقدم</span>
                    <span className="font-black text-foreground">{c.progress}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${c.progress}%` }} transition={{ delay: 0.5, duration: 0.8 }} className="h-full gradient-cta rounded-full" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl gap-2">
                    <Eye className="h-4 w-4" /> عرض التقارير
                  </Button>
                  <Button className="flex-1 gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                    <Link to="/booking">حجز حصة</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-primary" />
              </div>
              المدفوعات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                <div>
                  <p className="font-bold text-sm text-foreground">{p.desc}</p>
                  <p className="text-xs text-muted-foreground">{p.date}</p>
                </div>
                <div className="text-left">
                  <p className="font-black text-sm text-foreground">{p.amount} ر.س</p>
                  <Badge className={`text-xs border-0 rounded-lg ${p.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
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
            <CardTitle className="text-lg flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-warning" />
              </div>
              الإشعارات
              <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">1 جديد</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications.map((n, i) => (
              <div key={i} className={`p-4 rounded-xl transition-colors ${n.urgent ? "bg-warning/5 border border-warning/20" : "bg-muted/50 hover:bg-muted"}`}>
                <p className="text-sm text-foreground font-medium">{n.text}</p>
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
