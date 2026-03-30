import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CalendarCheck, Clock, BookOpen, Brain, Star, Video, TrendingUp, ChevronLeft, Award, Flame, Sparkles, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

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

const badges = [
  { icon: Flame, label: "7 أيام متتالية", color: "text-destructive bg-destructive/10" },
  { icon: Award, label: "أفضل طالب", color: "text-gold bg-gold/10" },
  { icon: Star, label: "10 حصص", color: "text-secondary bg-secondary/10" },
];

const StudentDashboard = () => (
  <div className="min-h-screen bg-muted/30">
    <Navbar />
    <div className="container py-8">
      {/* Welcome + Gamification */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl md:text-3xl font-black text-foreground">مرحباً، أحمد 👋</h1>
          <p className="text-muted-foreground">لديك 3 حصص هذا الأسبوع • <span className="text-secondary font-semibold">مستوى ذهبي</span></p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-2">
          {badges.map((b, i) => (
            <div key={i} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${b.color}`}>
              <b.icon className="h-3.5 w-3.5" />
              {b.label}
            </div>
          ))}
        </motion.div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: CalendarCheck, label: "حصص هذا الشهر", value: "12", color: "text-primary", bg: "bg-primary/10" },
          { icon: Clock, label: "ساعات التعلم", value: "18", color: "text-secondary", bg: "bg-secondary/10" },
          { icon: TrendingUp, label: "نسبة التقدم", value: "85%", color: "text-accent-foreground", bg: "bg-accent" },
          { icon: Award, label: "النقاط", value: "1,250", color: "text-gold", bg: "bg-gold/10" },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Tutor CTA */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-card overflow-hidden gradient-hero text-primary-foreground">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-5 w-5 text-gold" />
                    <span className="text-sm font-bold">المدرس الذكي AI</span>
                  </div>
                  <p className="text-lg font-black mb-1">هل تحتاج مساعدة في الواجب؟</p>
                  <p className="text-sm opacity-80">اسأل المدرس الذكي أي سؤال واحصل على إجابة فورية</p>
                </div>
                <Button className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0 rounded-xl backdrop-blur-sm" asChild>
                  <Link to="/ai-tutor">
                    <MessageSquare className="ml-2 h-4 w-4" />
                    اسأل الآن
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Upcoming */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Video className="h-4 w-4 text-secondary" />
                </div>
                الحصص القادمة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingClasses.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }} className={`flex items-center justify-between p-4 rounded-2xl transition-colors ${c.status === "soon" ? "bg-accent border border-secondary/20" : "bg-muted/50"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.status === "soon" ? "gradient-cta text-secondary-foreground" : "bg-card"}`}>
                      <BookOpen className={`h-5 w-5 ${c.status !== "soon" ? "text-primary" : ""}`} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{c.subject} - {c.teacher}</p>
                      <p className="text-xs text-muted-foreground">{c.date} • {c.time}</p>
                    </div>
                  </div>
                  {c.status === "soon" && (
                    <Button size="sm" className="gradient-cta text-secondary-foreground rounded-xl shadow-button animate-pulse-soft" asChild>
                      <Link to="/session">انضم الآن</Link>
                    </Button>
                  )}
                </motion.div>
              ))}
            </CardContent>
          </Card>

          {/* Progress */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-accent-foreground" />
                </div>
                متابعة المستوى
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { subject: "رياضيات", progress: 85, color: "bg-primary" },
                { subject: "فيزياء", progress: 70, color: "bg-secondary" },
                { subject: "إنجليزي", progress: 92, color: "bg-info" },
              ].map((p, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-bold text-foreground">{p.subject}</span>
                    <span className="font-bold text-muted-foreground">{p.progress}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${p.progress}%` }} transition={{ delay: 0.5 + i * 0.1, duration: 0.8, ease: "easeOut" }} className={`h-full rounded-full ${p.color}`} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Past Classes */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold">سجل الحصص</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pastClasses.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                  <div>
                    <p className="font-bold text-sm text-foreground">{c.subject} - {c.teacher}</p>
                    <p className="text-xs text-muted-foreground">{c.date} • {c.duration}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: c.rating }).map((_, j) => (
                      <Star key={j} className="h-3.5 w-3.5 fill-gold text-gold" />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Streak Card */}
          <Card className="border-0 shadow-card overflow-hidden">
            <CardContent className="p-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                <Flame className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-3xl font-black text-foreground">7</p>
              <p className="text-sm text-muted-foreground">أيام متتالية 🔥</p>
              <p className="text-xs text-muted-foreground mt-2">واصل التعلم يومياً للحفاظ على سلسلتك!</p>
            </CardContent>
          </Card>

          {/* AI Recommendations */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-secondary" />
                </div>
                توصيات AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations.map((r, i) => (
                <div key={i} className="p-4 rounded-xl bg-accent/50 border border-accent">
                  <p className="font-bold text-sm text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground mb-1">{r.subject} • <Star className="h-3 w-3 inline fill-gold text-gold" /> {r.rating}</p>
                  <p className="text-xs text-accent-foreground bg-accent rounded-lg px-2 py-1 inline-block mt-1">
                    <Sparkles className="h-3 w-3 inline ml-1" />{r.reason}
                  </p>
                  <Button size="sm" variant="outline" className="mt-3 w-full text-xs rounded-xl" asChild>
                    <Link to="/booking">احجز حصة <ChevronLeft className="h-3 w-3 mr-1" /></Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Points Card */}
          <Card className="border-0 shadow-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-foreground">نقاطي</span>
                <span className="text-xs text-gold font-bold">المستوى الذهبي</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-2">
                <div className="h-full bg-gold rounded-full" style={{ width: "62%" }} />
              </div>
              <p className="text-xs text-muted-foreground">1,250 / 2,000 نقطة للمستوى البلاتيني</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

export default StudentDashboard;
