import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { VoiceTutorPanel, type TutorState } from "../src/components/ai/VoiceTutorPanel";
import { Button } from "../src/components/ui/button";
import "../src/index.css";

// Isolated visual fixture: no SDK, Supabase, microphone, auth, or paid calls.
const silentMeter = () => 0;
function Preview() {
  const [state, setState] = useState<TutorState>("idle");
  return <main style={{ maxWidth: 720, margin: "24px auto", background: "hsl(var(--background))" }}>
    <aside style={{ margin: "0 24px", padding: "14px 18px", background: "#fff6df", color: "#695e40", borderRadius: 14, fontSize: 12, lineHeight: 1.9 }}>
      معاينة للشكل فقط. النص مثال توضيحي، وليست محادثة حقيقية. لا ميكروفون ولا اتصال ولا خصم دقائق. النبض في المحادثة الفعلية يتبع مستوى صوت المدرس، ويظل ساكناً هنا لعدم وجود صوت.
    </aside>
    <VoiceTutorPanel state={state} getOutputVolume={silentMeter}
      userText={state === "idle" ? undefined : "اشرح لي حل ٣س + ٦ = ١٨"}
      assistantText={state === "idle" ? undefined : "نحل المعادلة خطوة خطوة. أولاً نطرح ستة من الطرفين، ثم نقسم على ثلاثة."}>
      <Button onClick={() => setState(state === "idle" ? "speaking" : "idle")} data-ending={state !== "idle"}>
        {state === "idle" ? "عرض مثال للشرح" : "إنهاء المثال"}
      </Button>
      <Button variant="outline" onClick={() => setState("listening")}>معاينة حالة الاستماع</Button>
    </VoiceTutorPanel>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
