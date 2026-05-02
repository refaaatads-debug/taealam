import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Headphones, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreJoinCheckProps {
  otherName: string;
  isTeacher: boolean;
  canJoin: boolean;
  joinDisabledReason?: string;
  onJoin: () => void;
  onCancel?: () => void;
}

/**
 * Pre-join screen: lets user verify mic before entering the live session.
 * Shows a real-time mic level meter so they know audio works.
 */
export function PreJoinCheck({ otherName, isTeacher, canJoin, joinDisabledReason, onJoin, onCancel }: PreJoinCheckProps) {
  const [micState, setMicState] = useState<"checking" | "ok" | "denied" | "error">("checking");
  const [micLevel, setMicLevel] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setMicState("ok");

        // Setup analyser for live level meter
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);

          const tick = () => {
            if (!mounted) return;
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            const avg = sum / data.length / 128; // 0..1
            setMicLevel(Math.min(1, avg));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch (e) {
          console.warn("[pre-join] analyser failed:", e);
        }
      } catch (err: any) {
        if (!mounted) return;
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          setMicState("denied");
        } else {
          setMicState("error");
        }
        console.error("[pre-join] mic access failed:", err);
      }
    })();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const toggleMic = () => {
    const next = !micEnabled;
    setMicEnabled(next);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = next; });
  };

  const bars = 12;
  const activeBars = Math.round(micLevel * bars * 1.4); // amplify for visibility

  return (
    <div className="min-h-screen bg-foreground flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-card/5 backdrop-blur-xl border border-card/10 rounded-3xl p-8 shadow-2xl"
      >
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
            <Headphones className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-card mb-1">جاهز للانضمام؟</h1>
          <p className="text-sm text-card/60">
            {isTeacher ? `الحصة مع ${otherName}` : `الحصة مع المعلم ${otherName}`}
          </p>
        </div>

        {/* Mic test */}
        <div className="bg-card/5 border border-card/10 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {micState === "checking" && <Loader2 className="h-4 w-4 text-secondary animate-spin" />}
              {micState === "ok" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              {(micState === "denied" || micState === "error") && <AlertCircle className="h-4 w-4 text-destructive" />}
              <span className="text-sm font-bold text-card">اختبار الميكروفون</span>
            </div>
            {micState === "ok" && (
              <button
                onClick={toggleMic}
                className={`h-8 w-8 rounded-full flex items-center justify-center transition ${
                  micEnabled ? "bg-secondary/20 text-secondary" : "bg-destructive/20 text-destructive"
                }`}
                title={micEnabled ? "كتم" : "تشغيل"}
              >
                {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
            )}
          </div>

          {micState === "checking" && (
            <p className="text-xs text-card/60">جاري طلب إذن الميكروفون...</p>
          )}
          {micState === "ok" && (
            <>
              <div className="flex items-end gap-1 h-8">
                {Array.from({ length: bars }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm transition-all duration-75 ${
                      i < activeBars
                        ? i < bars * 0.6 ? "bg-green-400" : i < bars * 0.85 ? "bg-yellow-400" : "bg-destructive"
                        : "bg-card/10"
                    }`}
                    style={{ height: `${10 + (i / bars) * 90}%` }}
                  />
                ))}
              </div>
              <p className="text-xs text-card/50 mt-2">
                {micEnabled ? "تكلم بصوت عادي — يجب أن ترى الأعمدة تتحرك" : "الميكروفون مكتوم"}
              </p>
            </>
          )}
          {micState === "denied" && (
            <p className="text-xs text-destructive">
              تم رفض إذن الميكروفون. الرجاء السماح في إعدادات المتصفح ثم تحديث الصفحة.
            </p>
          )}
          {micState === "error" && (
            <p className="text-xs text-destructive">
              تعذر الوصول للميكروفون. تأكد من توصيل ميكروفون واحد على الأقل.
            </p>
          )}
        </div>

        {/* Join button */}
        <Button
          onClick={onJoin}
          disabled={!canJoin || micState === "checking"}
          className="w-full h-14 text-lg font-bold gradient-cta text-secondary-foreground shadow-button rounded-2xl gap-2"
        >
          <Headphones className="h-5 w-5" />
          {canJoin ? "انضم الآن" : (joinDisabledReason || "غير متاح")}
        </Button>

        {onCancel && (
          <Button
            onClick={onCancel}
            variant="ghost"
            className="w-full mt-2 text-card/60 hover:text-card"
          >
            إلغاء
          </Button>
        )}

        <p className="text-[11px] text-card/40 text-center mt-4">
          💡 الكاميرا غير مطلوبة — الجلسات صوتية مع سبورة تفاعلية
        </p>
      </motion.div>
    </div>
  );
}
