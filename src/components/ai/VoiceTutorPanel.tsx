import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import "./VoiceTutorPanel.css";

export type TutorState = "idle" | "connecting" | "listening" | "speaking" | "retrying";

/** Only reads the SDK's local output meter. Never starts audio or a session. */
export function VoiceTutorOrb({ speaking, getOutputVolume }: {
  speaking: boolean;
  getOutputVolume: () => number;
}) {
  const orbRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb) return;
    const reset = () => orb.style.setProperty("--voice-level", "0");
    reset();
    if (!speaking) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let smoothed = 0;
    const sample = () => {
      let raw = 0;
      try { raw = getOutputVolume(); } catch { /* unavailable meter stays still */ }
      const level = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
      // Quick attack and gentle release, always derived from actual output audio.
      smoothed += (level - smoothed) * (level > smoothed ? 0.55 : 0.2);
      orb.style.setProperty("--voice-level", String(reducedMotion?.matches ? 0 : smoothed));
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => { cancelAnimationFrame(frame); reset(); };
  }, [speaking, getOutputVolume]);

  return <div className="voice-orb-space" aria-hidden="true">
    <div className="voice-orb" ref={orbRef} data-testid="voice-orb">
      <div className="voice-orb-halo" />
      <div className="voice-orb-sphere" />
    </div>
  </div>;
}

const labels: Record<TutorState, string> = {
  idle: "المدرس المساعد جاهز",
  connecting: "جاري الاتصال بالمدرس المساعد…",
  listening: "أنا أستمع إليك",
  speaking: "المدرس المساعد يتحدث…",
  retrying: "جاري إعادة الاتصال…",
};

export function VoiceTutorPanel({ state, getOutputVolume, studentName, userText, assistantText, children }: {
  state: TutorState;
  getOutputVolume: () => number;
  studentName?: string;
  userText?: string;
  assistantText?: string;
  children: ReactNode;
}) {
  return <section className="voice-tutor-panel" dir="rtl" aria-label="المدرس المساعد الصوتي">
    <header className="voice-tutor-heading">
      <h2>المدرس المساعد</h2>
      <p>أجيال المعرفة</p>
    </header>
    <VoiceTutorOrb speaking={state === "speaking"} getOutputVolume={getOutputVolume} />
    <div className="voice-tutor-status" role="status" aria-live="polite">
      <h3>{labels[state]}</h3>
      <p>{state === "idle"
        ? studentName ? `مرحباً ${studentName}، تحدث مع مدرسك بصوتك بالعربية.` : "تحدث مع مدرسك بصوتك بالعربية."
        : state === "speaking" ? "استمع للشرح، ويمكنك التحدث لمقاطعة الرد."
        : state === "listening" ? "تحدث بوضوح، مدرسك يستمع إليك."
        : "لحظات ونبدأ المحادثة الصوتية."}</p>
    </div>
    <div className="voice-tutor-transcript" aria-label="آخر سؤال ورد">
      <article className="voice-tutor-bubble voice-tutor-question">
        <p className="voice-tutor-caption">أنت</p>
        <p dir="auto">{userText || "سيظهر سؤالك هنا بعد بدء المحادثة."}</p>
      </article>
      <article className="voice-tutor-bubble voice-tutor-answer">
        <p className="voice-tutor-caption">المدرس المساعد</p>
        <p dir="auto">{assistantText || "سأشرح لك خطوة بخطوة. اسألني عن درسك."}</p>
      </article>
      <p className="voice-tutor-note">النص يساعدك على متابعة الشرح أثناء المحادثة.</p>
    </div>
    <div className="voice-tutor-controls">{children}</div>
    <footer className="voice-tutor-footer">جرّب: "اشرح لي هذه المسألة" أو "صحّح إجابتي"</footer>
  </section>;
}
