import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpLeft,
  BookOpen,
  BookOpenCheck,
  Check,
  ChevronDown,
  Compass,
  HandHeart,
  Map,
  MessageCircle,
  Monitor,
  PencilRuler,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import heroBanner from "@/assets/hero-banner.jpg";

const signupUrl = "/login?signup=1";

const supportTypes = [
  {
    id: "foundation",
    number: "01",
    title: "تأسيس وتقوية المهارات",
    kicker: "نبني الفهم من جذوره",
    description:
      "حين تحتاج بعض المفاهيم إلى مراجعة أهدأ، يبدأ الدعم من مستوى الطالب الحالي. يشرح المدرس الفكرة، يربطها بما يعرفه الطالب، ثم يتدرج معه حتى تصبح المهارة أوضح وأكثر ثباتاً.",
    details: ["مراجعة الأساسيات والمفاهيم", "شرح متدرج مع أمثلة", "تدريب يساعد على التطبيق"],
    icon: BookOpenCheck,
    tone: "mint",
  },
  {
    id: "individual",
    number: "02",
    title: "حصص فردية مباشرة",
    kicker: "وقت تعلّم يركّز عليك",
    description:
      "مساحة تفاعلية بين الطالب والمدرس للشرح والسؤال والتجربة. يمكن توجيه وقت الحصة إلى موضوع محدد أو متابعة دراسية أوسع، بحسب ما يحتاجه الطالب.",
    details: ["تواصل مباشر مع المدرس", "مساحة للأسئلة والنقاش", "شرح يناسب وتيرة الطالب"],
    icon: Video,
    tone: "sand",
  },
  {
    id: "followup",
    number: "03",
    title: "متابعة ومساندة دراسية",
    kicker: "خطوة واضحة بعد كل درس",
    description:
      "دعم يساعد الطالب على تنظيم المراجعة وفهم مواضع التعثر والاستعداد لما هو قادم. الهدف أن يعرف الطالب ما الذي أتقنه، وما الخطوة العملية التالية.",
    details: ["تنظيم المراجعة والواجبات", "تحديد النقاط التي تحتاج شرحاً", "تعزيز الاستقلالية والثقة"],
    icon: PencilRuler,
    tone: "blue",
  },
];

const learningModes = [
  {
    title: "التعلّم عن بُعد",
    label: "مرونة من مكانك",
    description:
      "حصة مباشرة عبر الإنترنت تتيح للطالب التعلّم من المنزل، والتفاعل مع المدرس، ومراجعة المادة التي يعمل عليها.",
    icon: Monitor,
    points: ["لقاء مباشر وتفاعلي", "لا يتطلب انتقالاً", "تواصل من خلال أدوات المنصة"],
  },
  {
    title: "التعلّم الحضوري",
    label: "لقاء وجهاً لوجه",
    description:
      "خيار تعليمي يقوم على لقاء الطالب والمدرس حضورياً. قد يفضّله من يستفيد من التفاعل المباشر والشرح جنباً إلى جنب.",
    icon: UsersRound,
    points: ["تفاعل تعليمي مباشر", "مساحة للشرح والتطبيق", "تفاصيل الترتيب تُناقش بعد التسجيل"],
  },
];

const faqs = [
  {
    q: "كيف أعرف نوع الدعم المناسب لابني أو ابنتي؟",
    a: "ابدأوا بوصف ما يحتاجه الطالب: تأسيس في مهارة، شرح موضوع محدد، أو متابعة للدراسة. بعد إنشاء الحساب يمكنكم استكشاف الخيارات والتعرّف على ما يلائم احتياجكم.",
  },
  {
    q: "هل يجب أن يكون الطالب متعثراً ليبدأ؟",
    a: "ليس بالضرورة. يمكن أن يكون الهدف تقوية الأساس، فهم مادة جديدة، التدريب على مهارة، أو بناء عادة مراجعة أكثر انتظاماً.",
  },
  {
    q: "ما الفرق بين التعلّم عن بُعد والحضوري؟",
    a: "عن بُعد يعني لقاءً مباشراً عبر الإنترنت دون انتقال، أما الحضوري فيعني لقاء الطالب والمدرس وجهاً لوجه. تفاصيل الخيارات المتاحة تُستكشف بعد التسجيل.",
  },
  {
    q: "هل تتوفر الحصص الحضورية في كل مكان؟",
    a: "لا تعرض هذه الصفحة بيانات أماكن أو نطاقات تغطية. بعد التسجيل يمكنكم الاطلاع على التفاصيل ذات الصلة بخيارات التعلّم المتاحة لكم.",
  },
];

function ConceptMap({
  journeyState,
  journeyRun,
  onReplay,
}: {
  journeyState: "ready" | "moving" | "arrived";
  journeyRun: number;
  onReplay: () => void;
}) {
  const isMoving = journeyState === "moving";
  const isArrived = journeyState === "arrived";
  const route = "M180 244 C232 219 247 186 286 183 S348 163 380 146 S412 153 438 181";

  return (
    <div className="rounded-[2rem] border border-[#102f50]/[0.08] bg-white/80 p-3 shadow-[0_24px_70px_-50px_rgba(16,47,80,.42)] sm:p-5">
      <div className={`relative overflow-hidden rounded-[1.75rem] border border-[#102f50]/10 bg-[#edf2e9] p-3 sm:p-5 ${isMoving ? "map-journey-active" : ""}`}>
        <svg viewBox="0 0 600 420" role="img" aria-labelledby="concept-map-title concept-map-description" className="h-auto w-full">
          <title id="concept-map-title">تصوّر مفاهيمي لرحلة المعلم إلى منزل الطالب</title>
          <desc id="concept-map-description">رسم تعليمي تخطيطي، وليس خريطة فعلية أو دليلاً للمواقع.</desc>
          <defs>
            <pattern id="map-dots" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.3" fill="#8b9e8c" opacity=".27" />
            </pattern>
          </defs>
          <rect width="600" height="420" rx="28" fill="#edf2e9" />
          <rect width="600" height="420" rx="28" fill="url(#map-dots)" />
          <path d="M-16 87 C90 112 104 41 207 69 S347 111 408 57 S528 34 625 75" fill="none" stroke="#d5dfd2" strokeWidth="35" strokeLinecap="round" />
          <path d="M82 -20 C92 78 174 96 150 180 S111 303 171 440" fill="none" stroke="#d5dfd2" strokeWidth="29" strokeLinecap="round" />
          <path d="M340 -18 C308 73 382 133 343 211 S340 314 392 438" fill="none" stroke="#d5dfd2" strokeWidth="25" strokeLinecap="round" />
          <path d="M-15 314 C72 270 138 312 208 284 S331 242 393 291 S518 351 618 290" fill="none" stroke="#d5dfd2" strokeWidth="31" strokeLinecap="round" />
          <path d={route} fill="none" stroke="#fffdf8" strokeWidth="13" strokeLinecap="round" />
          <path d={route} fill="none" stroke="#188779" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 11">
            {isMoving && <animate attributeName="stroke-dashoffset" from="0" to="-56" dur="3.2s" begin="0s" fill="freeze" />}
          </path>
          <g transform="translate(146 210)">
            <circle cx="34" cy="34" r="34" fill="#d9e9e2" />
            <circle cx="34" cy="26" r="9" fill="#188779" />
            <path d="M17 51c2-10 7-15 17-15s15 5 17 15" fill="#188779" />
            <text x="34" y="78" textAnchor="middle" fill="#102f50" fontSize="11" fontWeight="700">المعلم</text>
          </g>
          <g transform="translate(420 164)">
            <circle cx="34" cy="30" r="38" fill="#f5eddf" />
            <path d="m13 28 21-17 21 17v25H13V28Z" fill="#fffdf8" stroke="#a47b36" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M29 53V36h11v17" fill="none" stroke="#a47b36" strokeWidth="2.5" />
            <text x="34" y="82" textAnchor="middle" fill="#102f50" fontSize="11" fontWeight="700">منزل الطالب</text>
          </g>
          <g aria-hidden="true" transform={isMoving ? undefined : `translate(${isArrived ? "438 181" : "180 244"})`}>
            {isMoving && <animateMotion key={journeyRun} dur="3.2s" begin="0s" fill="freeze" rotate="auto" path={route} />}
            <circle cx="0" cy="0" r="19" fill="#188779" opacity=".18" />
            <path d="M-13 1h4l3-7h12l5 7h3v8h-27V1Z" fill="#147568" stroke="#fffdf8" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M-3-4h7l3 5H-5l2-5Z" fill="#b9e4dc" />
            <circle cx="-7" cy="9" r="2.5" fill="#102f50" />
            <circle cx="8" cy="9" r="2.5" fill="#102f50" />
          </g>
          <text x="566" y="392" textAnchor="end" fill="#526d62" fontSize="11" fontWeight="700">رسم تعليمي توضيحي فقط</text>
        </svg>
        <div className="pointer-events-none absolute right-5 top-5 rounded-full border border-[#102f50]/10 bg-[#fffdf8]/90 px-3 py-1.5 text-[10px] font-extrabold text-[#526d62] backdrop-blur-sm sm:right-7 sm:top-7">
          رسم مفاهيمي — ليس خريطة فعلية
        </div>
        <div className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-[#102f50]/10 bg-[#fffdf8]/90 px-3 py-2 text-[10px] font-bold text-[#102f50]/70 sm:bottom-7 sm:left-7">
          <span className={`h-2 w-2 rounded-full ${isArrived ? "bg-[#188779]" : isMoving ? "animate-pulse bg-[#a47b36]" : "bg-[#9aa99d]"}`} />
          {isArrived ? "وصل المعلم" : isMoving ? "المعلم في الطريق" : "رحلة توضيحية"}
        </div>
      </div>
      <div className="flex flex-col gap-3 px-2 pb-1 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-3">
        <p className="max-w-sm text-[11px] leading-6 text-[#102f50]/55">
          هذا الرسم للتوضيح البصري فقط، ولا يمثّل مدينة أو مواقع أو نطاق تغطية.
        </p>
        <button
          type="button"
          onClick={onReplay}
          disabled={isMoving}
          aria-label={isMoving ? "المعلم في الطريق إلى منزل الطالب" : "إعادة عرض رحلة المعلم إلى منزل الطالب"}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#188779] px-4 py-3 text-xs font-extrabold text-white shadow-[0_12px_30px_-18px_rgba(24,135,121,.7)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#147568] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25 disabled:cursor-wait disabled:opacity-80"
        >
          <RotateCcw className={`h-4 w-4 ${isMoving ? "animate-spin" : ""}`} aria-hidden="true" />
          {isMoving ? "المعلم في الطريق..." : isArrived ? "إعادة عرض الرحلة" : "شاهد رحلة المعلم"}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {isArrived ? "وصل المعلم إلى منزل الطالب في الرسم التوضيحي" : isMoving ? "المعلم في الطريق إلى منزل الطالب" : "رحلة المعلم جاهزة للعرض"}
      </p>
    </div>
  );
}

export default function PublicPackages() {
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [journeyState, setJourneyState] = useState<"ready" | "moving" | "arrived">("ready");
  const [journeyRun, setJourneyRun] = useState(0);
  const journeyTimer = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      if (journeyTimer.current) window.clearTimeout(journeyTimer.current);
      setJourneyState("arrived");
    }
  }, [reduceMotion]);

  useEffect(() => () => {
    if (journeyTimer.current) window.clearTimeout(journeyTimer.current);
  }, []);

  const replayJourney = () => {
    if (journeyTimer.current) window.clearTimeout(journeyTimer.current);
    setJourneyRun((run) => run + 1);
    if (reduceMotion) {
      setJourneyState("arrived");
      return;
    }
    setJourneyState("moving");
    journeyTimer.current = window.setTimeout(() => setJourneyState("arrived"), 3200);
  };

  useEffect(() => {
    const targetId = location.hash.slice(1);
    if (!targetId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }, [location.hash, reduceMotion]);

  const reveal = reduceMotion
    ? { initial: false as const, whileInView: undefined, transition: undefined }
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: "easeOut" as const },
      };

  return (
    <div dir="rtl" className="min-h-[100dvh] overflow-x-hidden bg-[#f7f8f5] text-[#102f50]">
      <SEOHead
        title="الباقات التعليمية | منصة أجيال المعرفة"
        description="تعرّف على أنواع الدعم التعليمي في منصة أجيال المعرفة: تأسيس، حصص فردية، متابعة دراسية، وتعلّم عن بُعد أو حضورياً."
        canonical="/packages"
      />
      <Navbar />

      <main>
        <section className="relative isolate overflow-hidden bg-[#f7f8f5]">
          <div className="pointer-events-none absolute -left-24 top-8 h-80 w-80 rounded-full bg-[#d9e9e2]/75 blur-3xl" />
          <div className="pointer-events-none absolute right-[38%] top-20 h-40 w-40 rounded-full bg-[#f2e8d6]/60 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-8 md:px-8 md:pb-24 md:pt-14 lg:grid-cols-[1fr_1.02fr] lg:gap-16">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, x: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
              transition={reduceMotion ? undefined : { duration: 0.65, ease: "easeOut" }}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#188779]/20 bg-[#188779]/[0.07] px-3.5 py-2 text-[11px] font-extrabold text-[#147568]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                تعرّف على مسارات الدعم
              </div>
              <h1 className="max-w-2xl text-[2.45rem] font-black leading-[1.24] tracking-[-0.04em] sm:text-5xl md:text-[4.1rem]">
                تعلّم يناسب
                <span className="block text-[#188779]">احتياج كل طالب</span>
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-8 text-[#102f50]/70 md:text-base">
                من تقوية الأساسيات إلى المتابعة الدراسية، اكتشف كيف يمكن للدعم التعليمي أن يبدأ من مستوى الطالب ويمنحه مساحة آمنة للفهم والتقدّم.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={signupUrl}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#188779] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_30px_-15px_rgba(24,135,121,.7)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#147568] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25"
                >
                  أنشئ حسابك واكتشف الخيارات <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href="#support-types"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#102f50]/15 bg-white/80 px-6 py-3.5 text-sm font-extrabold transition duration-200 hover:-translate-y-0.5 hover:border-[#188779]/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/20"
                >
                  تعرّف على أنواع الدعم <ArrowUpLeft className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-[11px] font-bold text-[#102f50]/65">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#188779]" aria-hidden="true" />مساحة تعليمية موثوقة</span>
                <span className="inline-flex items-center gap-2"><HandHeart className="h-4 w-4 text-[#188779]" aria-hidden="true" />دعم يراعي احتياج الطالب</span>
              </div>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.975 }}
              animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
              transition={reduceMotion ? undefined : { duration: 0.75, ease: "easeOut" }}
              className="relative"
            >
              <div className="absolute -inset-3 rotate-2 rounded-[2rem] border border-[#188779]/15 bg-[#e6efea] md:-inset-5" />
              <div className="relative overflow-hidden rounded-[1.75rem] bg-[#102f50] shadow-[0_28px_70px_-35px_rgba(16,47,80,.55)]">
                <img
                  src={heroBanner}
                  alt="طالب يتابع شرحاً مباشراً مع مدرس عبر الإنترنت"
                  className="h-[270px] w-full object-cover sm:h-[350px] lg:h-[420px]"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#102f50]/90 via-[#102f50]/5 to-transparent" />
                <div className="absolute bottom-0 right-0 max-w-md p-6 text-white md:p-8">
                  <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold text-[#c3e5dc]">
                    <span className="h-2 w-2 rounded-full bg-[#9bd5c7]" />
                    مساحة للسؤال والفهم
                  </p>
                  <p className="text-2xl font-black leading-snug md:text-3xl">كل خطوة تبدأ<br />من احتياج الطالب</p>
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
              { icon: BookOpen, title: "ابدأ من مستواك", text: "التعلّم الجيد يبدأ بفهم ما يحتاجه الطالب." },
              { icon: MessageCircle, title: "اسأل وتفاعل", text: "مساحة للشرح والحوار والتطبيق." },
              { icon: Compass, title: "اختر خطوتك", text: "استكشف نمط الدعم الذي يناسب هدفك." },
            ].map(({ icon: Icon, title, text }, i) => (
              <div key={title} className={`flex items-center gap-4 ${i < 2 ? "border-b border-[#102f50]/[0.08] pb-5 sm:border-b-0 sm:border-l sm:pb-0 sm:pl-5" : ""}`}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${i === 1 ? "bg-[#f5eddf] text-[#a47b36]" : "bg-[#e6f0eb] text-[#188779]"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <div><h2 className="text-sm font-extrabold">{title}</h2><p className="mt-1.5 text-xs leading-6 text-[#102f50]/60">{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="support-types" className="relative scroll-mt-24 overflow-hidden bg-[#edf3ef] px-5 py-16 md:px-8 md:py-24">
          <div className="pointer-events-none absolute -right-20 top-12 h-64 w-64 rounded-full bg-white/75 blur-3xl" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} viewport={{ once: true, margin: "-70px" }} className="max-w-2xl">
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">مسارات للدعم والتقدّم</p>
              <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">لكل طالب بداية مختلفة</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#102f50]/65">
                تعرّف على أشكال المساندة التعليمية؛ قد يحتاج الطالب إلى نوع واحد منها أو إلى مزيج يتغيّر مع تقدّمه.
              </p>
            </motion.div>

            <div className="mt-9 grid gap-4 lg:grid-cols-3">
              {supportTypes.map(({ id, number, title, kicker, description, details, icon: Icon, tone }, index) => (
                <motion.article
                  key={id}
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={reduceMotion ? undefined : { duration: 0.45, delay: index * 0.08 }}
                  className="group flex flex-col rounded-[1.5rem] border border-[#102f50]/[0.08] bg-[#fffefa] p-6 shadow-[0_14px_35px_-30px_rgba(16,47,80,.35)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_42px_-30px_rgba(16,47,80,.35)] md:p-7"
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone === "sand" ? "bg-[#f5eddf] text-[#a47b36]" : tone === "blue" ? "bg-[#e8edf3] text-[#315273]" : "bg-[#e5f0eb] text-[#188779]"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span className="font-mono text-xs font-bold text-[#102f50]/30">{number}</span>
                  </div>
                  <p className="mt-6 text-[10px] font-extrabold tracking-wide text-[#188779]">{kicker}</p>
                  <h3 className="mt-2 text-xl font-black">{title}</h3>
                  <p className="mt-3 min-h-[112px] text-sm leading-7 text-[#102f50]/65">{description}</p>
                  <ul className="mt-5 space-y-3 border-t border-[#102f50]/[0.08] pt-5 text-xs font-bold text-[#102f50]/70">
                    {details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#188779]" aria-hidden="true" />{detail}</li>
                    ))}
                  </ul>
                  <Link to={signupUrl} className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#188779]/25 px-4 py-3 text-xs font-extrabold text-[#147568] transition hover:bg-[#e6f0eb] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25">
                    اكتشف ما يناسبك <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </motion.article>
              ))}
            </div>
            <p className="mt-5 text-center text-[11px] leading-6 text-[#102f50]/50">
              التفاصيل والخيارات المتاحة تُستكشف بعد إنشاء الحساب.
            </p>
          </div>
        </section>

        <section id="in-person" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-16 md:px-8 md:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-14">
            <motion.div {...reveal} viewport={{ once: true, margin: "-60px" }} className="order-2 lg:order-1">
              <ConceptMap
                journeyState={journeyState}
                journeyRun={journeyRun}
                onReplay={replayJourney}
              />
            </motion.div>
            <motion.div {...reveal} viewport={{ once: true, margin: "-60px" }} className="order-1 lg:order-2">
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">تعلّم بالطريقة التي تلائم يومك</p>
              <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">عن بُعد أو حضورياً</h2>
              <p className="mt-4 max-w-xl text-sm leading-8 text-[#102f50]/65">
                تختلف طريقة التعلّم باختلاف ما يفضّله الطالب والأسرة. لذلك نوضح الفكرة هنا، ونترك تفاصيل الخيارات المتاحة لتظهر بعد التسجيل.
              </p>
              <div className="mt-7 space-y-4">
                {learningModes.map(({ title, label, description, icon: Icon, points }, index) => (
                  <article key={title} className={`rounded-2xl border p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-28px_rgba(16,47,80,.42)] ${index === 1 ? "border-[#102f50]/10 bg-[#faf8f2]" : "border-[#188779]/15 bg-[#eaf3ee]"}`}>
                    <div className="flex items-start gap-4">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${index === 1 ? "bg-[#f1e8d8] text-[#9b7539]" : "bg-white text-[#188779]"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-base font-black">{title}</h3>
                          <span className="text-[10px] font-extrabold text-[#188779]">{label}</span>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-[#102f50]/65">{description}</p>
                        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                          {points.map((point) => <li key={point} className="flex items-center gap-1.5 text-[10px] font-bold text-[#102f50]/60"><Check className="h-3.5 w-3.5 text-[#188779]" aria-hidden="true" />{point}</li>)}
                        </ul>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#102f50]/10 bg-white px-4 py-3.5 text-xs leading-6 text-[#102f50]/60">
                <Map className="mt-1 h-4 w-4 shrink-0 text-[#188779]" aria-hidden="true" />
                لا تتضمن هذه الصفحة مواقع فعلية أو بيانات تغطية أو تأكيداً على توفر خيار بعينه.
              </div>
            </motion.div>
          </div>
        </section>

        <section className="bg-[#102f50] px-5 py-16 text-white md:px-8 md:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#b9e4dc]">بداية سهلة وواضحة</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-black leading-tight md:text-4xl">ابدأوا بفهم الاحتياج، ثم اختاروا الخطوة التالية</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">إنشاء الحساب يتيح لكم استكشاف تجربة المنصة والتعرّف على الخيارات التعليمية بصورة أوضح.</p>
            </div>
            <Link to={signupUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b9e4dc] px-6 py-3.5 text-sm font-extrabold text-[#102f50] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30">
              ابدأوا بالتسجيل <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-16 md:px-8 md:py-24">
          <motion.div {...reveal} viewport={{ once: true }}>
            <div className="text-center">
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">إجابات تساعدكم على الاختيار</p>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">أسئلة شائعة</h2>
            </div>
            <div className="mt-8 space-y-3">
              {faqs.map(({ q, a }, index) => {
                const isOpen = openFaq === index;
                return (
                  <article key={q} className="overflow-hidden rounded-2xl border border-[#102f50]/10 bg-white transition-colors hover:border-[#188779]/30">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`package-faq-${index}`}
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-right focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#188779]/20"
                    >
                      <span className="text-sm font-extrabold leading-7">{q}</span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-[#188779] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    {isOpen && <div id={`package-faq-${index}`} className="border-t border-[#102f50]/[0.07] px-5 pb-5 pt-4 text-sm leading-7 text-[#102f50]/65">{a}</div>}
                  </article>
                );
              })}
            </div>
          </motion.div>
        </section>

        <section className="mx-5 mb-12 overflow-hidden rounded-[1.75rem] bg-[#e5f0eb] md:mx-auto md:max-w-7xl">
          <div className="grid gap-7 px-6 py-9 sm:px-9 md:grid-cols-[1.2fr_.8fr] md:items-center md:px-12 md:py-12">
            <div>
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#188779]">مساحة آمنة لبداية جديدة</p>
              <h2 className="mt-3 max-w-lg text-3xl font-black leading-tight text-[#102f50] md:text-4xl">كل تقدّم يبدأ بخطوة مفهومة</h2>
              <p className="mt-4 max-w-md text-sm leading-7 text-[#102f50]/60">أنشئ حسابك لاستكشاف تجربة أجيال المعرفة ومواصلة البحث عن الدعم الذي يناسب الطالب.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
              <Link to={signupUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#188779] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#147568] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/25">
                إنشاء حساب جديد <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <a href="#support-types" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#102f50]/15 bg-white px-5 py-3 text-xs font-extrabold text-[#102f50] transition hover:border-[#188779]/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#188779]/20">
                راجع أنواع الدعم <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
