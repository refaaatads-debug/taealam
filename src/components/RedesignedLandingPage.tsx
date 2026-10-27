import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowUpLeft, BookOpen, Check, ChevronLeft, GraduationCap,
  Headphones, Lightbulb, MessageCircle, Search, ShieldCheck, Sparkles,
  Star, Target, Video,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import SanadGuestChat from "@/components/SanadGuestChat";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import heroBanner from "@/assets/ajyal-homepage-hero.jpg";
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

interface Props { user: unknown; teachers: LandingTeacher[] }

const learningPaths = [
  { number: "01", icon: BookOpen, title: "تأسيس متين", text: "نراجع المفاهيم الأساسية ونبني المعرفة خطوة بخطوة، بما يناسب مستوى الطالب.", detail: "من الفهم إلى التطبيق", tone: "mint" },
  { number: "02", icon: Lightbulb, title: "فهم يثبت", text: "شرح واضح، أمثلة قريبة، ومساحة للأسئلة حتى تصبح الفكرة مفهومة لا محفوظة فقط.", detail: "تعلّم على مهل", tone: "sand" },
  { number: "03", icon: Target, title: "استعداد لهدفك", text: "دعم دراسي يساعد الطالب على تنظيم المراجعة والاستعداد للواجبات والاختبارات.", detail: "تقدّم بثقة", tone: "blue" },
];
const steps = [
  ["01", "أنشئ حسابك", "ابدأ بتحديد احتياجك والمرحلة الدراسية."],
  ["02", "استكشف الخيارات", "تعرّف على المدرسين والمواد المتاحة."],
  ["03", "ابدأ التعلّم", "اختر الوقت المناسب وانطلق في حصتك."],
];
const fallbackImages = [teacher1, teacher2, teacher3];

export default function RedesignedLandingPage({ user, teachers }: Props) {
  const reduceMotion = useReducedMotion();
  const ctaTarget = user ? "/search" : "/login";
  const reveal = reduceMotion ? { initial: false as const } : { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5 } };

  return (
    <div className="ajyal-homepage min-h-[100dvh] overflow-x-hidden bg-[#fbfcfd] text-[#17344d]" dir="rtl">
      <SEOHead title="منصة أجيال المعرفة | تعلم بثقة" description="تعلّم بثقة مع منصة أجيال المعرفة: حصص مباشرة، تأسيس دراسي، ومدرسون يساعدونك على التقدم." canonical="/" />
      <Navbar />
      <main>
        <section className="relative isolate overflow-hidden bg-[#fbfcfd]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-36 -top-36 h-[34rem] w-[34rem] rounded-full bg-[#f5f8f8] blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-20 pt-8 md:px-8 md:pb-28 md:pt-14 lg:grid-cols-[.92fr_1.08fr] lg:gap-16">
            <motion.div initial={reduceMotion ? false : { opacity: 0, x: 20 }} animate={reduceMotion ? undefined : { opacity: 1, x: 0 }} transition={{ duration: .6 }} className="order-2 lg:order-1">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#17796f]/20 bg-[#e8f3ee] px-4 py-2 text-xs font-extrabold text-[#176d64]"><Sparkles className="h-4 w-4" aria-hidden="true" /> تعلّم أقرب إلى هدفك</p>
              <h1 className="max-w-2xl text-[2.8rem] font-black leading-[1.18] tracking-[-.045em] md:text-[4.7rem]">لكل طالب<br /><span className="relative text-[#14776d] after:absolute after:-bottom-1 after:right-0 after:h-[5px] after:w-2/3 after:rounded-full after:bg-[#e3b96c]">بداية تستحقها</span></h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-[#17344d]/70 md:text-lg">مساحة تعليمية تجمع الطالب بمدرسه المناسب، وتمنحه دعماً واضحاً من تأسيس المهارات إلى مواصلة التقدّم.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to={ctaTarget} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-[#16776c] px-7 py-4 text-sm font-extrabold text-white shadow-[0_14px_30px_-18px_rgba(22,119,108,.8)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#105f58] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16776c]/25">ابدأ رحلتك التعليمية <ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
                <Link to="/search" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[#17344d]/15 bg-white px-6 py-4 text-sm font-extrabold transition hover:border-[#16776c]/50 hover:bg-[#f6faf7] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16776c]/20"><Search className="h-4 w-4" aria-hidden="true" /> استكشف المدرسين</Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-[#17344d]/70">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#16776c]" aria-hidden="true" />تجربة تعليمية موثوقة</span>
                <span className="inline-flex items-center gap-2"><Headphones className="h-4 w-4 text-[#16776c]" aria-hidden="true" />دعم ومساندة</span>
                <span className="inline-flex items-center gap-2"><Video className="h-4 w-4 text-[#16776c]" aria-hidden="true" />حصص مباشرة</span>
              </div>
            </motion.div>
            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: .97 }} animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }} transition={{ duration: .7 }} className="relative order-1 lg:order-2">
              <div aria-hidden="true" className="absolute -inset-4 rotate-2 rounded-[2rem] border border-[#dfbd7c]/35 bg-[#f8f9f8] md:-inset-6" />
              <div className="relative overflow-hidden rounded-[1.6rem] bg-[#17344d] shadow-[0_30px_70px_-38px_rgba(23,52,77,.7)]">
                <img src={heroBanner} alt="طالب سعودي يتعلم عن بعد في حصة مباشرة مع مدرسه" className="h-[250px] w-full object-cover object-center sm:h-[390px] lg:h-[510px]" loading="eager" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#102d43]/85 via-transparent to-[#102d43]/5" />
                <div className="absolute bottom-0 right-0 p-6 text-white md:p-9">
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold text-[#d7eee4]"><span className="h-2 w-2 rounded-full bg-[#a5d9c5]" /> مساحة يتقدم فيها الفضول</p>
                  <p className="text-2xl font-black leading-snug md:text-3xl">تعلّم من المكان<br />الذي يناسبك</p>
                </div>
                <div className="absolute right-5 top-5 hidden items-center gap-3 rounded-xl border border-white/40 bg-white/90 px-4 py-3 text-[#17344d] shadow-lg backdrop-blur sm:flex">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8f3ee] text-[#16776c]"><Video className="h-4 w-4" aria-hidden="true" /></span>
                  <span><b className="block text-xs">حصص مباشرة</b><small className="mt-1 block text-[10px] text-[#17344d]/60">تواصل وتعلّم بوضوح</small></span>
                </div>
              </div>
              <div className="absolute -bottom-5 left-3 rounded-2xl border border-[#17344d]/10 bg-[#fffefa] p-3.5 shadow-xl sm:left-6 md:-left-5 md:p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#16776c]"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-extrabold">تعلّم بتواصل مباشر</p><p className="mt-1 text-[10px] text-[#17344d]/55">اسأل، ناقش، وتقدّم</p></div></div></div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-[#17344d]/[.08] bg-white px-5 py-7 md:px-8 md:py-9">
          <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-3">
            {[[Search, "اختر ما يناسبك", "ابحث عن مدرس أو مادة وفق احتياجك."], [BookOpen, "تعلّم بوضوح", "احصل على شرح وتدريب في حصص مباشرة."], [GraduationCap, "واصل التقدّم", "تابع دراستك بخطوات تناسب مستواك."]].map(([Icon, title, text], i) => {
              const FeatureIcon = Icon as typeof Search;
              return <div key={title as string} className={`flex items-center gap-4 ${i < 2 ? "border-b border-[#17344d]/[.08] pb-5 sm:border-b-0 sm:border-l sm:pb-0 sm:pl-5" : ""}`}><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${i === 1 ? "bg-[#f6f0e3] text-[#a17c3e]" : "bg-[#e7f2ed] text-[#16776c]"}`}><FeatureIcon className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="text-sm font-extrabold">{title as string}</h2><p className="mt-1.5 text-xs leading-6 text-[#17344d]/60">{text as string}</p></div></div>;
            })}
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#fbfcfd] px-5 py-16 md:px-8 md:py-24">
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="max-w-2xl">
              <p className="text-xs font-extrabold tracking-[.12em] text-[#16776c]">أساس يبقى معك</p>
              <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">التعلّم يبدأ من <span className="text-[#16776c]">فهم الأساس</span></h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#17344d]/65">حين يفهم الطالب الفكرة، يصبح مستعداً لبناء مهارات جديدة بثبات. صُممت تجربة أجيال المعرفة لتجعل التعلّم أقرب إلى احتياجه اليومي.</p>
            </motion.div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {learningPaths.map(({ number, icon: Icon, title, text, detail, tone }, i) => <motion.article key={number} initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: .4, delay: i * .07 }} className="group rounded-[1.35rem] border border-[#17344d]/[.08] bg-[#fffefa] p-6 shadow-[0_12px_35px_-30px_rgba(23,52,77,.35)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-30px_rgba(23,52,77,.45)]">
                <div className="flex items-center justify-between"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone === "sand" ? "bg-[#f5eddf] text-[#9a7434]" : tone === "blue" ? "bg-[#e6edf1] text-[#315273]" : "bg-[#e5f0eb] text-[#16776c]"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="font-mono text-xs font-bold text-[#17344d]/30">{number}</span></div>
                <h3 className="mt-6 text-lg font-black">{title}</h3><p className="mt-2 min-h-[72px] text-sm leading-7 text-[#17344d]/65">{text}</p><div className="mt-5 flex items-center gap-2 border-t border-[#17344d]/[.08] pt-4 text-xs font-extrabold text-[#16776c]"><Check className="h-4 w-4" aria-hidden="true" />{detail}</div>
              </motion.article>)}
            </div>
            <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[#17344d] px-5 py-5 text-white sm:flex-row sm:items-center md:px-7"><p className="max-w-xl text-sm leading-7 text-white/80">لكل مرحلة احتياجها؛ استكشف المواد والمدرسين وابحث عن البداية المناسبة.</p><Link to={ctaTarget} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#c5e5d8] px-5 py-3 text-xs font-extrabold text-[#17344d] transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30">اكتشف طريقك <ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link></div>
          </div>
        </section>

        <section className="overflow-hidden bg-[#fbfcfd] px-5 py-16 md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-[.85fr_1.15fr] lg:gap-20">
            <motion.div {...reveal} className="relative order-2 flex justify-center md:order-1"><div className="absolute bottom-5 h-24 w-56 rounded-full bg-[#16776c]/15 blur-2xl" /><img src={mobileAppPreview} alt="واجهة تطبيق أجيال المعرفة للجوال" className="relative h-auto w-[220px] max-w-full object-contain drop-shadow-2xl sm:w-[270px]" style={{ clipPath: "inset(1.1% 4.1% 1.7% 4.1% round 8%)" }} loading="lazy" /></motion.div>
            <motion.div {...reveal} className="order-1 md:order-2"><p className="text-xs font-extrabold tracking-[.12em] text-[#16776c]">تعلمك في متناولك</p><h2 className="mt-4 max-w-xl text-3xl font-black leading-tight md:text-4xl">تابع تفاصيل رحلتك التعليمية من مكان واحد</h2><p className="mt-5 max-w-lg text-sm leading-8 text-[#17344d]/65">تواصل مع مدرسك، تابع حصصك وموادك، واستكشف أدوات المنصة من تجربة مصممة لتبقى واضحة.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">{[["01", "تابع حصصك", "رتّب تفاصيل تعلمك في مكان واحد."], ["02", "ابقَ على تواصل", "تواصل مع مدرسك ضمن تجربتك التعليمية."], ["03", "راجع موادك", "ارجع إلى ملفاتك وواجباتك بسهولة."], ["04", "واصل التقدم", "تابع خطوتك التالية بوضوح."]].map(([n, title, text]) => <div key={n} className="rounded-2xl border border-[#17344d]/10 bg-white p-4"><p className="font-mono text-xs font-bold text-[#16776c]">{n}</p><h3 className="mt-2 text-sm font-extrabold">{title}</h3><p className="mt-1 text-[11px] leading-5 text-[#17344d]/60">{text}</p></div>)}</div>
              <Link to={ctaTarget} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#16776c] px-5 py-3 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#105f58] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16776c]/25">ابدأ تجربتك الآن <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </motion.div>
          </div>
        </section>

        <section className="bg-[#f6f9fa] px-5 py-16 text-[#17344d] md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="text-xs font-extrabold tracking-[.12em] text-[#16776c]">بداية سهلة وواضحة</p><h2 className="mt-4 text-3xl font-black leading-tight md:text-4xl">رحلتك التعليمية<br /><span className="text-[#16776c]">في ثلاث خطوات</span></h2><p className="mt-5 max-w-sm text-sm leading-7 text-[#17344d]/65">من اختيار احتياجك إلى أول حصة، ابدأ حين تكون مستعداً.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">{steps.map(([num, title, text], i) => <article key={num} className="rounded-2xl border border-[#17344d]/10 bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg"><p className="font-mono text-3xl font-black text-[#16776c]">{num}</p><h3 className="mt-7 text-sm font-extrabold">{title}</h3><p className="mt-2 text-xs leading-6 text-[#17344d]/65">{text}</p>{i < 2 && <ArrowUpLeft className="mt-5 hidden h-4 w-4 text-[#17344d]/35 sm:block" aria-hidden="true" />}</article>)}</div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold tracking-[.12em] text-[#16776c]">مدرسون يساعدونك على التقدم</p><h2 className="mt-3 text-3xl font-black md:text-4xl">ابدأ مع مدرس يناسبك</h2><p className="mt-3 max-w-xl text-sm leading-7 text-[#17344d]/60">تعرّف على مجموعة من المدرسين واختر من يساعدك على التقدم في مادتك.</p></div><Link to="/search" className="inline-flex items-center gap-1 self-start text-xs font-extrabold text-[#16776c] sm:self-auto">تصفح المدرسين <ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link></div>
          {teachers.length > 0 ? <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{teachers.slice(0, 3).map((teacher, i) => {
            const bookingUrl = `/booking?subject=${encodeURIComponent(teacher.subject)}&day=0`;
            const targetUrl = user ? bookingUrl : `/login?redirect=${encodeURIComponent(bookingUrl)}`;
            return <Link key={`${teacher.name}-${i}`} to={targetUrl} className="group overflow-hidden rounded-[1.45rem] border border-[#17344d]/10 bg-white transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_48px_-32px_rgba(23,52,77,.55)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16776c]/25">
              <div className={`relative overflow-hidden p-3 pb-0 ${i === 1 ? "bg-[#e9edf2]" : i === 2 ? "bg-[#f3ecdf]" : "bg-[#e7f2ed]"}`}><img src={teacher.img} alt={teacher.name} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = fallbackImages[i % fallbackImages.length]; }} className="h-[220px] w-full rounded-t-[1.05rem] object-cover object-top transition-transform duration-300 group-hover:scale-[1.025]" loading="lazy" /><span className="absolute right-6 top-6 rounded-full bg-[#fffefa]/95 px-3 py-1.5 text-[10px] font-extrabold text-[#176d64] shadow-sm">{teacher.badge}</span></div>
              <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-base font-extrabold">{teacher.name}</p><p className="mt-1.5 text-xs text-[#17344d]/60">{teacher.subject}</p></div><div className="flex items-center gap-1 rounded-lg bg-[#faf4e7] px-2.5 py-1.5 text-xs font-extrabold text-[#8b6a31]"><Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />{teacher.rating.toFixed(1)}</div></div>
                <div className="mt-4 flex items-center gap-4 border-t border-[#17344d]/[.08] pt-4 text-[11px] text-[#17344d]/60"><span>{teacher.sessions.toLocaleString("ar-SA")} حصة</span><span>{teacher.students.toLocaleString("ar-SA")} طالب</span>{!teacher.hidePrice && <span className="mr-auto font-extrabold text-[#17344d]">{teacher.price.toLocaleString("ar-SA")} ر.س / ساعة</span>}</div>
                <span className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#16776c]/25 py-3 text-xs font-extrabold text-[#176d64] transition group-hover:bg-[#e8f3ee]">استكشف الحصص <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></span>
              </div>
            </Link>;
          })}</div> : <div className="mt-9 rounded-3xl border border-dashed border-[#17344d]/20 bg-white px-6 py-10 text-center"><GraduationCap className="mx-auto h-8 w-8 text-[#16776c]" aria-hidden="true" /><p className="mt-3 text-sm font-extrabold">اكتشف المدرسين المتاحين</p><p className="mt-2 text-xs text-[#17344d]/60">تصفح المواد والمدرسين في صفحة البحث.</p><Link to="/search" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#16776c] px-5 py-3 text-xs font-extrabold text-white">ابحث عن مدرس <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>}
        </section>

        <section className="mx-5 mb-12 overflow-hidden rounded-[1.75rem] border border-[#17344d]/10 bg-white md:mx-auto md:max-w-7xl">
          <div className="grid gap-7 px-6 py-9 sm:px-9 md:grid-cols-[1.2fr_.8fr] md:items-center md:px-12 md:py-12"><div><p className="text-xs font-extrabold tracking-[.12em] text-[#16776c]">خطوتك التالية تبدأ هنا</p><h2 className="mt-3 max-w-lg text-3xl font-black leading-tight text-[#17344d] md:text-4xl">افتح باباً جديداً للتعلّم</h2><p className="mt-4 max-w-md text-sm leading-7 text-[#17344d]/65">سجّل الدخول لاستكشاف تجربة أجيال المعرفة، أو انضم إلى مجتمعنا التعليمي كمدرس.</p></div><div className="flex flex-col gap-3 sm:flex-row md:justify-end"><Link to={ctaTarget} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#16776c] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#105f58]">ابدأ التعلّم <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></Link><Link to="/teach-with-us" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#17344d]/15 bg-white px-5 py-3 text-xs font-extrabold text-[#17344d] transition hover:border-[#16776c]/40">انضم كمدرس</Link></div></div>
        </section>
      </main>
      <Footer />
      <SanadGuestChat />
    </div>
  );
}
