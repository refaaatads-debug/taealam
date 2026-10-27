import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowUpLeft, Check, CheckCircle2, Compass,
  GraduationCap, Laptop2, Lightbulb, MessageCircle, NotebookPen,
  ShieldCheck, Sparkles, UsersRound,
} from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import SEOHead from "@/components/SEOHead";
import "./teacher-search-landing.css";

const signupHref = "/login?signup=1&redirect=%2Fsearch";

function useScrollReveals() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".ajyal-discovery .ad-reveal"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("ad-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("ad-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

export default function TeacherSearchLanding() {
  useScrollReveals();

  return (
    <>
      <SEOHead
        title="اكتشف معلّمك المناسب | أجيال المعرفة"
        description="ابدأ حسابك في أجيال المعرفة، واستكشف خيارات المعلّمين والدروس الحضورية وعن بُعد، مع سند وأدوات تساعدك على الفهم."
        canonical="/search"
      />
      <Navbar />
      <main className="ajyal-discovery min-h-[100dvh]" dir="rtl">
        <header className="ad-hero" id="top">
          <div className="ad-wrap ad-hero-grid">
            <div className="ad-reveal">
              <div className="ad-eyebrow"><i /> مساحة تعلم تبدأ من احتياجك</div>
              <h1>كل خطوة في تعلّمك، <em>لها سند.</em></h1>
              <p className="ad-hero-copy">ابدأ بحسابك، تعرّف على معلّمين مؤهلين، واختر طريقة التعلّم التي تناسبك. وبعد الدرس، يظلّ سند وأدواتنا التعليمية قريبين من أسئلتك.</p>
              <div className="ad-hero-actions">
                <Link className="ad-button" to={signupHref}>أنشئ حسابك وابدأ <ArrowLeft size={16} /></Link>
                <a className="ad-button ad-button-light" href="#journey">اكتشف كيف تعمل <ArrowDown size={15} /></a>
              </div>
              <div className="ad-hero-proof">
                <span className="ad-proof-mark"><ShieldCheck size={14} /> اختيارك بيدك</span>
                <span className="ad-proof-divider" />
                <span>معلّمون مؤهلون</span>
                <span className="ad-proof-divider" />
                <span>تعلم حضوري أو عن بُعد</span>
              </div>
              <a href="#journey" className="ad-hero-scroll">رحلة تعلّم واضحة <ArrowDown size={13} /></a>
            </div>

            <div className="ad-art ad-reveal ad-delay-1" aria-label="تصوّر لطريقة استكشاف خيارات التعلم">
              <div className="ad-orbit" />
              <div className="ad-orbit-chip ad-orbit-chip-one"><Compass size={26} /></div>
              <div className="ad-orbit-chip ad-orbit-chip-two"><Lightbulb size={24} /></div>
              <div className="ad-visual-card">
                <div className="ad-card-top">
                  <span className="ad-card-label">مساحتك التعليمية</span>
                  <span className="ad-card-status"><i style={{ width: 6, height: 6, borderRadius: "50%", background: "#67a27a" }} /> تبدأ باختيارك</span>
                </div>
                <h2 className="ad-card-title">كيف تحب أن تتعلّم؟</h2>
                <p className="ad-card-description">استكشف الخيارات، ثم اختر ما يناسبك.</p>
                <div className="ad-option">
                  <span className="ad-option-icon"><Laptop2 size={18} /></span>
                  <span className="ad-option-text"><strong>درس عن بُعد</strong><small>تعلّم من أي مكان</small></span>
                  <ArrowUpLeft size={15} className="ad-option-arrow" />
                </div>
                <div className="ad-option">
                  <span className="ad-option-icon"><UsersRound size={18} /></span>
                  <span className="ad-option-text"><strong>درس حضوري</strong><small>تواصل مباشر مع المعلّم</small></span>
                  <ArrowUpLeft size={15} className="ad-option-arrow" />
                </div>
                <div className="ad-card-foot"><CheckCircle2 size={14} /> قارن المعلّمين وفق معاييرك في التطبيق</div>
              </div>
              <div className="ad-note"><Sparkles size={15} className="ad-note-icon" /><span>وتجد من يساعدك<br /><b>حتى بعد الدرس</b></span></div>
            </div>
          </div>
        </header>

        <div className="ad-ribbon" aria-label="مزايا المنصة">
          <div className="ad-wrap ad-ribbon-inner">
            <span className="ad-ribbon-lead">تعلّم متصل، من أول سؤال إلى ما بعد الدرس</span>
            <span className="ad-ribbon-item"><Check size={14} /> معلمون مؤهلون</span>
            <span className="ad-ribbon-item"><Check size={14} /> معايير مقارنة واضحة</span>
            <span className="ad-ribbon-item"><Check size={14} /> أدوات تساعدك على الفهم</span>
          </div>
        </div>

        <section className="ad-section" id="journey">
          <div className="ad-wrap">
            <div className="ad-section-head ad-reveal">
              <span className="ad-kicker">من التسجيل إلى التقدّم</span>
              <h2>رحلتك تبدأ بخطوة،<br />وتستمرّ بدعم يناسبك.</h2>
              <p>لا تحتاج أن تعرف كل شيء من البداية. ابدأ بحسابك، ثم اكتشف الخيارات واتخذ قرارك على مهل.</p>
            </div>
            <div className="ad-journey">
              <article className="ad-step ad-reveal">
                <div className="ad-step-number"><UsersRound size={24} /></div>
                <small>الخطوة ٠١</small>
                <h3>أنشئ حسابك</h3>
                <p>سجّل كطالب أو ولي أمر، لتصل إلى أدوات التعلّم وتتابع رحلتك.</p>
              </article>
              <article className="ad-step ad-reveal ad-delay-1" id="teachers">
                <div className="ad-step-number"><Compass size={24} /></div>
                <small>الخطوة ٠٢</small>
                <h3>استكشف المعلّمين</h3>
                <p>قارن الخيارات المتاحة باستخدام معايير التطبيق، واختر من يناسب احتياجك.</p>
              </article>
              <article className="ad-step ad-reveal ad-delay-2">
                <div className="ad-step-number"><Laptop2 size={24} /></div>
                <small>الخطوة ٠٣</small>
                <h3>اختر طريقة التعلّم</h3>
                <p>تعرّف على الدروس عن بُعد أو الحضورية، بحسب ما يظهر لك في التطبيق.</p>
              </article>
              <article className="ad-step ad-reveal ad-delay-3">
                <div className="ad-step-number"><MessageCircle size={24} /></div>
                <small>الخطوة ٠٤</small>
                <h3>واصل التعلّم</h3>
                <p>اسأل سند، واستعن بأداة الواجبات لفهم السؤال وخطوات الحل.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="ad-section ad-choice">
          <div className="ad-wrap">
            <div className="ad-section-head ad-reveal">
              <span className="ad-kicker">التعلّم على طريقتك</span>
              <h2>معلّم مناسب،<br />ومكان يناسب يومك.</h2>
              <p>تعرّف على طرق التعلّم المتاحة، وقارن المعلّمين وفق معلوماتهم ومعايير الاختيار داخل المنصة. القرار لك.</p>
            </div>
            <div className="ad-mode-grid">
              <article className="ad-mode ad-reveal">
                <div className="ad-mode-icon"><Laptop2 size={23} /></div>
                <h3>عن بُعد، من مساحتك</h3>
                <p>تعلّم عبر الإنترنت مع معلّم تختاره، وواصل دراستك من المكان الأنسب لك.</p>
                <span className="ad-mode-tag">مرونة في المكان</span>
              </article>
              <article className="ad-mode ad-reveal ad-delay-1">
                <div className="ad-mode-icon"><UsersRound size={23} /></div>
                <h3>حضوري، بتواصل مباشر</h3>
                <p>استكشف خيار الدروس الحضورية وما يتوفر لك من تفاصيل ضمن التطبيق.</p>
                <span className="ad-mode-tag">لقاء مباشر</span>
              </article>
            </div>
          </div>
        </section>

        <section className="ad-section ad-support" id="sanad">
          <div className="ad-wrap ad-support-grid">
            <div className="ad-support-copy ad-reveal">
              <span className="ad-kicker">معك عندما يظهر السؤال</span>
              <h2>سند، مساعدك<br />في لحظات التعلّم.</h2>
              <p>إذا توقفت عند فكرة أو احتجت توضيحاً، يمكنك سؤال المساعد سند. يساعدك على استكشاف الإجابة وفهمها — ليكمل دور المعلّم، لا ليحلّ محله.</p>
              <Link className="ad-support-link" to="/ai-tutor">تعرّف على سند <ArrowLeft size={15} /></Link>
            </div>
            <div className="ad-assistant ad-reveal ad-delay-1" aria-label="مثال توضيحي لمحادثة مع المساعد سند">
              <div className="ad-chat-head">
                <span className="ad-sanad-mark"><Sparkles size={22} /></span>
                <span><strong>سند</strong><small>مساعدك للتعلّم والفهم</small></span>
                <span className="ad-chat-live"><i /> جاهز للمساعدة</span>
              </div>
              <span className="ad-example-label">مثال توضيحي لمحادثة</span>
              <div className="ad-bubble">ممكن تشرح لي الفرق بين <strong>المحيط والمساحة</strong>؟</div>
              <div className="ad-bubble ad-bubble-me">أكيد! فكّر في إطار الصورة وداخلها.</div>
              <div className="ad-bubble">المحيط يقيس طول الإطار من الخارج، أما المساحة فتقيس مقدار السطح داخل الإطار. هل نجرّب مثالاً معاً؟</div>
              <div className="ad-chat-input"><span>اكتب سؤالك هنا...</span><span className="ad-chat-send"><ArrowLeft size={14} /></span></div>
            </div>
          </div>
        </section>

        <section className="ad-tool-section" id="homework">
          <div className="ad-wrap ad-tool-grid">
            <div className="ad-homework-card ad-reveal" aria-label="مثال توضيحي لأداة فهم الواجب">
              <div className="ad-homework-top">
                <span className="ad-homework-label">مساعد فهم الواجب</span>
                <span className="ad-upload"><NotebookPen size={11} style={{ verticalAlign: "middle", marginLeft: 4 }} /> أضف سؤالك</span>
              </div>
              <span className="ad-example-label">مثال توضيحي لشرح سؤال</span>
              <div className="ad-question">
                <small>سؤال رياضيات · مثال توضيحي</small>
                <div className="ad-equation">3x + 5 = 20</div>
              </div>
              <div className="ad-solution">
                <div className="ad-solution-title"><Lightbulb size={14} /> لنفهمها خطوة بخطوة</div>
                <p>نبدأ بطرح ٥ من الطرفين، حتى يبقى الحد الذي يحتوي على x وحده في طرف.</p>
                <div className="ad-solution-steps"><span>٣x + ٥ − ٥ = ٢٠ − ٥</span><span>٣x = ١٥</span></div>
              </div>
            </div>
            <div className="ad-support-copy ad-reveal ad-delay-1">
              <span className="ad-kicker">الفهم قبل الإجابة</span>
              <h2>الواجب يصير أوضح،<br />خطوة خطوة.</h2>
              <p>استخدم أداة الواجبات لتستكشف شرح السؤال وخطواته. الهدف أن تفهم الفكرة وتتعلم كيف تصل للإجابة بنفسك، لا أن تحصل على حل بلا فهم.</p>
              <Link className="ad-support-link" to="/homework-solver">اكتشف أداة الواجبات <ArrowLeft size={15} /></Link>
            </div>
          </div>
        </section>

        <section className="ad-final">
          <div className="ad-wrap ad-final-inner ad-reveal">
            <div>
              <h2>خطوتك الأولى لا تحتاج<br />أن تكون كبيرة.</h2>
              <p>أنشئ حسابك، واستكشف مساحة تعلّم تناسبك أنت وأسرتك.</p>
            </div>
            <Link to={signupHref} className="ad-button ad-final-action">ابدأ رحلتك التعليمية <ArrowLeft size={16} /></Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
