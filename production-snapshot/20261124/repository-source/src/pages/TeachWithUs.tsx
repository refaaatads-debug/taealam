import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  GraduationCap, Clock, DollarSign, Users, Sparkles, ShieldCheck,
  CheckCircle2, Calendar, Video, TrendingUp, Award, ArrowLeft,
  UserPlus, FileCheck, Wallet, Star
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import heroBanner from "@/assets/hero-banner.jpg";
import teacher1 from "@/assets/teacher-1.jpg";
import teacher2 from "@/assets/teacher-2.jpg";
import teacher3 from "@/assets/teacher-3.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const benefits = [
  { icon: Clock, title: "حدد جدولك بنفسك", desc: "اختر الأيام والساعات التي تناسبك. كن مديراً لوقتك ودخلك." },
  { icon: DollarSign, title: "دخل مجزٍ ومستمر", desc: "حدد سعر ساعتك بحرية واحصل على أرباحك بشكل دوري وآمن." },
  { icon: Users, title: "طلاب من كل مكان", desc: "تواصل مع آلاف الطلاب من السعودية والخليج عبر منصة موحّدة." },
  { icon: Video, title: "أدوات تدريس متقدمة", desc: "فيديو HD، سبورة تفاعلية، ومشاركة شاشة — كل ما تحتاجه لحصة احترافية." },
  { icon: Sparkles, title: "ذكاء اصطناعي يساعدك", desc: "تقارير تلقائية بعد كل حصة، ومطابقة ذكية مع الطلاب المناسبين لك." },
  { icon: ShieldCheck, title: "بيئة آمنة وموثوقة", desc: "حماية كاملة لبياناتك، ودعم فني على مدار الساعة." },
];

const steps = [
  { n: "01", icon: UserPlus, title: "أنشئ حسابك كمعلم", desc: "سجّل ببريدك أو حساب Google خلال أقل من دقيقة." },
  { n: "02", icon: FileCheck, title: "أكمل ملفك الشخصي", desc: "أضف خبراتك، شهاداتك، المواد التي تدرّسها، وسعر الساعة." },
  { n: "03", icon: Calendar, title: "حدد جدول التوفّر", desc: "اختر الأيام والساعات التي يمكنك التدريس فيها." },
  { n: "04", icon: Video, title: "ابدأ الحصص", desc: "استقبل الحجوزات، ابدأ التدريس، واستلم أرباحك." },
];

const requirements = [
  "خبرة لا تقل عن سنة في التدريس أو التخصص",
  "اتصال إنترنت جيد، كاميرا وميكروفون عاليي الجودة",
  "إجادة اللغة العربية، ومستوى جيد في مادة التخصص",
  "الالتزام بمواعيد الحصص واحترام الطلاب",
  "الموافقة على شروط وسياسات المنصة",
];

const policy = [
  { title: "العمولة", desc: "تخصم المنصة نسبة عمولة شفافة من قيمة كل حصة، يتم عرضها بوضوح قبل التسعير." },
  { title: "السحب", desc: "يمكنك سحب أرباحك بعد اكتمال الحصص ومراجعتها، عبر تحويل بنكي آمن." },
  { title: "إلغاء الحصص", desc: "إلغاء الحصص من قبل المعلم يجب أن يكون قبل 24 ساعة على الأقل، ويُحتسب ضمن نسبة الالتزام." },
  { title: "الجودة", desc: "يتم تقييم كل حصة من الطالب، وعلى المعلم الحفاظ على متوسط تقييم جيد للاستمرار." },
  { title: "الخصوصية", desc: "يُمنع منعاً باتاً تبادل أرقام التواصل أو الروابط الخارجية مع الطلاب داخل المحادثات." },
];

const stats = [
  { value: "+500", label: "معلم نشط" },
  { value: "+10K", label: "طالب يبحث عن معلم" },
  { value: "4.9", label: "متوسط تقييم المعلمين" },
  { value: "+50K", label: "حصة مكتملة" },
];

const TeachWithUs = () => {
  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0 bg-background" dir="rtl">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBanner} alt="انضم لطاقم المدرسين" className="w-full h-full object-cover" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-l from-primary/95 via-primary/90 to-primary/80" />
        </div>

        <div className="container py-14 md:py-24 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.08 } } }}>
              <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 bg-gold/20 backdrop-blur-sm rounded-full px-4 py-2 text-sm mb-5 border border-gold/30 text-gold font-bold">
                <GraduationCap className="h-4 w-4" />
                <span>للمدرسين والمدربين</span>
              </motion.div>

              <motion.h1 variants={fadeUp} custom={1} className="text-3xl sm:text-5xl md:text-6xl font-black leading-[1.15] mb-5 text-primary-foreground tracking-tight">
                هل ترغب بالتدريس
                <br />
                <span className="opacity-90">أونلاين بمرونة كاملة؟</span>
              </motion.h1>

              <motion.p variants={fadeUp} custom={2} className="text-base md:text-xl opacity-90 mb-8 max-w-xl leading-relaxed text-primary-foreground">
                انضم لطاقم المدرسين في <span className="font-bold">منصة أجيال المعرفة</span> وكن مديراً لوقتك ودخلك.
                شارك خبراتك مع آلاف الطلاب وحقّق دخلاً مستقراً من بيتك.
              </motion.p>

              <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Button
                  size="lg"
                  className="gradient-cta shadow-button text-secondary-foreground text-base md:text-lg px-8 rounded-2xl h-14 md:h-16 w-full sm:w-auto font-black"
                  asChild
                >
                  <Link to="/login?role=teacher&signup=1">
                    <UserPlus className="ml-2 h-5 w-5" />
                    قدّم طلبك مجاناً
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 rounded-2xl h-14 md:h-16 backdrop-blur-md w-full sm:w-auto font-black"
                  asChild
                >
                  <a href="#policy">
                    شروط الانضمام
                  </a>
                </Button>
              </motion.div>

              {/* Trust */}
              <motion.div variants={fadeUp} custom={4} className="flex items-center gap-5 mt-8 pt-8 border-t border-primary-foreground/10">
                <div className="flex -space-x-3 space-x-reverse">
                  {[teacher1, teacher2, teacher3].map((img, i) => (
                    <img key={i} src={img} alt="معلم" className="w-10 h-10 rounded-full border-2 border-primary-foreground/30 object-cover" loading="lazy" />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-gold text-gold" />
                    ))}
                    <span className="text-sm font-bold text-gold mr-1">4.9</span>
                  </div>
                  <p className="text-sm opacity-85 text-primary-foreground font-medium">
                    أكثر من <span className="font-black">500</span> معلم انضموا إلينا
                  </p>
                </div>
              </motion.div>
            </motion.div>

            {/* Stats card */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.6 }} className="hidden lg:block">
              <div className="bg-primary-foreground/10 backdrop-blur-xl rounded-3xl p-8 border border-primary-foreground/20">
                <div className="grid grid-cols-2 gap-6">
                  {stats.map((s, i) => (
                    <div key={i} className="text-primary-foreground">
                      <div className="text-4xl font-black text-gold mb-1">{s.value}</div>
                      <div className="text-sm opacity-85">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-6 border-t border-primary-foreground/15 flex items-center gap-3 text-primary-foreground">
                  <div className="w-10 h-10 rounded-2xl bg-gold/20 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-gold" />
                  </div>
                  <p className="text-sm">
                    <span className="font-black">دخل شهري متوسط</span>
                    <br />
                    <span className="opacity-85">للمعلم النشط على المنصة</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mobile stats */}
      <section className="container py-8 lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s, i) => (
            <Card key={i} className="border-0 shadow-card">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-black text-secondary mb-1">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="container py-12 md:py-20">
        <div className="text-center mb-10 md:mb-14">
          <Badge className="bg-secondary/10 text-secondary border-0 mb-3">المميزات</Badge>
          <h2 className="text-3xl md:text-5xl font-black mb-4">لماذا تنضم إلينا؟</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            كل ما تحتاجه لتدرّس باحترافية وتنمّي دخلك في مكان واحد.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {benefits.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
            >
              <Card className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300 h-full">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center mb-4">
                    <b.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-black mb-2">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="bg-muted/30 py-12 md:py-20">
        <div className="container">
          <div className="text-center mb-10 md:mb-14">
            <Badge className="bg-gold/10 text-gold border-0 mb-3">الخطوات</Badge>
            <h2 className="text-3xl md:text-5xl font-black mb-4">كيف تنضم كمعلم؟</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">4 خطوات بسيطة وستكون جاهزاً لاستقبال طلابك الأوائل.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <Card className="border-0 shadow-card h-full relative overflow-hidden">
                  <CardContent className="p-6">
                    <div className="absolute -top-3 -left-3 text-7xl font-black text-secondary/10 select-none">{s.n}</div>
                    <div className="relative">
                      <div className="w-12 h-12 rounded-2xl gradient-cta text-secondary-foreground flex items-center justify-center mb-4">
                        <s.icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-black mb-2">{s.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="container py-12 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div>
            <Badge className="bg-primary/10 text-primary border-0 mb-3">الشروط</Badge>
            <h2 className="text-3xl md:text-4xl font-black mb-4">شروط الانضمام كمعلم</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              نسعى لتقديم أفضل تجربة تعليمية لطلابنا، لذلك نختار معلمينا بعناية. تحقّق من الشروط التالية:
            </p>
            <ul className="space-y-3">
              {requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <Card className="border-0 shadow-card-hover bg-gradient-to-br from-secondary/5 to-primary/5">
            <CardContent className="p-6 md:p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-gold/15 text-gold flex items-center justify-center">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black">ماذا نقدم لك؟</h3>
              </div>
              <ul className="space-y-3 text-sm">
                {[
                  "ملف شخصي احترافي يعزّز من فرص اختيارك",
                  "أدوات تدريس متطورة (سبورة، فيديو، AI)",
                  "تقارير ذكية بعد كل حصة",
                  "نظام دفع آمن وسحب سريع للأرباح",
                  "دعم فني متواصل ومجتمع معلمين متعاون",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Policy */}
      <section id="policy" className="bg-muted/30 py-12 md:py-20">
        <div className="container">
          <div className="text-center mb-10">
            <Badge className="bg-secondary/10 text-secondary border-0 mb-3">السياسات</Badge>
            <h2 className="text-3xl md:text-5xl font-black mb-4">شروط وأحكام الانضمام</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              نحرص على الشفافية الكاملة. اطّلع على أهم البنود قبل التسجيل.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid gap-4">
            {policy.map((p, i) => (
              <Card key={i} className="border-0 shadow-card">
                <CardContent className="p-5 md:p-6 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-black mb-1">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link to="/terms" className="text-secondary font-bold hover:underline inline-flex items-center gap-1">
              قراءة الشروط الكاملة
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container py-12 md:py-20">
        <Card className="border-0 shadow-card-hover overflow-hidden">
          <div className="gradient-cta p-8 md:p-14 text-center text-secondary-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-4 opacity-90" />
            <h2 className="text-3xl md:text-5xl font-black mb-4">جاهز لبدء رحلتك معنا؟</h2>
            <p className="text-base md:text-lg opacity-90 mb-8 max-w-2xl mx-auto">
              قدّم طلبك الآن مجاناً. خلال دقائق ستكون جاهزاً لاستقبال طلابك الأوائل.
            </p>
            <Button
              size="lg"
              className="bg-card text-foreground hover:bg-card/90 rounded-2xl h-14 md:h-16 px-10 font-black text-base md:text-lg shadow-button"
              asChild
            >
              <Link to="/login?role=teacher&signup=1">
                <UserPlus className="ml-2 h-5 w-5" />
                قدّم طلبك مجاناً
              </Link>
            </Button>
          </div>
        </Card>
      </section>

      <Footer />
      <BottomNav />
    </div>
  );
};

export default TeachWithUs;
