import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpLeft,
  BookOpen,
  ChevronLeft,
  Compass,
  Laptop2,
  MessageCircle,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./teacher-search-journey.css";

const signupHref = "/login?signup=1&redirect=%2Fsearch";
const stageNumbers = ["٠١", "٠٢", "٠٣", "٠٤"];

const stages: Array<{
  title: string;
  short: string;
  description: string;
  detail: string;
  note: string;
  icon: LucideIcon;
  tone: string;
  to: string;
  action: string;
  secondTo?: string;
  secondAction?: string;
}> = [
  {
    title: "أنشئ حسابك",
    short: "بداية بسيطة",
    description: "ابدأ بحساب طالب أو ولي أمر، لتكون أدوات التعلّم ورحلتك في مكان واحد.",
    detail: "التسجيل هو الخطوة الأولى فقط. بعد إنشاء الحساب، يمكنك استكشاف الخيارات المتاحة دون الحاجة إلى اتخاذ قرار فوري.",
    note: "ابدأ باسمك ودورك: طالب أو ولي أمر.",
    icon: UsersRound,
    tone: "mint",
    to: signupHref,
    action: "إنشاء حساب",
  },
  {
    title: "استكشف المعلّمين",
    short: "قارن بهدوء",
    description: "استخدم معايير المنصة لمقارنة الخيارات، ثم اختر المعلّم الأقرب لاحتياجك.",
    detail: "راجع المعلومات التي تظهر في المنصة مثل المادة وطريقة التعلّم والتفاصيل المتاحة. القرار لك، ويمكنك المقارنة على مهل.",
    note: "اختر بناءً على احتياجك ومعايير المنصة.",
    icon: Compass,
    tone: "ochre",
    to: signupHref,
    action: "استكشف المعلّمين",
  },
  {
    title: "اختر طريقة التعلّم",
    short: "ما يناسبك",
    description: "تعرّف على خيارات الدروس عن بُعد أو الحضورية كما تظهر لك في المنصة.",
    detail: "تختلف الخيارات بحسب ما هو متاح ومعروض في المنصة. اقرأ تفاصيل كل خيار وحدّد الطريقة التي تناسب ظروفك.",
    note: "التفاصيل المعروضة هي مرجعك للاختيار.",
    icon: Laptop2,
    tone: "blue",
    to: signupHref,
    action: "تابع الاستكشاف",
  },
  {
    title: "واصل التعلّم",
    short: "اسأل وافهم",
    description: "استعن بسند وأداة الواجبات عندما تحتاج إلى مساعدة في الأسئلة والفهم.",
    detail: "يساعدك سند وأداة الواجبات على طرح الأسئلة وفهمها. أما اختيار المعلّم المناسب فيبقى قرارك، وفق المعايير الحقيقية المعروضة في المنصة.",
    note: "الأدوات تدعم الفهم؛ وأنت تختار المعلّم.",
    icon: MessageCircle,
    tone: "coral",
    to: "/ai-tutor",
    action: "تعرّف على سند",
    secondTo: "/homework-solver",
    secondAction: "أداة الواجبات",
  },
];

export default function TeacherSearchJourney() {
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const selected = stages[active];
  const SelectedIcon = selected.icon;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-journey-reveal]"));
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      nodes.forEach((node) => node.classList.add("ji-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("ji-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -28px 0px" },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const handleStageKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      next = (index + 1) % stages.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      next = (index - 1 + stages.length) % stages.length;
    } else {
      return;
    }

    event.preventDefault();
    setActive(next);
    rootRef.current?.querySelectorAll<HTMLButtonElement>(".ji-stage")[next]?.focus();
  };

  return (
    <section
      ref={rootRef}
      className="ad-section ji-section"
      id="journey"
      aria-labelledby="ji-title"
    >
      <div className="ad-wrap ji-wrap">
        <header className="ji-heading" data-journey-reveal>
          <div className="ji-eyebrow">
            <span className="ji-eyebrow-mark"><Sparkles size={14} /></span>
            دليلك في أجيال المعرفة
          </div>
          <h2 id="ji-title">رحلة تعلّم،<br /><em>خطوة بخطوة.</em></h2>
          <p>ابدأ من حيث أنت. تعرّف على كل مرحلة واختر خطوتك التالية بوضوح واطمئنان.</p>
        </header>

        <div className="ji-progress" data-journey-reveal aria-label={`الخطوة المعروضة: ${stageNumbers[active]} من ٠٤`}>
          <div className="ji-progress-meta">
            <span>الخطوة المعروضة</span>
            <span><b>{stageNumbers[active]}</b> / ٠٤</span>
          </div>
          <div className="ji-progress-track" aria-hidden="true">
            <span className="ji-progress-fill" style={{ width: `${((active + 1) / stages.length) * 100}%` }} />
          </div>
          <div className="ji-progress-caption"><span>البداية</span><span>تعلّم مستمر</span></div>
        </div>

        <div className="ji-layout" data-journey-reveal>
        <nav className="ji-stages" id="teachers" aria-label="مراحل رحلة التعلّم" role="tablist" aria-orientation="vertical">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const isActive = active === index;
              return (
                <button
                  className={`ji-stage ${isActive ? "is-active" : ""}`}
                  key={stage.title}
                  id={`journey-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="journey-panel"
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActive(index)}
                  onKeyDown={(event) => handleStageKeyDown(event, index)}
                >
                  <span className={`ji-stage-icon ${stage.tone}`}><Icon size={19} /></span>
                  <span className="ji-stage-text">
                    <small>الخطوة {stageNumbers[index]}</small>
                    <strong>{stage.title}</strong>
                    <span>{stage.short}</span>
                  </span>
                  <ChevronLeft className="ji-stage-arrow" size={17} aria-hidden="true" />
                </button>
              );
            })}
          </nav>

          <article
            className={`ji-detail ${selected.tone}`}
            id="journey-panel"
            role="tabpanel"
            aria-labelledby={`journey-tab-${active}`}
            key={active}
          >
            <div className="ji-detail-top">
              <span className="ji-detail-index">{stageNumbers[active]}</span>
              <span className={`ji-detail-icon ${selected.tone}`}><SelectedIcon size={24} /></span>
            </div>
            <span className="ji-detail-label">{selected.short}</span>
            <h3>{selected.title}</h3>
            <p className="ji-detail-lead">{selected.description}</p>
            <div className="ji-explanation">
              <span className="ji-explanation-icon"><BookOpen size={17} /></span>
              <div><strong>ماذا تتوقع؟</strong><p>{selected.detail}</p></div>
            </div>
            <div className="ji-guidance"><span className="ji-guidance-dot" />{selected.note}</div>
            <div className="ji-actions">
              <Link className="ji-primary-link" to={selected.to}>
                {selected.action}<ArrowLeft size={17} />
              </Link>
              {selected.secondTo && (
                <Link className="ji-secondary-link" to={selected.secondTo}>
                  {selected.secondAction}<ArrowUpLeft size={15} />
                </Link>
              )}
            </div>
            <div className="ji-detail-foot">
              <span>الخطوة المعروضة: {stageNumbers[active]} من ٠٤</span>
              <span className="ji-foot-dots" aria-hidden="true">
                {stages.map((_, index) => <i key={index} className={index === active ? "current" : ""} />)}
              </span>
            </div>
          </article>
        </div>

        <footer className="ji-footer" data-journey-reveal>
          <span className="ji-footer-mark"><Compass size={18} /></span>
          <p><strong>أنت من يختار المسار.</strong> خذ وقتك في استكشاف ما يناسب احتياجك.</p>
          <Link to={signupHref}>ابدأ رحلتك <ArrowLeft size={15} /></Link>
        </footer>
      </div>
    </section>
  );
}
