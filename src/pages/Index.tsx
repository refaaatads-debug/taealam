import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import {
  GraduationCap, BookOpen, Users, Star, Video, Brain,
  ChevronLeft, Quote, Search, CalendarCheck, Shield,
  Sparkles, Award, ArrowLeft, CheckCircle, Zap, Target
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const } }),
};

const services = [
  { icon: Video, title: "حصص مباشرة", desc: "تعلم وجهاً لوجه مع أفضل المدرسين عبر فيديو عالي الجودة", color: "bg-primary/10 text-primary" },
  { icon: Brain, title: "ذكاء اصطناعي", desc: "توصيات ذكية للمدرس المثالي وتحليل مستواك التعليمي", color: "bg-secondary/10 text-secondary" },
  { icon: BookOpen, title: "50+ مادة", desc: "رياضيات، علوم، لغات، برمجة وأكثر من 50 مادة تعليمية", color: "bg-warning/10 text-warning" },
  { icon: Shield, title: "مدرسون معتمدون", desc: "جميع المدرسين مراجعون ومعتمدون لضمان جودة التعليم", color: "bg-info/10 text-info" },
];

const stats = [
  { value: "10,000+", label: "طالب نشط", icon: Users },
  { value: "500+", label: "مدرس معتمد", icon: GraduationCap },
  { value: "50,000+", label: "حصة مكتملة", icon: CalendarCheck },
  { value: "4.9", label: "متوسط التقييم", icon: Star },
];

const teachers = [
  { name: "أ. سارة المحمدي", subject: "رياضيات", rating: 4.9, students: 320, price: 80 },
  { name: "أ. خالد العتيبي", subject: "فيزياء", rating: 4.8, students: 280, price: 90 },
  { name: "أ. نورة الشهري", subject: "إنجليزي", rating: 4.9, students: 410, price: 70 },
  { name: "أ. أحمد الحربي", subject: "كيمياء", rating: 4.7, students: 195, price: 85 },
];

const testimonials = [
  { name: "محمد السالم", text: "المنصة غيرت مستوى ابني تماماً. المدرسين ممتازين والحجز سهل جداً. أنصح كل ولي أمر بتجربتها.", role: "ولي أمر", rating: 5 },
  { name: "هند الرشيد", text: "أفضل تجربة تعليمية أونلاين. الحصص تفاعلية والمتابعة ممتازة. تحسن مستواي بشكل ملحوظ.", role: "طالبة جامعية", rating: 5 },
  { name: "عبدالله القحطاني", text: "كمدرس، المنصة وفرت لي بيئة احترافية وعدد طلاب ممتاز مع دخل مستقر.", role: "معلم", rating: 5 },
];

const steps = [
  { icon: Search, title: "ابحث عن مدرس", desc: "اختر من بين مئات المدرسين المعتمدين" },
  { icon: CalendarCheck, title: "احجز موعدك", desc: "اختر الوقت المناسب في خطوة واحدة" },
  { icon: Video, title: "ابدأ التعلم", desc: "انضم للحصة المباشرة وابدأ رحلتك" },
];

const Index = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />

    {/* Hero */}
    <section className="gradient-hero text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 right-20 w-72 h-72 rounded-full border-2 border-primary-foreground/20 animate-float" />
        <div className="absolute bottom-10 left-10 w-48 h-48 rounded-full border-2 border-primary-foreground/20 animate-float" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 rounded-full bg-primary-foreground/5 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="container py-24 md:py-32 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
            <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-4 py-2 text-sm mb-6 border border-primary-foreground/10">
              <Sparkles className="h-4 w-4 text-gold" />
              <span>مدعومة بالذكاء الاصطناعي</span>
            </motion.div>
            <motion.h1 variants={fadeUp} custom={1} className="text-4xl md:text-5xl lg:text-6xl font-black leading-[1.2] mb-6">
              مستقبل التعليم
              <br />
              <span className="opacity-90">يبدأ من هنا</span>
            </motion.h1>
            <motion.p variants={fadeUp} custom={2} className="text-lg md:text-xl opacity-85 mb-8 max-w-lg leading-relaxed">
              حصص خصوصية مباشرة مع مدرسين معتمدين. الذكاء الاصطناعي يختار لك المدرس المثالي.
            </motion.p>
            <motion.div variants={fadeUp} custom={3} className="flex flex-wrap gap-4">
              <Button size="lg" className="gradient-cta shadow-button text-secondary-foreground text-base px-8 rounded-xl h-13" asChild>
                <Link to="/search">
                  <Search className="ml-2 h-5 w-5" />
                  ابحث عن مدرسك
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 text-base rounded-xl h-13 backdrop-blur-sm" asChild>
                <Link to="/login">
                  احجز حصة مجانية
                  <ChevronLeft className="mr-2 h-5 w-5" />
                </Link>
              </Button>
            </motion.div>
            <motion.div variants={fadeUp} custom={4} className="flex items-center gap-6 mt-8 pt-8 border-t border-primary-foreground/10">
              <div className="flex -space-x-2 space-x-reverse">
                {[..."سمنه"].map((l, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-primary-foreground/20 backdrop-blur-sm border-2 border-primary-foreground/30 flex items-center justify-center text-xs font-bold">{l}</div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-gold text-gold" />
                  ))}
                </div>
                <p className="text-xs opacity-70">أكثر من 10,000 طالب يثقون بنا</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.8 }} className="hidden lg:block">
            <div className="relative">
              <div className="bg-primary-foreground/10 backdrop-blur-lg rounded-3xl p-8 border border-primary-foreground/10">
                <div className="bg-primary-foreground/10 rounded-2xl p-6 mb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
                      <Video className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold">حصة مباشرة الآن</p>
                      <p className="text-xs opacity-60">رياضيات - أ. سارة المحمدي</p>
                    </div>
                  </div>
                  <div className="h-32 rounded-xl bg-primary-foreground/5 flex items-center justify-center">
                    <div className="text-center">
                      <Video className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm opacity-50">بث مباشر</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 bg-primary-foreground/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black">98%</p>
                    <p className="text-xs opacity-60">رضا الطلاب</p>
                  </div>
                  <div className="flex-1 bg-primary-foreground/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black">4.9</p>
                    <p className="text-xs opacity-60">تقييم المدرسين</p>
                  </div>
                </div>
              </div>
              {/* Floating badge */}
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="absolute -top-4 -left-4 bg-gold text-gold-foreground px-4 py-2 rounded-xl font-bold text-sm shadow-lg">
                <Award className="h-4 w-4 inline ml-1" />
                الأعلى تقييماً
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>

    {/* Stats Bar */}
    <section className="py-6 bg-card border-b">
      <div className="container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
                <s.icon className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xl font-black text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    {/* How it works */}
    <section className="py-20 bg-background">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
          <span className="text-sm font-semibold text-secondary bg-accent px-4 py-1.5 rounded-full">كيف تبدأ؟</span>
          <h2 className="text-3xl md:text-4xl font-black text-foreground mt-4 mb-3">ثلاث خطوات فقط</h2>
          <p className="text-muted-foreground text-lg">ابدأ رحلتك التعليمية في أقل من دقيقة</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }} className="text-center relative">
              <div className="w-16 h-16 rounded-2xl gradient-cta flex items-center justify-center mx-auto mb-5 shadow-button">
                <s.icon className="h-7 w-7 text-secondary-foreground" />
              </div>
              <div className="absolute top-8 right-0 hidden md:block" style={{ left: i < 2 ? "-40%" : undefined, display: i >= 2 ? "none" : undefined }}>
                <ArrowLeft className="h-5 w-5 text-muted-foreground/30" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-foreground">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    {/* Services */}
    <section className="py-20 bg-muted/30">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
          <span className="text-sm font-semibold text-secondary bg-accent px-4 py-1.5 rounded-full">المميزات</span>
          <h2 className="text-3xl md:text-4xl font-black text-foreground mt-4 mb-3">لماذا تعلّم؟</h2>
          <p className="text-muted-foreground text-lg">كل ما تحتاجه لتجربة تعليمية استثنائية</p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Card className="group shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1.5 border-0 h-full">
                <CardContent className="p-6">
                  <div className={`w-14 h-14 rounded-2xl ${s.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <s.icon className="h-7 w-7" />
                  </div>
                  <h3 className="font-bold text-lg mb-2 text-foreground">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    {/* Featured Teachers */}
    <section className="py-20 bg-background">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="flex items-end justify-between mb-12">
          <div>
            <span className="text-sm font-semibold text-secondary bg-accent px-4 py-1.5 rounded-full">نخبة المدرسين</span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mt-4 mb-2">مدرسون مميزون</h2>
            <p className="text-muted-foreground">نخبة من أفضل المعلمين المعتمدين والمراجعين</p>
          </div>
          <Button variant="outline" className="rounded-xl hidden sm:flex" asChild>
            <Link to="/search">عرض الكل <ChevronLeft className="mr-1 h-4 w-4" /></Link>
          </Button>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {teachers.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Card className="shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1.5 border-0 overflow-hidden group">
                <div className="h-28 gradient-hero flex items-center justify-center relative">
                  <div className="w-18 h-18 rounded-2xl bg-card/20 backdrop-blur-sm flex items-center justify-center border border-primary-foreground/10">
                    <Users className="h-9 w-9 text-primary-foreground/80" />
                  </div>
                  <div className="absolute top-3 left-3 bg-card/20 backdrop-blur-sm rounded-full px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                    <Star className="h-3 w-3 inline fill-gold text-gold ml-0.5" />{t.rating}
                  </div>
                </div>
                <CardContent className="p-5 text-center">
                  <h3 className="font-bold text-foreground mb-0.5">{t.name}</h3>
                  <p className="text-sm text-secondary font-semibold mb-1">{t.subject}</p>
                  <p className="text-xs text-muted-foreground mb-4">{t.students} طالب</p>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-black text-primary">{t.price} <span className="text-xs font-normal text-muted-foreground">ر.س/ساعة</span></span>
                  </div>
                  <Button className="w-full gradient-cta shadow-button text-secondary-foreground rounded-xl" size="sm" asChild>
                    <Link to="/booking">احجز الآن</Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        <div className="text-center mt-8 sm:hidden">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/search">عرض كل المدرسين <ChevronLeft className="mr-1 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </section>

    {/* AI Section */}
    <section className="py-20 bg-muted/30 overflow-hidden">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <span className="text-sm font-semibold text-secondary bg-accent px-4 py-1.5 rounded-full">
              <Sparkles className="h-3.5 w-3.5 inline ml-1" />
              تقنية الذكاء الاصطناعي
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mt-4 mb-4">مدرسك الذكي يعرفك أكثر</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              تقنيات الذكاء الاصطناعي تحلل مستواك وتقترح المدرس الأنسب لك، مع ملخصات تلقائية لكل حصة وتصحيح ذكي للواجبات.
            </p>
            <div className="space-y-4">
              {[
                { icon: Target, text: "توصيات مدرسين مخصصة حسب مستواك" },
                { icon: Zap, text: "ملخصات تلقائية بعد كل حصة" },
                { icon: CheckCircle, text: "تصحيح الواجبات بالذكاء الاصطناعي" },
                { icon: Brain, text: "تحليل شامل لنقاط القوة والضعف" },
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <item.icon className="h-4.5 w-4.5 text-secondary" />
                  </div>
                  <span className="text-foreground font-medium">{item.text}</span>
                </motion.div>
              ))}
            </div>
            <Button className="mt-8 gradient-cta shadow-button text-secondary-foreground rounded-xl px-6" asChild>
              <Link to="/ai-tutor">
                <Brain className="ml-2 h-5 w-5" />
                جرّب المدرس الذكي
              </Link>
            </Button>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="hidden lg:block">
            <div className="relative">
              <div className="bg-card rounded-3xl shadow-card-hover p-6 border">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl gradient-cta flex items-center justify-center">
                    <Brain className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">المدرس الذكي</p>
                    <p className="text-xs text-muted-foreground">يحلل مستواك الآن...</p>
                  </div>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="bg-muted rounded-xl p-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">الرياضيات</span>
                      <span className="font-bold text-foreground">85%</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden">
                      <div className="h-full gradient-cta rounded-full" style={{ width: "85%" }} />
                    </div>
                  </div>
                  <div className="bg-muted rounded-xl p-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">الفيزياء</span>
                      <span className="font-bold text-foreground">72%</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden">
                      <div className="h-full gradient-cta rounded-full" style={{ width: "72%" }} />
                    </div>
                  </div>
                </div>
                <div className="bg-accent rounded-xl p-3">
                  <p className="text-xs font-semibold text-accent-foreground mb-1">💡 توصية AI</p>
                  <p className="text-xs text-muted-foreground">ننصحك بالتركيز على الفيزياء مع أ. خالد العتيبي لتحسين مستواك.</p>
                </div>
              </div>
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.5 }} className="absolute -bottom-4 -right-4 bg-card rounded-xl shadow-card p-3 border">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-gold" />
                  <span className="text-xs font-bold text-foreground">تحسن 23% هذا الشهر</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>

    {/* Testimonials */}
    <section className="py-20 bg-background">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
          <span className="text-sm font-semibold text-secondary bg-accent px-4 py-1.5 rounded-full">آراء المستخدمين</span>
          <h2 className="text-3xl md:text-4xl font-black text-foreground mt-4 mb-3">ماذا يقول مستخدمونا؟</h2>
          <p className="text-muted-foreground text-lg">آراء حقيقية من طلاب ومعلمين وأولياء أمور</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Card className="shadow-card hover:shadow-card-hover transition-all duration-300 border-0 h-full">
                <CardContent className="p-7">
                  <div className="flex items-center gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-gold text-gold" />
                    ))}
                  </div>
                  <p className="text-foreground mb-5 leading-relaxed">{t.text}</p>
                  <div className="flex items-center gap-3 pt-4 border-t">
                    <div className="w-11 h-11 rounded-xl gradient-hero flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-foreground">{t.name[0]}</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="gradient-hero text-primary-foreground py-20 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 right-10 w-32 h-32 rounded-full border border-primary-foreground/20 animate-float" />
        <div className="absolute bottom-10 left-20 w-24 h-24 rounded-full border border-primary-foreground/20 animate-float" style={{ animationDelay: "1s" }} />
      </div>
      <div className="container text-center relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-3xl md:text-5xl font-black mb-5">ابدأ رحلتك التعليمية الآن</h2>
          <p className="text-lg opacity-85 mb-8 max-w-lg mx-auto">سجّل مجاناً واحصل على أول حصة بخصم 50%</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" className="gradient-cta shadow-button text-secondary-foreground text-lg px-10 rounded-xl h-14" asChild>
              <Link to="/login">ابدأ مجاناً</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 text-lg rounded-xl h-14 backdrop-blur-sm" asChild>
              <Link to="/search">تصفح المدرسين</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>

    <Footer />
  </div>
);

export default Index;
