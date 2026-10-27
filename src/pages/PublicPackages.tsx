import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
  Pause,
  PencilRuler,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./PublicPackages.css";

const signupUrl = "/login?signup=1";
const journeyDuration = 10_000;
const journeySteps = [
  { title: "اختيار درس حضوري", text: "تبدأ الفكرة باختيار التعلّم وجهاً لوجه." },
  { title: "حجز وترتيب التفاصيل", text: "تُناقش تفاصيل الترتيب بعد التسجيل." },
  { title: "المعلم في طريقه", text: "مشهد توضيحي لانتقال المعلم إلى الطالب." },
  { title: "لقاء تعليمي", text: "نهاية الرسم عند منزل الطالب، للتوضيح فقط." },
];

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
    tone: "remote",
    visual: "مساحة تعلّم عبر الإنترنت",
  },
  {
    title: "التعلّم الحضوري",
    label: "لقاء وجهاً لوجه",
    description:
      "خيار تعليمي يقوم على لقاء الطالب والمدرس حضورياً. قد يفضّله من يستفيد من التفاعل المباشر والشرح جنباً إلى جنب.",
    icon: UsersRound,
    points: ["تفاعل تعليمي مباشر", "مساحة للشرح والتطبيق", "تفاصيل الترتيب تُناقش بعد التسجيل"],
    tone: "inperson",
    visual: "لقاء تعليمي وجهاً لوجه",
  },
];

const faqs = [
  {
    q: "كيف أعرف نوع الدعم المناسب لابني أو ابنتي؟",
    a: "ابدأوا بوصف ما يحتاجه الطالب: تأسيس في مهارة، شرح موضوع محدد، أو متابعة دراسية. بعد إنشاء الحساب يمكنكم استكشاف الخيارات والتعرّف على ما يلائم احتياجكم.",
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

function Reveal({
  children,
  reduceMotion,
  delay = 0,
  className,
}: {
  children: ReactNode;
  reduceMotion: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={reduceMotion ? undefined : { duration: 0.55, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function JourneyMap({
  progress,
  step,
  status,
  reduceMotion,
  containerRef,
}: {
  progress: number;
  step: number;
  status: "ready" | "running" | "paused" | "complete";
  reduceMotion: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const routePathRef = useRef<SVGPathElement | null>(null);
  const route = "M180 244 C232 219 247 186 286 183 S348 163 380 146 S412 153 438 181";
  const travelingProgress = progress <= 0.47 ? 0 : progress >= 0.9 ? 1 : (progress - 0.47) / 0.43;
  const visibleTravel = reduceMotion && progress < 1 ? 0 : travelingProgress;
  const totalLength = routePathRef.current?.getTotalLength() ?? 500;
  const point = routePathRef.current?.getPointAtLength(totalLength * visibleTravel);
  const position = point ? `${point.x} ${point.y}` : "180 244";
  const routeOffset = totalLength * (1 - visibleTravel);
  const isActive = status === "running" || status === "paused";

  return (
    <div ref={containerRef} className={`packages-map ${reduceMotion ? "is-reduced" : ""}`}>
      <svg viewBox="0 0 600 420" role="img" aria-labelledby="packages-map-title packages-map-description">
        <title id="packages-map-title">رسم توضيحي لمراحل التعلّم الحضوري</title>
        <desc id="packages-map-description">تصوّر تعليمي تجريدي يبدأ باختيار درس حضوري، ثم ترتيب التفاصيل، ثم انتقال المعلم إلى منزل الطالب. لا يمثل خريطة أو موقعاً حقيقياً.</desc>
        <defs>
          <pattern id="packages-map-dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.25" fill="#8b9e8c" opacity=".28" />
          </pattern>
        </defs>
        <rect width="600" height="420" rx="24" fill="#e9efe3" />
        <rect width="600" height="420" rx="24" fill="url(#packages-map-dots)" />
        <path d="M-16 87 C90 112 104 41 207 69 S347 111 408 57 S528 34 625 75" fill="none" stroke="#d5dfd2" strokeWidth="35" strokeLinecap="round" />
        <path d="M82 -20 C92 78 174 96 150 180 S111 303 171 440" fill="none" stroke="#d5dfd2" strokeWidth="29" strokeLinecap="round" />
        <path d="M340 -18 C308 73 382 133 343 211 S340 314 392 438" fill="none" stroke="#d5dfd2" strokeWidth="25" strokeLinecap="round" />
        <path d="M-15 314 C72 270 138 312 208 284 S331 242 393 291 S518 351 618 290" fill="none" stroke="#d5dfd2" strokeWidth="31" strokeLinecap="round" />
        <path d={route} fill="none" stroke="#fffdf8" strokeWidth="13" strokeLinecap="round" />
        <path d={route} fill="none" stroke="#b4c9ba" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 11" />
        <path
          ref={routePathRef}
          className="packages-route-line"
          d={route}
          fill="none"
          stroke="#188779"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${totalLength} ${totalLength}`}
          strokeDashoffset={routeOffset}
        />
        <g transform="translate(146 210)">
          <circle cx="34" cy="34" r="34" fill="#d9e9e2" />
          <circle cx="34" cy="26" r="9" fill="#188779" />
          <path d="M17 51c2-10 7-15 17-15s15 5 17 15" fill="#188779" />
          <text x="34" y="78" textAnchor="middle" fill="#183e50" fontSize="11" fontWeight="700">المعلم</text>
        </g>
        <g transform="translate(420 164)">
          <circle cx="34" cy="30" r="38" fill="#f5eddf" />
          <path d="m13 28 21-17 21 17v25H13V28Z" fill="#fffdf8" stroke="#a47b36" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M29 53V36h11v17" fill="none" stroke="#a47b36" strokeWidth="2.5" />
          <text x="34" y="82" textAnchor="middle" fill="#183e50" fontSize="11" fontWeight="700">منزل الطالب</text>
        </g>
        <g className="packages-map-car" aria-hidden="true" transform={`translate(${position})`}>
          <circle cx="0" cy="0" r="20" fill="#188779" opacity=".17" />
          <path d="M-13 1h4l3-7h12l5 7h3v8h-27V1Z" fill="#147568" stroke="#fffdf8" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M-3-4h7l3 5H-5l2-5Z" fill="#b9e4dc" />
          <circle cx="-7" cy="9" r="2.5" fill="#183e50" />
          <circle cx="8" cy="9" r="2.5" fill="#183e50" />
        </g>
        <text x="566" y="392" textAnchor="end" fill="#526d62" fontSize="11" fontWeight="700">تصوّر تعليمي فقط</text>
      </svg>
      <span className="packages-map-label">رسم مفاهيمي — ليس خريطة فعلية</span>
      <span className={`packages-map-status ${isActive ? "is-active" : status === "complete" ? "is-done" : ""}`}>
        <span className="packages-status-dot" />
        {status === "running" ? journeySteps[step]?.title : status === "paused" ? "العرض متوقف مؤقتاً" : status === "complete" ? "انتهى العرض التوضيحي" : "رحلة توضيحية"}
      </span>
    </div>
  );
}

export default function PublicPackages() {
  const reduceMotion = useReducedMotion() ?? false;
  const location = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeModeIndex, setActiveModeIndex] = useState(0);
  const [journeyStatus, setJourneyStatus] = useState<"ready" | "running" | "paused" | "complete">("ready");
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [journeyStep, setJourneyStep] = useState(0);
  const [journeyRun, setJourneyRun] = useState(0);
  const journeyMapRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const lastPaintTimeRef = useRef(0);
  const lastStepRef = useRef(0);
  const autoStartedRef = useRef(false);

  const startJourney = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    elapsedRef.current = 0;
    lastFrameTimeRef.current = null;
    lastPaintTimeRef.current = 0;
    lastStepRef.current = 0;
    setJourneyProgress(0);
    setJourneyStep(0);
    setJourneyRun((run) => run + 1);
    setJourneyStatus("running");
  }, []);

  useEffect(() => {
    if (journeyStatus !== "running") return;
    const tick = (now: number) => {
      if (lastFrameTimeRef.current !== null) {
        elapsedRef.current += now - lastFrameTimeRef.current;
      }
      lastFrameTimeRef.current = now;
      const nextProgress = Math.min(1, elapsedRef.current / journeyDuration);
      if (now - lastPaintTimeRef.current > 45 || nextProgress === 1) {
        lastPaintTimeRef.current = now;
        setJourneyProgress(nextProgress);
        const nextStep = nextProgress < 0.22 ? 0 : nextProgress < 0.47 ? 1 : nextProgress < 0.9 ? 2 : 3;
        if (nextStep !== lastStepRef.current) {
          lastStepRef.current = nextStep;
          setJourneyStep(nextStep);
        }
      }
      if (nextProgress >= 1) {
        lastFrameTimeRef.current = null;
        animationFrameRef.current = null;
        setJourneyStatus("complete");
        setJourneyStep(3);
        return;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      lastFrameTimeRef.current = null;
    };
  }, [journeyStatus, journeyRun]);

  useEffect(() => {
    const node = journeyMapRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !autoStartedRef.current) {
          autoStartedRef.current = true;
          startJourney();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [startJourney]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  useEffect(() => {
    const targetId = location.hash.slice(1);
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, reduceMotion]);

  const toggleJourney = () => {
    if (journeyStatus === "running") {
      setJourneyStatus("paused");
    } else if (journeyStatus === "paused") {
      setJourneyStatus("running");
    } else {
      startJourney();
    }
  };

  const activeMode = learningModes[activeModeIndex];
  const ActiveModeIcon = activeMode.icon;

  return (
    <>
      <SEOHead
        title="الباقات التعليمية | منصة أجيال المعرفة"
        description="تعرّف على أنواع الدعم التعليمي في منصة أجيال المعرفة: تأسيس، حصص فردية، متابعة دراسية، وتعلّم عن بُعد أو حضورياً."
        canonical="/packages"
      />
      <Navbar />
      <div dir="rtl" className="public-packages-page min-h-[100dvh] overflow-x-hidden">
        <main>
          <section className="packages-hero">
            <div className="packages-shell packages-hero-grid">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, x: 18 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={reduceMotion ? undefined : { duration: 0.65, ease: "easeOut" }}
                className="packages-hero-copy"
              >
                <span className="packages-eyebrow"><Sparkles size={15} aria-hidden="true" /> مسارات دعم تبدأ من الطالب</span>
                <h1 className="packages-display">تعلّم يناسب <em>احتياج كل طالب</em></h1>
                <p>من تقوية الأساسيات إلى المتابعة الدراسية، اكتشف كيف يمكن للدعم التعليمي أن يبدأ من مستوى الطالب ويمنحه مساحة آمنة للفهم والتقدّم.</p>
                <div className="packages-hero-actions">
                  <Link to={signupUrl} className="packages-button-primary">أنشئ حسابك واكتشف الخيارات <ArrowLeft size={16} aria-hidden="true" /></Link>
                  <a href="#support-types" className="packages-button-quiet">تعرّف على أنواع الدعم <ArrowUpLeft size={15} aria-hidden="true" /></a>
                </div>
                <div className="packages-trust-row">
                  <span><ShieldCheck size={15} aria-hidden="true" /> مساحة تعليمية موثوقة</span>
                  <span><HandHeart size={15} aria-hidden="true" /> دعم يراعي احتياج الطالب</span>
                </div>
              </motion.div>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: .975 }}
                animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
                transition={reduceMotion ? undefined : { duration: .75, ease: "easeOut" }}
                className="packages-hero-art"
                role="img"
                aria-label="رسم توضيحي لكتاب وأدوات تعلّم"
              >
                <div className="packages-art-panel">
                  <div className="packages-art-sun" />
                  <div className="packages-art-orbit" />
                  <div className="packages-art-note">فكرة اليوم<small>نفهمها خطوة خطوة</small></div>
                  <div className="packages-art-book" />
                  <div className="packages-art-pencil" />
                </div>
                <div className="packages-floating-note">
                  <span><MessageCircle size={19} aria-hidden="true" /></span>
                  <span><strong>تعلّم بتواصل مباشر</strong><small>اسأل، ناقش، وتقدّم</small></span>
                </div>
              </motion.div>
            </div>
          </section>

          <section className="packages-strip" aria-label="مبادئ تجربة التعلّم">
            <div className="packages-shell packages-strip-inner">
              <div className="packages-strip-item">
                <span className="packages-strip-icon"><BookOpen size={20} aria-hidden="true" /></span>
                <div><strong>ابدأ من مستواك</strong><p>التعلّم الجيد يبدأ بفهم ما يحتاجه الطالب.</p></div>
              </div>
              <div className="packages-strip-item">
                <span className="packages-strip-icon"><MessageCircle size={20} aria-hidden="true" /></span>
                <div><strong>اسأل وتفاعل</strong><p>مساحة للشرح والحوار والتطبيق.</p></div>
              </div>
              <div className="packages-strip-item">
                <span className="packages-strip-icon"><Compass size={20} aria-hidden="true" /></span>
                <div><strong>اختر خطوتك</strong><p>استكشف نمط الدعم الذي يناسب هدفك.</p></div>
              </div>
            </div>
          </section>

          <section id="support-types" className="packages-support-section packages-section-space scroll-mt-8">
            <div className="packages-shell packages-support-layout">
              <Reveal reduceMotion={reduceMotion} className="packages-support-side">
                <div className="packages-heading">
                  <span className="packages-eyebrow">مسارات للدعم والتقدّم</span>
                  <h2 className="packages-display">لكل طالب بداية مختلفة</h2>
                  <p>تعرّف على أشكال المساندة التعليمية؛ قد يحتاج الطالب إلى نوع واحد منها أو إلى مزيج يتغيّر مع تقدّمه.</p>
                </div>
                <div className="packages-side-note">ابدأوا بوصف ما يحتاجه الطالب: تأسيس في مهارة، شرح موضوع محدد، أو متابعة للدراسة.</div>
              </Reveal>
              <div className="packages-support-list">
                {supportTypes.map(({ id, number, title, kicker, description, details, icon: Icon }, index) => (
                  <Reveal key={id} reduceMotion={reduceMotion} delay={index * .08}>
                    <article className="packages-support-card">
                      <span className="packages-support-icon"><Icon size={23} aria-hidden="true" /></span>
                      <div>
                        <span className="packages-support-number">{number}</span>
                        <h3>{title}</h3>
                        <p className="packages-kicker">{kicker}</p>
                        <p className="packages-description">{description}</p>
                        <ul className="packages-detail-list">
                          {details.map((detail) => <li key={detail}><Check size={13} aria-hidden="true" />{detail}</li>)}
                        </ul>
                        <Link to={signupUrl} className="packages-mini-link">اكتشف ما يناسبك <ArrowLeft size={13} aria-hidden="true" /></Link>
                      </div>
                    </article>
                  </Reveal>
                ))}
                <p className="packages-availability-note">التفاصيل والخيارات المتاحة تُستكشف بعد إنشاء الحساب.</p>
              </div>
            </div>
          </section>

          <section id="learning-modes" className="packages-modes-section packages-section-space scroll-mt-8">
            <div className="packages-shell">
              <Reveal reduceMotion={reduceMotion} className="packages-modes-head">
                <div className="packages-heading">
                  <span className="packages-eyebrow">تعلّم بالطريقة التي تلائم يومك</span>
                  <h2 className="packages-display">عن بُعد أو حضورياً</h2>
                  <p>تختلف طريقة التعلّم باختلاف ما يفضّله الطالب والأسرة. لذلك نوضح الفكرة هنا، ونترك تفاصيل الخيارات المتاحة لتظهر بعد التسجيل.</p>
                </div>
                <div className="packages-mode-switch" role="group" aria-label="اختيار طريقة التعلّم">
                  {learningModes.map((mode, index) => (
                    <button key={mode.title} type="button" aria-pressed={activeModeIndex === index} onClick={() => setActiveModeIndex(index)}>
                      {mode.title}
                    </button>
                  ))}
                </div>
              </Reveal>
              <div className="packages-mode-layout">
                <motion.article
                  key={activeMode.tone}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={reduceMotion ? undefined : { duration: .28, ease: "easeOut" }}
                  className={`packages-mode-copy ${activeMode.tone === "inperson" ? "is-inperson" : ""}`}
                >
                  <div className="packages-mode-title">
                    <span><ActiveModeIcon size={22} aria-hidden="true" /></span>
                    <div><small>{activeMode.label}</small><h3>{activeMode.title}</h3></div>
                  </div>
                  <p>{activeMode.description}</p>
                  <ul className="packages-mode-points">
                    {activeMode.points.map((point) => <li key={point}><Check size={14} aria-hidden="true" />{point}</li>)}
                  </ul>
                </motion.article>
                <Reveal reduceMotion={reduceMotion}>
                  <div className="packages-mode-visual" aria-label={activeMode.visual}>
                    <div className="packages-visual-window"><span className="packages-visual-sun" /><span className="packages-visual-table" /><span className="packages-visual-book" /></div>
                    <span className="packages-visual-caption">{activeMode.visual}</span>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          <section id="in-person" className="packages-journey-section packages-section-space scroll-mt-8">
            <div className="packages-shell">
              <Reveal reduceMotion={reduceMotion} className="packages-journey-heading">
                <div className="packages-heading">
                  <span className="packages-eyebrow">كيف تبدو الفكرة؟</span>
                  <h2 className="packages-display">رحلة تعلّم حضوري، خطوة بخطوة</h2>
                  <p>تصوّر مبسّط يشرح الفكرة من اختيار الدرس إلى اللقاء التعليمي؛ لا يصف موقعاً أو حجزاً فعلياً.</p>
                </div>
                <span className="packages-journey-tag"><Map size={15} aria-hidden="true" /> رسم تعليمي توضيحي فقط</span>
              </Reveal>
              <Reveal reduceMotion={reduceMotion}>
                <div className="packages-journey-card">
                  <JourneyMap
                    progress={journeyProgress}
                    step={journeyStep}
                    status={journeyStatus}
                    reduceMotion={reduceMotion}
                    containerRef={journeyMapRef}
                  />
                  <div className="packages-journey-info">
                    <h3>من الاختيار إلى اللقاء</h3>
                    <p>مراحل مفاهيمية تساعد على فهم خيار التعلّم وجهاً لوجه، من دون تمثيل بيانات حقيقية.</p>
                    <ol className="packages-step-list" aria-label="مراحل الرحلة التوضيحية">
                      {journeySteps.map((step, index) => {
                        const isPast = journeyStatus === "complete" || index < journeyStep;
                        const isCurrent = journeyStatus === "running" && index === journeyStep;
                        return (
                          <li key={step.title} className={`${isCurrent ? "is-current" : ""} ${isPast ? "is-passed" : ""}`}>
                            <span className="packages-step-number">{isPast ? <Check size={13} aria-hidden="true" /> : `0${index + 1}`}</span>
                            <span><strong>{step.title}</strong><small>{step.text}</small></span>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="packages-journey-controls">
                      <button type="button" className="packages-button-primary" onClick={toggleJourney} aria-label={
                        journeyStatus === "running" ? "إيقاف مؤقت للرحلة التوضيحية" :
                          journeyStatus === "paused" ? "استئناف الرحلة التوضيحية" : "تشغيل الرحلة التوضيحية"
                      }>
                        {journeyStatus === "running" ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                        {journeyStatus === "running" ? "إيقاف مؤقت" : journeyStatus === "paused" ? "استئناف العرض" : "ابدأ العرض"}
                      </button>
                      <button type="button" className="packages-button-quiet" onClick={startJourney}>
                        <RotateCcw size={14} aria-hidden="true" /> إعادة العرض
                      </button>
                    </div>
                    <p className="packages-journey-note">هذا الرسم للتوضيح البصري فقط؛ لا يعرض خريطة أو مواقع فعلية أو عناوين أو توفر المسارات، ولا يؤكد حجزاً.</p>
                    <p className="sr-only" aria-live="polite" aria-atomic="true">
                      {journeyStatus === "running" ? `المرحلة الحالية: ${journeySteps[journeyStep]?.title}` :
                        journeyStatus === "paused" ? `العرض متوقف مؤقتاً عند: ${journeySteps[journeyStep]?.title}` :
                          journeyStatus === "complete" ? "انتهى العرض التوضيحي" : "الرحلة التوضيحية جاهزة"}
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <section className="packages-cta-band packages-section-space">
            <Reveal reduceMotion={reduceMotion} className="packages-shell packages-cta-inner">
              <div>
                <span className="packages-eyebrow" style={{ color: "#c2e2d5" }}>بداية سهلة وواضحة</span>
                <h2 className="packages-display">ابدأوا بفهم الاحتياج، ثم اختاروا الخطوة التالية</h2>
                <p>إنشاء الحساب يتيح لكم استكشاف تجربة المنصة والتعرّف على الخيارات التعليمية بصورة أوضح.</p>
              </div>
              <Link to={signupUrl} className="packages-button-primary">ابدأوا بالتسجيل <ArrowLeft size={16} aria-hidden="true" /></Link>
            </Reveal>
          </section>

          <section id="faq" className="packages-faq-section packages-section-space scroll-mt-8">
            <div className="packages-shell packages-faq-grid">
              <Reveal reduceMotion={reduceMotion} className="packages-faq-aside">
                <div className="packages-heading">
                  <span className="packages-eyebrow">إجابات تساعدكم على الاختيار</span>
                  <h2 className="packages-display">أسئلة شائعة</h2>
                  <p>معلومات موجزة تساعد الأسرة على استكشاف الدعم المناسب بثقة ووضوح.</p>
                </div>
                <span className="packages-faq-icon"><MessageCircle size={27} aria-hidden="true" /></span>
              </Reveal>
              <div className="packages-faq-list">
                {faqs.map(({ q, a }, index) => {
                  const isOpen = openFaq === index;
                  return (
                    <Reveal key={q} reduceMotion={reduceMotion} delay={index * .04}>
                      <article className={`packages-faq-item ${isOpen ? "is-open" : ""}`}>
                        <button type="button" aria-expanded={isOpen} aria-controls={`package-faq-${index}`} onClick={() => setOpenFaq(isOpen ? null : index)}>
                          <span>{q}</span>
                          <ChevronDown className="packages-faq-chevron" size={18} aria-hidden="true" />
                        </button>
                        <div id={`package-faq-${index}`} className={`packages-faq-answer ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
                          <div><p>{a}</p></div>
                        </div>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </>
  );
}
