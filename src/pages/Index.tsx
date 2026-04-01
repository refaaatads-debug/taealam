import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import SmartPopup from "@/components/SmartPopup";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useCountdown } from "@/hooks/useCountdown";
import {
  GraduationCap, BookOpen, Users, Star, Video, Brain,
  ChevronLeft, Search, CalendarCheck, Shield,
  Sparkles, Award, CheckCircle, Zap, Target,
  Gift, Clock, Play, ArrowLeft, Flame, TrendingUp
} from "lucide-react";

import heroBanner from "@/assets/hero-banner.jpg";
import teacher1 from "@/assets/teacher-1.jpg";
import teacher2 from "@/assets/teacher-2.jpg";
import teacher3 from "@/assets/teacher-3.jpg";
import teacher4 from "@/assets/teacher-4.jpg";
import testimonial1 from "@/assets/testimonial-1.jpg";
import testimonial2 from "@/assets/testimonial-2.jpg";
import testimonial3 from "@/assets/testimonial-3.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const },
  }),
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
  { name: "أ. سارة المحمدي", subject: "رياضيات", rating: 4.9, students: 320, price: 80, img: teacher1, badge: "الأكثر حجزاً", sessions: 1200 },
  { name: "أ. خالد العتيبي", subject: "فيزياء", rating: 4.8, students: 280, price: 90, img: teacher2, badge: "مدرس مميز", sessions: 980 },
  { name: "أ. نورة الشهري", subject: "إنجليزي", rating: 4.9, students: 410, price: 70, img: teacher3, badge: "الأعلى تقييماً", sessions: 1450 },
  { name: "أ. أحمد الحربي", subject: "كيمياء", rating: 4.7, students: 195, price: 85, img: teacher4, badge: "خبير", sessions: 760 },
];

const testimonials = [
  { name: "محمد السالم", text: "المنصة غيرت مستوى ابني تماماً في الرياضيات. المدرسين محترفين والحجز سهل جداً. من أفضل القرارات اللي اتخذتها.", role: "ولي أمر", rating: 5, img: testimonial1 },
  { name: "هند الرشيد", text: "أفضل تجربة تعليمية أونلاين مريت فيها. الحصص تفاعلية والمتابعة ممتازة. تحسن مستواي في الفيزياء بشكل ملحوظ.", role: "طالبة جامعية", rating: 5, img: testimonial2 },
  { name: "عبدالله القحطاني", text: "كمدرس، المنصة وفرت لي بيئة احترافية وعدد طلاب ممتاز. الأدوات والدعم التقني مذهلين والدخل مستقر.", role: "معلم رياضيات", rating: 5, img: testimonial3 },
];

const steps = [
  { icon: Search, title: "ابحث عن مدرسك", desc: "اختر من بين مئات المدرسين المعتمدين حسب المادة والمستوى", cta: "تصفح المدرسين", link: "/search" },
  { icon: CalendarCheck, title: "احجز موعدك", desc: "اختر الوقت المناسب لك وادفع بكل سهولة وأمان", cta: "شاهد الأوقات", link: "/search" },
  { icon: Video, title: "ابدأ التعلم", desc: "انضم للحصة المباشرة واستمتع بتجربة تعلم تفاعلية", cta: "جرّب مجاناً", link: "/login" },
];

// Dynamic CTA based on user state
function SmartCTA({ user, className = "" }: { user: any; className?: string }) {
  if (!user) {
    return (
      <Button size="lg" className={`gradient-cta shadow-button text-secondary-foreground text-base md:text-lg px-8 md:px-10 rounded-2xl h-14 md:h-16 w-full sm:w-auto font-black ${className}`} asChild>
        <Link to="/login">
          <Gift className="ml-2 h-5 w-5" />
          ابدأ مجاناً – أول حصة هدية
        </Link>
      </Button>
    );
  }
  return (
    <Button size="lg" className={`gradient-cta shadow-button text-secondary-foreground text-base md:text-lg px-8 md:px-10 rounded-2xl h-14 md:h-16 w-full sm:w-auto font-black ${className}`} asChild>
      <Link to="/search">
        <Search className="ml-2 h-5 w-5" />
        احجز حصتك الآن
      </Link>
    </Button>
  );
}

const Index = () => {
  const { user, profile } = useAuth();
  const { hours, minutes, seconds } = useCountdown(24 * 60 * 60); // 24 hours

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
      <Navbar />

      {/* ── Free Trial Top Banner ── */}
      <div className="gradient-cta text-secondary-foreground py-2.5 px-4 relative overflow-hidden">
        <div className="container flex items-center justify-center gap-3 text-sm font-bold">
          <Gift className="h-4 w-4 animate-bounce-gentle" />
          <span>🎁 احصل على أول حصة مجانية – لفترة محدودة!</span>
          <Link to="/login" className="underline underline-offset-4 hover:opacity-80 transition-opacity mr-2">
            سجّل الآن
          </Link>
        </div>
      </div>

      {/* ═══════════════ HERO SECTION ═══════════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBanner} alt="منصة تعلّم التعليمية" className="w-full h-full object-cover" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-l from-primary/95 via-primary/88 to-primary/75" />
        </div>

        <div className="container py-16 md:py-24 lg:py-32 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            {/* ── Hero Text ── */}
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.12 } } }}>
              {/* Personalized greeting */}
              {user && profile?.full_name && (
                <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 bg-gold/20 backdrop-blur-sm rounded-full px-4 py-2 text-sm mb-4 border border-gold/30 text-gold font-bold">
                  <span>👋</span>
                  <span>مرحباً، {profile.full_name}</span>
                </motion.div>
              )}

              <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-4 py-2 text-sm mb-5 border border-primary-foreground/10 text-primary-foreground">
                <Sparkles className="h-4 w-4 text-gold" />
                <span className="font-semibold">مدعومة بالذكاء الاصطناعي</span>
              </motion.div>

              <motion.h1 variants={fadeUp} custom={1} className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.15] mb-5 md:mb-6 text-primary-foreground tracking-tight">
                تعلّم بذكاء،
                <br />
                <span className="opacity-90">تفوّق بثقة</span>
              </motion.h1>

              <motion.p variants={fadeUp} custom={2} className="text-lg md:text-xl opacity-85 mb-8 max-w-lg leading-relaxed text-primary-foreground">
                حصص خصوصية مباشرة مع نخبة المدرسين المعتمدين.
                <span className="font-bold"> الذكاء الاصطناعي يختار لك المدرس المثالي</span> ويتابع تقدمك لحظة بلحظة.
              </motion.p>

              <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <SmartCTA user={user} />
                <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 text-base rounded-2xl h-14 md:h-16 backdrop-blur-sm w-full sm:w-auto font-bold gap-2" asChild>
                  <Link to="/search">
                    <Play className="h-5 w-5" />
                    شاهد كيف تعمل المنصة
                  </Link>
                </Button>
              </motion.div>

              {/* Trust Elements */}
              <motion.div variants={fadeUp} custom={4} className="flex items-center gap-5 mt-8 pt-8 border-t border-primary-foreground/10">
                <div className="flex -space-x-3 space-x-reverse">
                  {[teacher1, teacher2, teacher3, teacher4].map((img, i) => (
                    <img key={i} src={img} alt="مدرس" className="w-10 h-10 rounded-full border-2 border-primary-foreground/30 object-cover" loading="lazy" width={40} height={40} />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-gold text-gold" />
                    ))}
                    <span className="text-sm font-bold text-gold mr-1">4.9</span>
                  </div>
                  <p className="text-sm opacity-80 text-primary-foreground font-medium">أكثر من <span className="font-black">10,000</span> طالب يثقون بنا</p>
                </div>
              </motion.div>
            </motion.div>

            {/* ── Hero Interactive Card (Glass) ── */}
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, duration: 0.8 }} className="hidden lg:block">
              <Link to="/search" className="block group">
                <div className="relative">
                  <div className="bg-primary-foreground/10 backdrop-blur-xl rounded-3xl p-8 border border-primary-foreground/15 transition-all duration-500 group-hover:bg-primary-foreground/15 group-hover:scale-[1.02] group-hover:shadow-2xl cursor-pointer">
                    <div className="bg-primary-foreground/10 rounded-2xl p-6 mb-4">
                      <div className="flex items-center gap-3 mb-4">
                        <img src={teacher1} alt="أ. سارة المحمدي" className="w-14 h-14 rounded-2xl object-cover border border-primary-foreground/20" loading="lazy" width={56} height={56} />
                        <div className="text-primary-foreground">
                          <p className="font-black text-base">حصة مباشرة الآن</p>
                          <p className="text-xs opacity-70">رياضيات - أ. سارة المحمدي</p>
                        </div>
                        <div className="mr-auto flex items-center gap-1 bg-destructive/20 text-destructive px-2 py-1 rounded-lg text-xs font-bold animate-pulse-soft">
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                          مباشر
                        </div>
                      </div>
                      <div className="h-36 rounded-xl bg-primary-foreground/5 flex items-center justify-center border border-primary-foreground/5 group-hover:bg-primary-foreground/10 transition-all">
                        <div className="text-center text-primary-foreground">
                          <div className="w-14 h-14 rounded-full bg-primary-foreground/10 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                            <Play className="h-7 w-7 opacity-60" />
                          </div>
                          <p className="text-sm opacity-50">اضغط لمشاهدة البث</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 text-primary-foreground">
                      <div className="flex-1 bg-primary-foreground/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black">98%</p>
                        <p className="text-xs opacity-60">رضا الطلاب</p>
                      </div>
                      <div className="flex-1 bg-primary-foreground/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black">4.9</p>
                        <p className="text-xs opacity-60">تقييم المدرسين</p>
                      </div>
                      <div className="flex-1 bg-primary-foreground/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black">50K+</p>
                        <p className="text-xs opacity-60">حصة مكتملة</p>
                      </div>
                    </div>
                  </div>
                  <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="absolute -top-4 -left-4 bg-gold text-gold-foreground px-4 py-2 rounded-xl font-bold text-sm shadow-lg">
                    <Award className="h-4 w-4 inline ml-1" />
                    #1 منصة تعليمية
                  </motion.div>
                  <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", delay: 0.5 }} className="absolute -bottom-3 -right-3 bg-card rounded-xl shadow-card-hover p-3 border">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-destructive" />
                      <span className="text-xs font-black text-foreground">+23% تحسن هذا الشهر</span>
                    </div>
                  </motion.div>
                </div>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="py-6 md:py-8 bg-card border-b">
        <div className="container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
            {stats.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="flex items-center gap-3 md:gap-4">
                <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shrink-0">
                  <s.icon className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-black text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12 md:mb-16">
            <span className="text-sm font-bold text-secondary bg-accent px-4 py-2 rounded-full">كيف تبدأ؟</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground mt-5 mb-3">ثلاث خطوات فقط</h2>
            <p className="text-muted-foreground text-lg md:text-xl max-w-md mx-auto">ابدأ رحلتك التعليمية في أقل من دقيقة واحدة</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {steps.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }} className="text-center relative group">
                {/* Number badge */}
                <div className="absolute -top-3 right-1/2 translate-x-1/2 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-black flex items-center justify-center z-10 shadow-lg">
                  {i + 1}
                </div>
                <div className="bg-card rounded-3xl p-6 md:p-8 pt-8 shadow-card hover:shadow-card-hover transition-all duration-300 border border-border/50 group-hover:-translate-y-2">
                  <motion.div
                    whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                    className="w-16 h-16 md:w-20 md:h-20 rounded-2xl gradient-cta flex items-center justify-center mx-auto mb-5 shadow-button"
                  >
                    <s.icon className="h-7 w-7 md:h-9 md:w-9 text-secondary-foreground" />
                  </motion.div>
                  <h3 className="font-black text-lg md:text-xl mb-2 text-foreground">{s.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{s.desc}</p>
                  <Button variant="ghost" size="sm" className="text-secondary font-bold rounded-xl" asChild>
                    <Link to={s.link}>{s.cta} <ChevronLeft className="h-3.5 w-3.5 mr-1" /></Link>
                  </Button>
                </div>
                {/* Connector arrow */}
                {i < 2 && (
                  <div className="hidden md:flex absolute top-1/2 -translate-y-1/2 -left-4 z-10">
                    <ArrowLeft className="h-5 w-5 text-muted-foreground/30" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ SERVICES ═══════════════ */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12 md:mb-16">
            <span className="text-sm font-bold text-secondary bg-accent px-4 py-2 rounded-full">المميزات</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground mt-5 mb-3">لماذا تعلّم؟</h2>
            <p className="text-muted-foreground text-lg md:text-xl">كل ما تحتاجه لتجربة تعليمية استثنائية في مكان واحد</p>
          </motion.div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {services.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Card className="group shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-2 border-0 h-full">
                  <CardContent className="p-5 md:p-7">
                    <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl ${s.color} flex items-center justify-center mb-4 md:mb-5 group-hover:scale-110 transition-transform duration-300`}>
                      <s.icon className="h-7 w-7 md:h-8 md:w-8" />
                    </div>
                    <h3 className="font-black text-base md:text-lg mb-2 text-foreground">{s.title}</h3>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURED TEACHERS ═══════════════ */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="flex items-end justify-between mb-10 md:mb-14">
            <div>
              <span className="text-sm font-bold text-secondary bg-accent px-4 py-2 rounded-full">نخبة المدرسين</span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground mt-5 mb-2">مدرسون مميزون</h2>
              <p className="text-muted-foreground text-sm md:text-base">أكثر من <span className="font-black text-foreground">1,000</span> حصة ناجحة – نخبة من أفضل المعلمين</p>
            </div>
            <Button variant="outline" className="rounded-xl hidden sm:flex font-bold" asChild>
              <Link to="/search">عرض الكل <ChevronLeft className="mr-1 h-4 w-4" /></Link>
            </Button>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {teachers.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Link to="/booking" className="block h-full">
                  <Card className="shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-2 border-0 overflow-hidden group h-full cursor-pointer">
                    <div className="h-28 md:h-36 relative overflow-hidden">
                      <img src={t.img} alt={t.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" width={512} height={512} />
                      <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-transparent to-transparent" />
                      {/* Badge */}
                      <Badge className="absolute top-2 right-2 bg-gold/90 text-gold-foreground border-0 text-[10px] md:text-xs font-bold backdrop-blur-sm">
                        {t.badge}
                      </Badge>
                      {/* Rating */}
                      <div className="absolute top-2 left-2 bg-card/80 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-black text-foreground">
                        <Star className="h-3 w-3 inline fill-gold text-gold ml-0.5" />{t.rating}
                      </div>
                    </div>
                    <CardContent className="p-3 md:p-5 text-center">
                      <h3 className="font-black text-sm md:text-base text-foreground mb-0.5">{t.name}</h3>
                      <p className="text-xs md:text-sm text-secondary font-bold mb-1">{t.subject}</p>
                      <div className="flex items-center justify-center gap-2 text-[10px] md:text-xs text-muted-foreground mb-3">
                        <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{t.students} طالب</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5"><Video className="h-3 w-3" />{t.sessions} حصة</span>
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm md:text-lg font-black text-primary">{t.price} <span className="text-[10px] md:text-xs font-normal text-muted-foreground">ر.س/ساعة</span></span>
                      </div>
                      <Button className="w-full gradient-cta shadow-button text-secondary-foreground rounded-xl text-xs md:text-sm h-10 md:h-11 font-bold group-hover:shadow-glow transition-all">
                        احجز الآن
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-6 sm:hidden">
            <Button variant="outline" className="rounded-xl font-bold" asChild>
              <Link to="/search">عرض كل المدرسين <ChevronLeft className="mr-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════ AI SECTION ═══════════════ */}
      <section className="py-16 md:py-24 bg-muted/30 overflow-hidden">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <span className="text-sm font-bold text-secondary bg-accent px-4 py-2 rounded-full">
                <Sparkles className="h-3.5 w-3.5 inline ml-1" />
                تقنية الذكاء الاصطناعي
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground mt-5 mb-5">مدرسك الذكي يعرفك أكثر</h2>
              <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
                تقنيات الذكاء الاصطناعي تحلل مستواك وتقترح المدرس الأنسب لك، مع ملخصات تلقائية لكل حصة وتصحيح ذكي للواجبات.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Target, text: "توصيات مدرسين مخصصة حسب مستواك واحتياجاتك" },
                  { icon: Zap, text: "ملخصات وتقارير تلقائية بعد كل حصة" },
                  { icon: CheckCircle, text: "تصحيح الواجبات والمراجعة بالذكاء الاصطناعي" },
                  { icon: Brain, text: "تحليل شامل لنقاط القوة والضعف مع خطة تحسين" },
                ].map((item, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <item.icon className="h-5 w-5 text-secondary" />
                    </div>
                    <span className="text-foreground font-medium text-sm md:text-base">{item.text}</span>
                  </motion.div>
                ))}
              </div>
              <Button className="mt-8 gradient-cta shadow-button text-secondary-foreground rounded-xl px-8 h-12 font-bold" asChild>
                <Link to="/ai-tutor">
                  <Brain className="ml-2 h-5 w-5" />
                  جرّب المدرس الذكي مجاناً
                </Link>
              </Button>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="hidden lg:block">
              <div className="relative">
                <div className="bg-card rounded-3xl shadow-card-hover p-7 border group hover:shadow-2xl transition-all duration-500">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-xl gradient-cta flex items-center justify-center">
                      <Brain className="h-5 w-5 text-secondary-foreground" />
                    </div>
                    <div>
                      <p className="font-black text-sm text-foreground">المدرس الذكي</p>
                      <p className="text-xs text-muted-foreground">يحلل مستواك الآن...</p>
                    </div>
                    <div className="mr-auto">
                      <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                    </div>
                  </div>
                  <div className="space-y-3 mb-5">
                    {[{ label: "الرياضيات", val: 85, color: "gradient-cta" }, { label: "الفيزياء", val: 72, color: "gradient-hero" }].map((p, i) => (
                      <div key={i} className="bg-muted rounded-xl p-4">
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-muted-foreground font-medium">{p.label}</span>
                          <span className="font-black text-foreground">{p.val}%</span>
                        </div>
                        <div className="h-3 bg-background rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${p.val}%` }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.5 + i * 0.2, duration: 1 }}
                            className={`h-full ${p.color} rounded-full`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-accent rounded-xl p-4">
                    <p className="text-xs font-bold text-accent-foreground mb-1">💡 توصية AI</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">ننصحك بالتركيز على الفيزياء مع أ. خالد العتيبي — تقييمه 4.8 وخبرته تتناسب مع مستواك.</p>
                  </div>
                </div>
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.5 }} className="absolute -bottom-4 -right-4 bg-card rounded-xl shadow-card-hover p-3 border">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-secondary" />
                    <span className="text-xs font-black text-foreground">تحسن 23% هذا الشهر</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ URGENCY + COUNTDOWN ═══════════════ */}
      <section className="gradient-warm text-warning-foreground py-5 md:py-6 relative overflow-hidden">
        <div className="container flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
          <div className="flex items-center gap-3 text-base md:text-lg font-black">
            <Clock className="h-5 w-5 animate-pulse-soft" />
            <span>🔥 العرض ينتهي خلال:</span>
          </div>
          <div className="flex gap-3">
            {[
              { val: hours, label: "ساعة" },
              { val: minutes, label: "دقيقة" },
              { val: seconds, label: "ثانية" },
            ].map((t, i) => (
              <div key={i} className="bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-2 text-center min-w-[70px]">
                <p className="text-2xl md:text-3xl font-black">{String(t.val).padStart(2, "0")}</p>
                <p className="text-[10px] opacity-80">{t.label}</p>
              </div>
            ))}
          </div>
          <Button className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-warning-foreground border-0 rounded-xl font-bold backdrop-blur-sm" asChild>
            <Link to="/login">احجز الآن بخصم 50%</Link>
          </Button>
        </div>
      </section>

      {/* ═══════════════ TESTIMONIALS ═══════════════ */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12 md:mb-16">
            <span className="text-sm font-bold text-secondary bg-accent px-4 py-2 rounded-full">آراء المستخدمين</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground mt-5 mb-3">ماذا يقول مستخدمونا؟</h2>
            <p className="text-muted-foreground text-lg md:text-xl">أكثر من <span className="font-black text-foreground">1,000</span> حصة ناجحة – آراء حقيقية من طلاب ومعلمين</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Card className="shadow-card hover:shadow-card-hover transition-all duration-300 border-0 h-full group hover:-translate-y-1">
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-center gap-1.5 mb-4">
                      {Array.from({ length: t.rating }).map((_, j) => (
                        <Star key={j} className="h-5 w-5 fill-gold text-gold" />
                      ))}
                    </div>
                    <p className="text-foreground text-sm md:text-base mb-6 leading-relaxed font-medium">"{t.text}"</p>
                    <div className="flex items-center gap-3 pt-4 border-t">
                      <img
                        src={t.img}
                        alt={t.name}
                        className="w-12 h-12 rounded-2xl object-cover border-2 border-muted"
                        loading="lazy"
                        width={48}
                        height={48}
                      />
                      <div>
                        <p className="font-black text-sm text-foreground">{t.name}</p>
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

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="gradient-hero text-primary-foreground py-16 md:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-40 h-40 rounded-full border border-primary-foreground/20 animate-float" />
          <div className="absolute bottom-10 left-20 w-28 h-28 rounded-full border border-primary-foreground/20 animate-float" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/3 w-20 h-20 rounded-full border border-primary-foreground/20 animate-float" style={{ animationDelay: "2s" }} />
        </div>
        <div className="container text-center relative z-10 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black mb-5 leading-tight">ابدأ رحلتك التعليمية الآن</h2>
            <p className="text-lg md:text-xl opacity-85 mb-8 max-w-lg mx-auto">سجّل مجاناً واحصل على أول حصة بخصم 50% — لا تحتاج بطاقة دفع</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <SmartCTA user={user} />
              <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 text-base md:text-lg rounded-2xl h-14 md:h-16 backdrop-blur-sm font-bold" asChild>
                <Link to="/search">تصفح المدرسين</Link>
              </Button>
            </div>
            <p className="text-sm opacity-60 mt-6 flex items-center justify-center gap-2">
              <Shield className="h-4 w-4" />
              بيئة آمنة 100% – مدرسون معتمدون – ضمان استرداد المبلغ
            </p>
          </motion.div>
        </div>
      </section>

      <Footer />
      <BottomNav />
      <SmartPopup />
    </div>
  );
};

export default Index;
