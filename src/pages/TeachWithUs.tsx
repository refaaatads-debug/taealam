import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  GraduationCap, Clock, DollarSign, Users, Sparkles, ShieldCheck,
  CheckCircle2, Calendar, Video, TrendingUp, Award, ArrowLeft,
  UserPlus, FileCheck, Wallet, Star,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import heroBanner from "@/assets/hero-banner.jpg";
import teacher1 from "@/assets/teacher-1.jpg";
import teacher2 from "@/assets/teacher-2.jpg";
import teacher3 from "@/assets/teacher-3.jpg";
import "./teach-with-us.css";

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

const offerings = [
  "ملف شخصي احترافي يعزّز من فرص اختيارك",
  "أدوات تدريس متطورة (سبورة، فيديو، AI)",
  "تقارير ذكية بعد كل حصة",
  "نظام دفع آمن وسحب سريع للأرباح",
  "دعم فني متواصل ومجتمع معلمين متعاون",
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

const portraits = [teacher1, teacher2, teacher3];

function Reveal({ children, className = "", delay = 0, reduceMotion }: {
  children: ReactNode;
  className?: string;
  delay?: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={reduceMotion ? undefined : { duration: 0.48, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export default function TeachWithUs() {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div className="teacher-page min-h-[100dvh] pb-16 font-cairo md:pb-0" dir="rtl">
      <Navbar />
      <main>
        <section className="tw-hero">
          <div className="tw-shell tw-hero-layout">
            <div className="tw-hero-copy">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={reduceMotion ? undefined : { duration: .45 }}
                className="tw-eyebrow"
              >
                <GraduationCap size={17} aria-hidden="true" /> للمُدرسين والمدربين
              </motion.div>
              <motion.h1
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={reduceMotion ? undefined : { duration: .55, delay: .06 }}
              >
                هل ترغب بالتدريس
                <span>أونلاين بمرونة كاملة؟</span>
              </motion.h1>
              <motion.p
                className="tw-intro"
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={reduceMotion ? undefined : { duration: .55, delay: .12 }}
              >
                انضم لطاقم المدرسين في <strong>منصة أجيال المعرفة</strong> وكن مديراً لوقتك ودخلك.
                شارك خبراتك مع آلاف الطلاب وحقّق دخلاً مستقراً من بيتك.
              </motion.p>
              <motion.div
                className="tw-actions"
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={reduceMotion ? undefined : { duration: .55, delay: .18 }}
              >
                <Button asChild className="tw-primary">
                  <Link to="/login?role=teacher&signup=1">
                    <UserPlus size={18} aria-hidden="true" /> قدّم طلبك مجاناً
                  </Link>
                </Button>
                <a className="tw-secondary" href="#policy">شروط الانضمام <ArrowLeft size={16} aria-hidden="true" /></a>
              </motion.div>
              <div className="tw-social-proof">
                <div className="tw-avatars" aria-label="مجتمع المعلمين">
                  {portraits.map((image, index) => <img key={image} src={image} alt={`معلم ${index + 1}`} loading="lazy" />)}
                </div>
                <div className="tw-proof-copy">
                  <div className="tw-rating" aria-label="التقييم 4.9 من 5">
                    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill="currentColor" aria-hidden="true" />)}
                    <b>4.9</b>
                  </div>
                  <p>أكثر من <strong>500</strong> معلم انضموا إلينا</p>
                </div>
              </div>
            </div>
            <Reveal reduceMotion={reduceMotion} className="tw-hero-visual">
              <div className="tw-image-frame">
                <img src={heroBanner} alt="انضم لطاقم المدرسين" loading="eager" />
                <div className="tw-image-shade" />
                <div className="tw-image-caption">
                  <span>تجربة تعليمية مباشرة</span>
                  <h2>علّم بخبرتك<br />وابنِ مستقبلك</h2>
                </div>
                <div className="tw-image-mark"><TrendingUp size={17} aria-hidden="true" /> مساحة لخبرتك</div>
              </div>
              <div className="tw-hero-stats">
                {stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
              </div>
              <div className="tw-income-note">
                <span><TrendingUp size={20} aria-hidden="true" /></span>
                <p><b>دخل شهري متوسط</b><small>للمعلم النشط على المنصة</small></p>
              </div>
            </Reveal>
          </div>
          <div className="tw-hero-index" aria-hidden="true">AJYAL / TEACHER COMMUNITY</div>
        </section>

        <section className="tw-mobile-stats tw-shell" aria-label="أرقام المنصة">
          {stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
        </section>

        <section className="tw-section tw-benefits">
          <div className="tw-shell">
            <Reveal reduceMotion={reduceMotion} className="tw-section-heading">
              <span className="tw-kicker">المميزات</span>
              <h2>لماذا تنضم إلينا؟</h2>
              <p>كل ما تحتاجه لتدرّس باحترافية وتنمّي دخلك في مكان واحد.</p>
            </Reveal>
            <div className="tw-benefit-grid">
              {benefits.map(({ icon: Icon, title, desc }, index) => (
                <Reveal key={title} reduceMotion={reduceMotion} delay={index * .055}>
                  <article className="tw-benefit-card">
                    <span className={`tw-icon-box tone-${index % 3}`}><Icon size={22} aria-hidden="true" /></span>
                    <span className="tw-card-index">0{index + 1}</span>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="tw-section tw-process">
          <div className="tw-shell">
            <Reveal reduceMotion={reduceMotion} className="tw-process-heading">
              <div><span className="tw-kicker">الخطوات</span><h2>كيف تنضم كمعلم؟</h2></div>
              <p>4 خطوات بسيطة وستكون جاهزاً لاستقبال طلابك الأوائل.</p>
            </Reveal>
            <div className="tw-steps">
              {steps.map(({ n, icon: Icon, title, desc }, index) => (
                <Reveal key={n} reduceMotion={reduceMotion} delay={index * .07}>
                  <article className="tw-step">
                    <div className="tw-step-top"><span>{n}</span><i><Icon size={20} aria-hidden="true" /></i></div>
                    <h3>{title}</h3><p>{desc}</p>
                    {index < steps.length - 1 && <ArrowLeft className="tw-step-arrow" size={17} aria-hidden="true" />}
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="tw-section tw-eligibility">
          <div className="tw-shell tw-eligibility-grid">
            <Reveal reduceMotion={reduceMotion}>
              <span className="tw-kicker">الشروط</span>
              <h2>شروط الانضمام كمعلم</h2>
              <p className="tw-body-copy">نسعى لتقديم أفضل تجربة تعليمية لطلابنا، لذلك نختار معلمينا بعناية. تحقّق من الشروط التالية:</p>
              <ul className="tw-check-list">
                {requirements.map((item) => <li key={item}><CheckCircle2 size={19} aria-hidden="true" />{item}</li>)}
              </ul>
            </Reveal>
            <Reveal reduceMotion={reduceMotion} delay={.1}>
              <article className="tw-offer-card">
                <div className="tw-offer-top"><span><Award size={22} aria-hidden="true" /></span><div><small>أدوات ودعم</small><h3>ماذا نقدم لك؟</h3></div></div>
                <ul>{offerings.map((item) => <li key={item}><CheckCircle2 size={17} aria-hidden="true" />{item}</li>)}</ul>
                <div className="tw-offer-foot">بيئة واحدة لتشارك خبرتك وتتابع حصصك.</div>
              </article>
            </Reveal>
          </div>
        </section>

        <section id="policy" className="tw-section tw-policy">
          <div className="tw-shell">
            <Reveal reduceMotion={reduceMotion} className="tw-section-heading">
              <span className="tw-kicker">السياسات</span>
              <h2>شروط وأحكام الانضمام</h2>
              <p>نحرص على الشفافية الكاملة. اطّلع على أهم البنود قبل التسجيل.</p>
            </Reveal>
            <div className="tw-policy-list">
              {policy.map(({ title, desc }, index) => (
                <Reveal key={title} reduceMotion={reduceMotion} delay={index * .045}>
                  <article className="tw-policy-row">
                    <span className="tw-policy-number">0{index + 1}</span>
                    <span className="tw-policy-icon"><Wallet size={18} aria-hidden="true" /></span>
                    <h3>{title}</h3><p>{desc}</p>
                  </article>
                </Reveal>
              ))}
            </div>
            <div className="tw-terms-link"><Link to="/terms">قراءة الشروط الكاملة <ArrowLeft size={15} aria-hidden="true" /></Link></div>
          </div>
        </section>

        <section className="tw-final-section">
          <div className="tw-shell">
            <div className="tw-final-card">
              <div className="tw-final-emblem"><Sparkles size={24} aria-hidden="true" /></div>
              <div className="tw-final-copy">
                <span className="tw-kicker">خطوتك التالية</span>
                <h2>جاهز لبدء رحلتك معنا؟</h2>
                <p>قدّم طلبك الآن مجاناً. خلال دقائق ستكون جاهزاً لاستقبال طلابك الأوائل.</p>
              </div>
              <Button asChild className="tw-final-button">
                <Link to="/login?role=teacher&signup=1"><UserPlus size={18} aria-hidden="true" /> قدّم طلبك مجاناً</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
