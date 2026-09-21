import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpLeft,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  ClipboardList,
  GraduationCap,
  Headphones,
  Quote,
  Search,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Star,
  UsersRound,
  Video,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import SanadGuestChat from "@/components/SanadGuestChat";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import heroBanner from "@/assets/hero-banner.jpg";
import mobileAppPreview from "@/assets/mobile-app-preview.png";
import testimonial1 from "@/assets/testimonial-1.jpg";
import testimonial2 from "@/assets/testimonial-2.jpg";
import testimonial3 from "@/assets/testimonial-3.jpg";

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

const capabilities = [
  { icon: Search, title: "اختر ما يناسبك", text: "ابحث عن مدرس أو مادة أو مستوى يناسب هدفك." },
  { icon: CalendarDays, title: "احجز بمرونة", text: "اختر الموعد المناسب وابدأ بخطوة بسيطة." },
  { icon: Video, title: "تعلّم بتركيز", text: "حصة مباشرة وأدوات تساعدك على التقدم." },
];

const platformStats = [
  { icon: Clock3, value: "+100,000", label: "الساعة التعليمية" },
  { icon: UsersRound, value: "+1,500", label: "المدرسين" },
  { icon: GraduationCap, value: "+6,700", label: "الطلاب" },
  { icon: ClipboardList, value: "+150", label: "الاختبارات" },
  { icon: BookOpenCheck, value: "+4,000", label: "المواد" },
];

const landingFeatures = [
  { icon: GraduationCap, title: "تعلم فردي", text: "تواصل مع مدرس يناسب مستواك وأسلوبك." },
  { icon: BookOpen, title: "محتوى ومتابعة", text: "أدوات وواجبات تساعدك على تثبيت المعرفة." },
  { icon: Headphones, title: "دعم حين تحتاجه", text: "تجربة منظمة من الحجز حتى نهاية الحصة." },
];

const testimonials = [
  {
    name: "أبو غازي",
    role: "ولية أمر",
    quote: "ولدي معلمته محترمة جداً، لاحظنا فرقاً واضحاً في مستواه وثقته بنفسه منذ بدأ الحصص.",
    image: testimonial1,
  },
  {
    name: "أم خالد",
    role: "ولية أمر",
    quote: "الجدولة سهلة والمتابعة مستمرة. وجدنا مدرساً مناسباً لابننا وكانت الحصص منظمة ومفيدة.",
    image: testimonial2,
  },
  {
    name: "أبو حليمة",
    role: "ولي أمر",
    quote: "ابنتي أصبحت أكثر حماساً للتعلم، والتواصل مع المعلمة واضح ومريح من أول حصة.",
    image: testimonial3,
  },
];

export default function RedesignedLandingPage({ user, teachers }: Props) {
  const ctaTarget = user ? "/search" : "/login";

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f9f8] text-[#102f50]" dir="rtl">
      <SEOHead
        title="منصة أجيال المعرفة | تعلم بثقة"
        description="منصة تعليمية تربطك بمدرسين معتمدين في حصص مباشرة، وتمنحك أدوات واضحة لتتقدم في كل خطوة."
        canonical="/"
      />

      <Navbar />

      <main>
        <section className="mx-auto max-w-7xl px-5 pb-14 pt-8 md:px-8 md:pb-24 md:pt-14">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55 }} className="order-2 lg:order-1">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#188779]/20 bg-[#188779]/[0.07] px-3 py-1.5 text-[11px] font-black text-[#188779]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#188779]" />
                تعلم أقرب إلى هدفك
              </div>
              <h1 className="max-w-xl text-4xl font-black leading-[1.22] tracking-tight md:text-6xl">
                مدرسك المناسب
                <br />
                <span className="text-[#188779]">يغيّر طريقة تعلّمك</span>
              </h1>
              <p className="mt-6 max-w-lg text-sm leading-8 text-[#102f50]/65 md:text-base">
                منصة تعليمية تربطك بمدرسين معتمدين في حصص مباشرة، وتمنحك أدوات واضحة لتتقدم في كل خطوة.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to={ctaTarget} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#188779] px-6 py-4 text-sm font-black text-white shadow-xl shadow-[#188779]/20 transition hover:-translate-y-0.5">
                  ابدأ رحلتك التعليمية <ArrowLeft className="h-4 w-4" />
                </Link>
                <Link to="/search" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#102f50]/15 bg-white px-6 py-4 text-sm font-black transition hover:-translate-y-0.5 hover:border-[#188779]/40">
                  استكشف المدرسين <Search className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-4 text-[11px] font-bold text-[#102f50]/60">
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#188779]" />مدرسون معتمدون</span>
                <span className="flex items-center gap-1.5"><Headphones className="h-4 w-4 text-[#188779]" />دعم مستمر</span>
                <span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[#188779]" />تعلم أكثر ذكاءً</span>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.65 }} className="relative order-1 lg:order-2">
              <div className="relative overflow-hidden rounded-[2rem] bg-[#102f50] shadow-2xl shadow-[#102f50]/20">
                <img src={heroBanner} alt="تجربة تعلم مباشرة" className="h-[300px] w-full object-cover opacity-65 md:h-[440px]" fetchPriority="high" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#102f50] via-[#102f50]/30 to-transparent" />
                <div className="absolute bottom-0 right-0 p-6 text-white md:p-8">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-bold text-[#b9e4dc]"><span className="h-2 w-2 rounded-full bg-[#b9e4dc]" />تجربة تعليمية مباشرة</div>
                  <p className="max-w-sm text-2xl font-black leading-snug md:text-3xl">تعلم من المكان<br />الذي يناسبك</p>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-3 rounded-2xl border border-[#102f50]/10 bg-white p-4 shadow-xl md:-left-7">
                <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f1ef] text-[#188779]"><Video className="h-5 w-5" /></span><div><p className="text-xs font-black">حصص مباشرة</p><p className="mt-0.5 text-[10px] text-[#102f50]/55">بوضوح وتفاعل</p></div></div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-[#102f50]/10 bg-white px-5 py-5 md:px-8">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 md:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text }, index) => (
              <div key={title} className="flex items-center gap-3 border-b border-[#102f50]/10 py-3 last:border-0 md:border-b-0 md:border-l md:px-6 md:first:pr-0 md:last:border-l-0">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${index === 1 ? "bg-[#f7efe1] text-[#ad7a20]" : "bg-[#e8f1ef] text-[#188779]"}`}><Icon className="h-4.5 w-4.5" /></span>
                <div><p className="text-xs font-black">{title}</p><p className="mt-1 text-[10px] text-[#102f50]/55">{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#eef3ff] px-5 py-12 md:px-8 md:py-16">
          <div className="absolute -left-16 top-6 h-44 w-44 rounded-full bg-white/70 blur-3xl" />
          <div className="absolute -right-12 bottom-0 h-52 w-52 rounded-full bg-[#dfe8ff] blur-2xl" />
          <div className="relative mx-auto max-w-7xl">
            <div className="text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#188779]">أرقام نفتخر بها</p>
              <h2 className="mt-3 text-2xl font-black text-[#102f50] md:text-3xl">نتائج حقيقية تصنع فرقًا</h2>
              <p className="mx-auto mt-3 max-w-xl text-xs leading-6 text-[#102f50]/55 md:text-sm">
                مجتمع تعليمي ينمو كل يوم ليمنح الطالب والمعلم تجربة أوضح وأكثر فاعلية.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {platformStats.map(({ icon: Icon, value, label }) => (
                <div key={label} className="group flex items-center gap-3 rounded-[1.35rem] border border-white/80 bg-white px-4 py-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-[#102f50]/[0.06] lg:flex-col lg:items-center lg:justify-center lg:gap-2 lg:py-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0f0] text-[#f06b6b] transition-transform group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="lg:text-center">
                    <p className="text-xl font-black tracking-tight text-[#102f50] md:text-2xl">{value}</p>
                    <p className="mt-0.5 text-[11px] font-bold text-[#102f50]/50">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#188779]">تجربة مصممة لك</p><h2 className="mt-3 text-3xl font-black md:text-4xl">كل ما تحتاجه لتتقدم</h2></div>
            <p className="max-w-sm text-xs leading-6 text-[#102f50]/55">لا نضع كل شيء أمامك دفعة واحدة. نرشدك إلى الخطوة التالية بوضوح.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {landingFeatures.map(({ icon: Icon, title, text }, index) => (
              <div key={title} className="group rounded-3xl border border-[#102f50]/10 bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#102f50]/[0.06]">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${index === 1 ? "bg-[#eef0f8] text-[#4f6094]" : "bg-[#e8f1ef] text-[#188779]"}`}><Icon className="h-5 w-5" /></div>
                <h3 className="mt-6 text-base font-black">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-[#102f50]/55">{text}</p>
                <Link to={index === 0 ? "/search" : index === 1 ? "/student/assignments" : "/help"} className="mt-6 inline-flex items-center gap-1 text-[11px] font-black text-[#188779]">اكتشف المزيد <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" /></Link>
              </div>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#fff1d8] px-5 py-16 md:px-8 md:py-20">
          <div className="absolute -left-20 top-8 h-56 w-56 rounded-full bg-white/60 blur-3xl" />
          <div className="absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-[#f7dca9]/50 blur-3xl" />
          <div className="relative mx-auto max-w-7xl">
            <div className="text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d88418]">آراء أولياء الأمور</p>
              <h2 className="mt-3 text-2xl font-black text-[#102f50] md:text-3xl">نتائج يلاحظها من يعيش التجربة</h2>
              <p className="mx-auto mt-3 max-w-xl text-xs leading-6 text-[#102f50]/60 md:text-sm">
                نعمل على أن تكون كل حصة خطوة واضحة يشعر بها الطالب وولي الأمر.
              </p>
            </div>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {testimonials.map((testimonial) => (
                <article key={testimonial.name} className="flex min-h-[230px] flex-col rounded-[1.35rem] border border-white/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#102f50]/[0.08]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={testimonial.image} alt="" className="h-11 w-11 rounded-full object-cover ring-4 ring-[#fff1d8]" loading="lazy" />
                      <div>
                        <p className="text-sm font-black text-[#102f50]">{testimonial.name}</p>
                        <p className="mt-0.5 text-[10px] font-bold text-[#102f50]/50">{testimonial.role}</p>
                      </div>
                    </div>
                    <Quote className="h-7 w-7 text-[#d88418]/35" />
                  </div>
                  <div className="mt-5 flex gap-1 text-[#e9a536]">
                    {Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-3.5 w-3.5 fill-current" />)}
                  </div>
                  <p className="mt-4 text-xs leading-7 text-[#102f50]/70">“{testimonial.quote}”</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="mobile-app" className="scroll-mt-24 overflow-hidden bg-[#fbf8f7] px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              className="relative order-2 flex justify-center md:order-1"
            >
              <div className="absolute bottom-6 h-24 w-56 rounded-full bg-[#188779]/15 blur-2xl" />
              <img
                src={mobileAppPreview}
                alt="واجهة تطبيق أجيال المعرفة للجوال"
                className="relative h-auto w-[230px] max-w-full object-contain drop-shadow-2xl sm:w-[275px]"
                loading="lazy"
              />
              <div className="absolute -right-2 top-16 hidden items-center gap-2 rounded-2xl border border-[#102f50]/10 bg-white px-3 py-2 shadow-lg sm:flex md:-right-8">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e8f1ef] text-[#188779]"><Smartphone className="h-4 w-4" /></span>
                <span className="text-[10px] font-black text-[#102f50]">تعلمك معك أينما كنت</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              className="order-1 md:order-2"
            >
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#188779]">تطبيق أجيال المعرفة</p>
              <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight text-[#102f50] md:text-4xl">
                كل أدواتك التعليمية
                <span className="block text-[#188779]">في مكان واحد</span>
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-8 text-[#102f50]/60">
                تابع حصصك، تواصل مع مدرسك، واستكشف المواد والاشتراكات من تجربة جوال صممت لتكون واضحة وسريعة.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  ["01", "تابع تقدمك", "اعرف خطوتك التالية من الصفحة الرئيسية."],
                  ["02", "احجز بسهولة", "اختر الموعد المناسب من أي مكان."],
                  ["03", "تواصل مباشرة", "ابقَ قريباً من معلمك ورسائلك."],
                  ["04", "راجع موادك", "الوصول إلى ملفاتك وواجباتك أسرع."],
                ].map(([number, title, text]) => (
                  <div key={number} className="rounded-2xl border border-[#102f50]/10 bg-white p-4">
                    <p className="text-xs font-black text-[#188779]">{number}</p>
                    <h3 className="mt-2 text-sm font-black text-[#102f50]">{title}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-[#102f50]/50">{text}</p>
                  </div>
                ))}
              </div>
              <Link to={ctaTarget} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#188779] px-5 py-3 text-xs font-black text-white shadow-lg shadow-[#188779]/20 transition hover:-translate-y-0.5 hover:bg-[#147568]">
                ابدأ تجربتك الآن <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 bg-[#102f50] px-5 py-20 text-white md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#b9e4dc]">كيف تبدأ؟</p><h2 className="mt-4 text-3xl font-black leading-tight md:text-4xl">رحلتك التعليمية<br /><span className="text-[#b9e4dc]">في ثلاث خطوات</span></h2><p className="mt-5 max-w-sm text-sm leading-7 text-white/60">تجربة بسيطة تساعدك على الوصول إلى التعلم المناسب دون تعقيد.</p></div>
            <div className="grid gap-3 md:grid-cols-3">
              {[["01", "أنشئ حسابك", "ابدأ بملف تعليمي يناسب احتياجك."], ["02", "اختر ما يناسبك", "تصفح المدرسين والخدمات المتاحة."], ["03", "ابدأ التعلم", "احجز حصتك وواصل تقدمك بثقة."]].map(([number, title, text], index) => (
                <div key={number} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-3xl font-black text-[#b9e4dc]">{number}</p><h3 className="mt-8 text-sm font-black">{title}</h3><p className="mt-2 text-xs leading-6 text-white/55">{text}</p>{index < 2 && <ArrowUpLeft className="mt-5 hidden h-4 w-4 text-white/30 md:block" />}</div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
          <div className="flex items-end justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#188779]">منصة للإنسان أولاً</p><h2 className="mt-3 text-3xl font-black md:text-4xl">مدرسون يساعدونك على التقدم</h2></div><Link to="/search" className="hidden items-center gap-1 text-xs font-black text-[#188779] sm:flex">تصفح المدرسين <ChevronLeft className="h-4 w-4" /></Link></div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {teachers.slice(0, 3).map((teacher, index) => {
              const bookingUrl = `/booking?subject=${encodeURIComponent(teacher.subject)}&day=0`;
              const targetUrl = user ? bookingUrl : `/login?redirect=${encodeURIComponent(bookingUrl)}`;
              return (
                <Link key={`${teacher.name}-${index}`} to={targetUrl} className="group overflow-hidden rounded-3xl border border-[#102f50]/10 bg-white transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#102f50]/[0.06]">
                  <div className={`relative p-4 pb-0 ${index === 1 ? "bg-[#eef0f8]" : index === 2 ? "bg-[#f7efe1]" : "bg-[#e8f1ef]"}`}><img src={teacher.img} alt={teacher.name} className="mx-auto h-44 w-full rounded-t-[1.25rem] object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" /></div>
                  <div className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-black">{teacher.name}</p><p className="mt-1 text-[10px] text-[#102f50]/55">{teacher.subject} · {teacher.sessions} حصة</p></div><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f1ef] text-[#188779]"><Check className="h-4 w-4" /></span></div><span className="mt-5 flex items-center justify-center rounded-xl border border-[#188779]/25 py-2.5 text-[11px] font-black text-[#188779]">احجز حصتك <ArrowLeft className="mr-1 h-3 w-3" /></span></div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mx-5 mb-10 overflow-hidden rounded-[2rem] bg-[#e8f1ef] md:mx-auto md:max-w-7xl">
          <div className="grid gap-8 px-6 py-10 md:grid-cols-[1.2fr_0.8fr] md:items-center md:px-12 md:py-14"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#188779]">ابدأ بخطوة واحدة</p><h2 className="mt-4 max-w-lg text-3xl font-black leading-tight text-[#102f50] md:text-4xl">التعلم الأفضل لا يحتاج إلى تعقيد</h2><p className="mt-4 max-w-md text-sm leading-7 text-[#102f50]/60">اختر طريقك، وسند يساعدك في الوصول إلى التجربة المناسبة.</p></div><div className="flex flex-col gap-3 sm:flex-row md:justify-end"><Link to={ctaTarget} className="inline-flex items-center justify-center rounded-xl bg-[#188779] px-5 py-3 text-xs font-black text-white">ابدأ التعلم <ArrowLeft className="mr-1 h-3.5 w-3.5" /></Link><Link to="/teach-with-us" className="inline-flex items-center justify-center rounded-xl border border-[#102f50]/15 bg-white px-5 py-3 text-xs font-black text-[#102f50]">انضم كمعلم</Link></div></div>
        </section>
      </main>

      <Footer />
      <SanadGuestChat />
    </div>
  );
}