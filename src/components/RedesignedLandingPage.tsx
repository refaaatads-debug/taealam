import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpLeft,
  BookOpen,
  BookOpenCheck,
  Check,
  ChevronLeft,
  ClipboardCheck,
  GraduationCap,
  Headphones,
  Lightbulb,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Video,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import SanadGuestChat from "@/components/SanadGuestChat";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import heroBanner from "@/assets/hero-banner.jpg";
import mobileAppPreview from "@/assets/mobile-app-preview.png";
import teacher1 from "@/assets/teacher-1.jpg";
import teacher2 from "@/assets/teacher-2.jpg";
import teacher3 from "@/assets/teacher-3.jpg";

export type LandingTeacher = {
  name: string;
  subject: string;
  rating: number;
  students: number;
  price: number;
  img: string;
  badge: string;
  sessions: number;
  hidePrice?: boolean;
};

interface Props {
  user: unknown;
  teachers: LandingTeacher[];
}

const learningPaths = [
  {
    number: "01",
    icon: BookOpen,
    title: "تأسيس متين",
    text: "نراجع المفاهيم الأساسية ونبني المعرفة خطوة بخطوة، بما يناسب مستوى الطالب.",
    detail: "من الفهم إلى التطبيق",
    tone: "mint",
  },
  {
    number: "02",
    icon: Lightbulb,
    title: "فهم يثبت",
    text: "شرح واضح، أمثلة قريبة، ومساحة للأسئلة حتى تصبح الفكرة مفهومة لا محفوظة فقط.",
    detail: "تعلّم على مهل",
    tone: "sand",
  },
  {
    number: "03",
    icon: Target,
    title: "استعداد لهدفك",
    text: "دعم دراسي يساعد الطالب على تنظيم المراجعة والاستعداد للواجبات والاختبارات.",
    detail: "تقدّم بثقة",
    tone: "blue",
  },
];

const packages = [
  {
    title: "حصص فردية",
    eyebrow: "تعلم يناسب احتياجك",
    text: "جلسات مباشرة مع مدرس في المادة التي تختارها، مع مساحة للشرح والتدريب والأسئلة.",
    icon: Video,
    points: ["اختر المادة والمدرس", "تعلّم بإيقاعك", "ابدأ من مستواك"],
    tone: "light",
  },
  {
    title: "تأسيس ومتابعة",
    eyebrow: "خطوات تعلم مترابطة",
    text: "مسار يساعد الطالب على تقوية الأساسيات ومواصلة التعلّم بصورة منتظمة.",
    icon: BookOpenCheck,
    points: ["مراجعة للمفاهيم", "تدريب على التطبيق", "متابعة التقدم"],
    tone: "deep",
  },
  {
    title: "مساندة دراسية",
    eyebrow: "دعم عند الحاجة",
    text: "مساعدة تعليمية مرنة للواجبات والمراجعة، مع توجيه يوضح للطالب خطوته التالية.",
    icon: ClipboardCheck,
    points: ["مراجعة منظمة", "توضيح النقاط الصعبة", "استعداد أفضل للدراسة"],
    tone: "light",
  },
];

const steps = [
  ["01", "أنشئ حسابك", "ابدأ بتحديد احتياجك والمرحلة الدراسية."],
  ["02", "استكشف الخيارات", "تعرّف على المدرسين والمواد المتاحة."],
  ["03", "ابدأ التعلّم", "اختر الوقت المناسب وانطلق في حصتك."],
];

export default function RedesignedLandingPage({ user, teachers }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const ctaTarget = user ? "/search" : "/login";
  const reveal = shouldReduceMotion
    ? { initial: false as const, whileInView: undefined, transition: undefined }
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: "easeOut" as const },
      };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#f7f8f5] text-[#102f50]" dir="rtl">
      <SEOHead
        title="منصة أجيال المعرفة | تعلم بثقة"
        description="تعلّم بثقة مع منصة أجيال المعرفة: حصص مباشرة، تأسيس دراسي، ومدرسون يساعدونك على التقدم."
        canonical="/"
      />
      <Navbar />

      <main>
        <section className="relative isolate overflow-hidden bg-[#f7f8f5]">
          <div className="pointer-events-none absolute -left-28 top-12 h-80 w-80 rounded-full bg-[#d9e9e2]/60 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-8 md:px-8 md:pb-24 md:pt-14 lg:grid-cols-[1fr_1.03fr] lg:gap-14">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
              transition={shouldReduceMotion ? undefined : { duration: 0.65, ease: "easeOut" }}
              className="order-2 lg:order-1"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#188779]/20 bg-[#188779]/[0.07] px-3.5 py-2 text-[11px] font-extrabold text-[#147568]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                تعلّم أقرب إلى هدفك
              </div>
              <h1 className="max-w-xl text-[2.6rem] font-black leading-[1.2] tracking-[-0.045em] md:text-[4.35rem]">
                لكل طالب
                <span className="block text-[#188779]">بداية تستحقها</span>
              </h1>
              <p className="mt-6 max-w-lg text-sm leading-8 text-[#102f50]/70 md:text-base">
                مساحة تعليمية تجمع الطالب بمدرسه المناسب، وتمنحه دعماً واضحاً من تأسيس المهارات إلى مواصلة التقدّم.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={ctaTarget}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#188779] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_30px_-15px_rgba(24,135,121,.7)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#147568] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25"
                >
                  ابدأ رحلتك التعليمية <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/search"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#102f50]/15 bg-white/80 px-6 py-3.5 text-sm font-extrabold transition duration-200 hover:-translate-y-0.5 hover:border-[#188779]/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/20"
                >
                  استكشف المدرسين <Search className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-[11px] font-bold text-[#102f50]/65">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#188779]" aria-hidden="true" />تجربة تعليمية موثوقة</span>
                <span className="inline-flex items-center gap-2"><Headphones className="h-4 w-4 text-[#188779]" aria-hidden="true" />دعم ومساندة</span>
                <span className="inline-flex items-center gap-2"><Video className="h-4 w-4 text-[#188779]" aria-hidden="true" />حصص مباشرة</span>
              </div>
            </motion.div>

            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
              transition={shouldReduceMotion ? undefined : { duration: 0.75, ease: "easeOut" }}
              className="relative order-1 lg:order-2"
            >
              <div className="absolute -inset-3 -rotate-2 rounded-[2.2rem] border border-[#188779]/15 bg-[#e6efea] md:-inset-5" />
              <div className="relative overflow-hidden rounded-[1.8rem] bg-[#102f50] shadow-[0_28px_70px_-35px_rgba(16,47,80,.55)]">
                <img
                  src={heroBanner}
                  alt="طالب يتعلم عن بعد في حصة مباشرة مع مدرسه"
                  className="h-[280px] w-full object-cover sm:h-[360px] lg:h-[440px]"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#102f50]/90 via-[#102f50]/10 to-transparent" />
                <div className="absolute bottom-0 right-0 max-w-md p-6 text-white md:p-9">
                  <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#c3e5dc]">
                    <span className="h-2 w-2 rounded-full bg-[#9bd5c7]" />
                    مساحة يتقدم فيها الفضول
                  </p>
                  <p className="text-2xl font-black leading-snug md:text-3xl">تعلّم من المكان<br />الذي يناسبك</p>
                </div>
              </div>
              <div className="absolute -bottom-5 left-2 rounded-2xl border border-[#102f50]/10 bg-[#fffdf8] p-3.5 shadow-xl sm:left-5 md:-left-4 md:p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5f0eb] text-[#188779]"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
                  <div><p className="text-xs font-extrabold">تعلّم بتواصل مباشر</p><p className="mt-1 text-[10px] text-[#102f50]/55">اسأل، ناقش، وتقدّم</p></div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-[#102f50]/[0.08] bg-white px-5 py-7 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-3">
            {[
              [Search, "اختر ما يناسبك", "ابحث عن مدرس أو مادة وفق احتياجك."],
              [BookOpen, "تعلّم بوضوح", "احصل على شرح وتدريب في حصص مباشرة."],
              [GraduationCap, "واصل التقدّم", "تابع دراستك بخطوات تناسب مستواك."],
            ].map(([Icon, title, text], index) => {
              const FeatureIcon = Icon as typeof Search;
              return (
                <div key={title as string} className={`flex items-center gap-4 ${index !== 2 ? "border-b border-[#102f50]/[0.08] pb-5 sm:border-b-0 sm:border-l sm:pb-0 sm:pl-5" : ""}`}>
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${index === 1 ? "bg-[#f5eddf] text-[#a47b36]" : "bg-[#e6f0eb] text-[#188779]"}`}>
                    <FeatureIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div><h2 className="text-sm font-extrabold">{title as string}</h2><p className="mt-1.5 text-xs leading-6 text-[#102f50]/60">{text as string}</p></div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#edf3ef] px-5 py-16 md:px-8 md:py-24">
          <div className="pointer-events-none absolute -right-20 top-12 h-64 w-64 rounded-full bg-white/75 blur-3xl" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} viewport={{ once: true, margin: "-70px" }} className="max-w-2xl">
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">أساس يبقى معك</p>
              <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">التعلّم يبدأ من <span className="text-[#188779]">فهم الأساس</span></h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#102f50]/65">
                حين يفهم الطالب الفكرة، يصبح مستعداً لبناء مهارات جديدة بثبات. صُممت تجربة أجيال المعرفة لتجعل التعلّم أقرب إلى احتياجه اليومي.
              </p>
            </motion.div>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {learningPaths.map(({ number, icon: Icon, title, text, detail, tone }, index) => (
                <motion.article
                  key={number}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={shouldReduceMotion ? undefined : { duration: 0.45, delay: index * 0.08 }}
                  className="group relative overflow-hidden rounded-[1.5rem] border border-[#102f50]/[0.08] bg-[#fffefa] p-6 shadow-[0_14px_35px_-30px_rgba(16,47,80,.35)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_42px_-30px_rgba(16,47,80,.35)]"
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone === "sand" ? "bg-[#f5eddf] text-[#a47b36]" : tone === "blue" ? "bg-[#e8edf3] text-[#315273]" : "bg-[#e5f0eb] text-[#188779]"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span className="font-mono text-xs font-bold text-[#102f50]/30">{number}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-black">{title}</h3>
                  <p className="mt-2 min-h-[72px] text-sm leading-7 text-[#102f50]/65">{text}</p>
                  <div className="mt-5 flex items-center gap-2 border-t border-[#102f50]/[0.08] pt-4 text-xs font-extrabold text-[#188779]"><Check className="h-4 w-4" aria-hidden="true" />{detail}</div>
                </motion.article>
              ))}
            </div>
            <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[#102f50] px-5 py-5 text-white sm:flex-row sm:items-center md:px-7">
              <p className="max-w-xl text-sm leading-7 text-white/80">لكل مرحلة احتياجها؛ استكشف المواد والمدرسين وابحث عن البداية المناسبة.</p>
              <Link to={ctaTarget} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#b9e4dc] px-5 py-3 text-xs font-extrabold text-[#102f50] transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30">
                اكتشف طريقك <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">باقات تعليمية</p>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">باقة تناسب احتياجك</h2>
            </div>
            <p className="max-w-md text-sm leading-7 text-[#102f50]/60">تعرّف على مسارات الدعم التعليمي، ثم سجّل الدخول لاستكشاف تفاصيل الباقات المتاحة لك.</p>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {packages.map(({ title, eyebrow, text, icon: Icon, points, tone }, index) => (
              <motion.article
                key={title}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={shouldReduceMotion ? undefined : { duration: 0.45, delay: index * 0.07 }}
                className={`flex flex-col rounded-[1.5rem] border p-6 md:p-7 ${tone === "deep" ? "border-[#102f50] bg-[#102f50] text-white shadow-[0_22px_55px_-35px_rgba(16,47,80,.8)] lg:-translate-y-3" : "border-[#102f50]/10 bg-white text-[#102f50]"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone === "deep" ? "bg-white/10 text-[#b9e4dc]" : "bg-[#e6f0eb] text-[#188779]"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className={`text-[10px] font-bold ${tone === "deep" ? "text-white/45" : "text-[#102f50]/35"}`}>{eyebrow}</span>
                </div>
                <h3 className="mt-6 text-xl font-black">{title}</h3>
                <p className={`mt-3 min-h-[84px] text-sm leading-7 ${tone === "deep" ? "text-white/65" : "text-[#102f50]/60"}`}>{text}</p>
                <ul className={`mt-5 space-y-3 border-t pt-5 text-xs font-bold ${tone === "deep" ? "border-white/10 text-white/80" : "border-[#102f50]/[0.08] text-[#102f50]/70"}`}>
                  {points.map((point) => <li key={point} className="flex items-center gap-2.5"><Check className={`h-4 w-4 ${tone === "deep" ? "text-[#b9e4dc]" : "text-[#188779]"}`} aria-hidden="true" />{point}</li>)}
                </ul>
                <Link to={ctaTarget} className={`mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25 ${tone === "deep" ? "bg-[#b9e4dc] text-[#102f50] hover:bg-white" : "border border-[#188779]/25 text-[#147568] hover:bg-[#e6f0eb]"}`}>
                  سجّل واكتشف الخيارات <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </motion.article>
            ))}
          </div>
          <p className="mt-5 text-center text-[11px] leading-6 text-[#102f50]/45">تفاصيل الخيارات والتوفر تظهر بعد تسجيل الدخول، دون عرض أسعار أو التزامات مسبقة هنا.</p>
        </section>

        <section className="overflow-hidden bg-[#faf8f2] px-5 py-16 md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-[.9fr_1.1fr] lg:gap-20">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-70px" }}
              className="relative order-2 flex justify-center md:order-1"
            >
              <div className="absolute bottom-5 h-24 w-56 rounded-full bg-[#188779]/15 blur-2xl" />
              <img src={mobileAppPreview} alt="واجهة تطبيق أجيال المعرفة للجوال" className="relative h-auto w-[220px] max-w-full object-contain drop-shadow-2xl sm:w-[270px]" style={{ clipPath: "inset(1.1% 4.1% 1.7% 4.1% round 8%)" }} loading="lazy" />
            </motion.div>
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, x: 18 }}
              whileInView={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-70px" }}
              className="order-1 md:order-2"
            >
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">تعلمك في متناولك</p>
              <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight md:text-4xl">تابع تفاصيل رحلتك التعليمية من مكان واحد</h2>
              <p className="mt-5 max-w-lg text-sm leading-8 text-[#102f50]/60">تواصل مع مدرسك، تابع حصصك وموادك، واستكشف أدوات المنصة من تجربة مصممة لتبقى واضحة.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  ["01", "تابع حصصك", "رتّب تفاصيل تعلمك في مكان واحد."],
                  ["02", "ابقَ على تواصل", "تواصل مع مدرسك ضمن تجربتك التعليمية."],
                  ["03", "راجع موادك", "ارجع إلى ملفاتك وواجباتك بسهولة."],
                  ["04", "واصل التقدم", "تابع خطوتك التالية بوضوح."],
                ].map(([number, title, text]) => (
                  <div key={number} className="rounded-2xl border border-[#102f50]/10 bg-white p-4">
                    <p className="font-mono text-xs font-bold text-[#188779]">{number}</p>
                    <h3 className="mt-2 text-sm font-extrabold">{title}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-[#102f50]/55">{text}</p>
                  </div>
                ))}
              </div>
              <Link to={ctaTarget} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#188779] px-5 py-3 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#147568] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25">
                ابدأ تجربتك الآن <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </motion.div>
          </div>
        </section>

        <section className="bg-[#102f50] px-5 py-16 text-white md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#b9e4dc]">بداية سهلة وواضحة</p>
              <h2 className="mt-4 text-3xl font-black leading-tight md:text-4xl">رحلتك التعليمية<br /><span className="text-[#b9e4dc]">في ثلاث خطوات</span></h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">من اختيار احتياجك إلى أول حصة، ابدأ حين تكون مستعداً.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {steps.map(([number, title, text], index) => (
                <article key={number} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 transition duration-200 hover:-translate-y-1 hover:bg-white/[0.09]">
                  <p className="font-mono text-3xl font-black text-[#b9e4dc]">{number}</p>
                  <h3 className="mt-7 text-sm font-extrabold">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-white/55">{text}</p>
                  {index < 2 && <ArrowUpLeft className="mt-5 hidden h-4 w-4 text-white/35 sm:block" aria-hidden="true" />}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">مدرسون يساعدونك على التقدم</p><h2 className="mt-3 text-3xl font-black md:text-4xl">ابدأ مع مدرس يناسبك</h2></div>
            <Link to="/search" className="inline-flex items-center gap-1 self-start text-xs font-extrabold text-[#188779] sm:self-auto">تصفح المدرسين <ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          {teachers.length > 0 ? (
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.slice(0, 3).map((teacher, index) => {
                const bookingUrl = `/booking?subject=${encodeURIComponent(teacher.subject)}&day=0`;
                const targetUrl = user ? bookingUrl : `/login?redirect=${encodeURIComponent(bookingUrl)}`;
                return (
                  <Link key={`${teacher.name}-${index}`} to={targetUrl} className="group overflow-hidden rounded-[1.5rem] border border-[#102f50]/10 bg-white transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_-30px_rgba(16,47,80,.4)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25">
                    <div className={`relative p-4 pb-0 ${index === 1 ? "bg-[#e9edf2]" : index === 2 ? "bg-[#f3ecdf]" : "bg-[#e6f0eb]"}`}>
                      <img
                        src={teacher.img}
                        alt={teacher.name}
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = [teacher1, teacher2, teacher3][index];
                        }}
                        className="mx-auto h-48 w-full rounded-t-[1.15rem] object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-sm font-extrabold">{teacher.name}</p><p className="mt-1.5 text-xs text-[#102f50]/55">{teacher.subject}</p></div>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e6f0eb] text-[#188779]"><GraduationCap className="h-4.5 w-4.5" aria-hidden="true" /></span>
                      </div>
                      <span className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[#188779]/25 py-3 text-xs font-extrabold text-[#147568] transition group-hover:bg-[#e6f0eb]">استكشف الحصص <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-9 rounded-3xl border border-dashed border-[#102f50]/20 bg-white px-6 py-10 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-[#188779]" aria-hidden="true" />
              <p className="mt-3 text-sm font-extrabold">اكتشف المدرسين المتاحين</p>
              <p className="mt-2 text-xs text-[#102f50]/55">تصفح المواد والمدرسين في صفحة البحث.</p>
              <Link to="/search" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#188779] px-5 py-3 text-xs font-extrabold text-white">ابحث عن مدرس <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          )}
        </section>

        <section className="mx-5 mb-12 overflow-hidden rounded-[1.75rem] bg-[#e5f0eb] md:mx-auto md:max-w-7xl">
          <div className="grid gap-7 px-6 py-9 sm:px-9 md:grid-cols-[1.2fr_.8fr] md:items-center md:px-12 md:py-12">
            <div><p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">خطوتك التالية تبدأ هنا</p><h2 className="mt-3 max-w-lg text-3xl font-black leading-tight text-[#102f50] md:text-4xl">افتح باباً جديداً للتعلّم</h2><p className="mt-4 max-w-md text-sm leading-7 text-[#102f50]/60">سجّل الدخول لاستكشاف تجربة أجيال المعرفة، أو انضم إلى مجتمعنا التعليمي كمدرس.</p></div>
            <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
              <Link to={ctaTarget} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#188779] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#147568]">ابدأ التعلّم <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              <Link to="/teach-with-us" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#102f50]/15 bg-white px-5 py-3 text-xs font-extrabold text-[#102f50] transition hover:border-[#188779]/40">انضم كمدرس</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <SanadGuestChat />
    </div>
  );
}
