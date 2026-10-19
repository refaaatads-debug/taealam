import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Headphones, Loader2, CheckCircle2, AlertCircle, Wifi, WifiOff, RefreshCw } from "lucide-react";
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
  const [micRetryKey, setMicRetryKey] = useState(0);
  const [joining, setJoining] = useState(false);
  const [networkState, setNetworkState] = useState<"checking" | "ok" | "weak" | "error">("checking");
  const [deviceOnline, setDeviceOnline] = useState(() => navigator.onLine);
  const [networkErrorKind, setNetworkErrorKind] = useState<"offline" | "timeout" | "blocked" | "service" | null>(null);
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [estimatedDownlink, setEstimatedDownlink] = useState<number | null>(null);
  const [micErrorName, setMicErrorName] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const networkCheckRef = useRef<AbortController | null>(null);

  const checkInternet = async () => {
    setNetworkState("checking");
    setNetworkErrorKind(null);
    setNetworkLatency(null);
    setEstimatedDownlink(null);
    networkCheckRef.current?.abort();
    const controller = new AbortController();
    networkCheckRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      if (!navigator.onLine) throw new Error("offline");
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!baseUrl || !publishableKey) throw new Error("session health check is not configured");
      const healthUrl = `${baseUrl.replace(/\/$/, "")}/auth/v1/health`;
      const samples: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const startedAt = performance.now();
        const response = await fetch(healthUrl, {
          cache: "no-store",
          headers: { apikey: publishableKey },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`health check ${response.status}`);
        samples.push(performance.now() - startedAt);
      }
      // Probe the real session-token route without creating a session or issuing
      // a token. The function answers OPTIONS before authentication or writes.
      const origin = window.location.origin;
      const canProbeFunction = [
        "https://ajyalalmaerifa.com",
        "https://www.ajyalalmaerifa.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ].includes(origin);
      if (canProbeFunction) {
        const probe = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/session-transport-token`, {
          method: "OPTIONS",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!probe.ok) throw new Error(`session route check ${probe.status}`);
      }
      if (networkCheckRef.current === controller) {
        const averageLatency = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
        const connection = (navigator as Navigator & {
          connection?: { downlink?: number; rtt?: number; effectiveType?: string };
        }).connection;
        const downlink = Number.isFinite(connection?.downlink) ? Number(connection?.downlink) : null;
        const isWeak = averageLatency > 500
          || (connection?.rtt != null && connection.rtt > 500)
          || (downlink != null && downlink < 0.5)
          || connection?.effectiveType === "slow-2g"
          || connection?.effectiveType === "2g";
        setNetworkLatency(averageLatency);
        setEstimatedDownlink(downlink);
        setNetworkState(isWeak ? "weak" : "ok");
      }
    } catch (error) {
      if (networkCheckRef.current === controller) {
        setNetworkState("error");
        setNetworkLatency(null);
        setEstimatedDownlink(null);
        const message = error instanceof Error ? error.message : String(error ?? "");
        setNetworkErrorKind(
          !navigator.onLine ? "offline"
            : /abort|timeout/i.test(message) ? "timeout"
              : /failed to fetch|networkerror|err_blocked_by_client|cors/i.test(message) ? "blocked"
                : "service",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (networkCheckRef.current === controller) networkCheckRef.current = null;
    }
  };

  useEffect(() => {
    void checkInternet();
    const handleOnline = () => { setDeviceOnline(true); void checkInternet(); };
    const handleOffline = () => {
      setDeviceOnline(false);
      const activeCheck = networkCheckRef.current;
      networkCheckRef.current = null;
      activeCheck?.abort();
      setNetworkState("error");
      setNetworkErrorKind("offline");
      setNetworkLatency(null);
      setEstimatedDownlink(null);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      const activeCheck = networkCheckRef.current;
      networkCheckRef.current = null;
      activeCheck?.abort();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,  // disable AGC (causes pumping/cutting)
            channelCount: 1,         // mono — same as the live session
            sampleRate: 48000,       // Opus native rate
          },
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setMicErrorName(null);
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
        setMicErrorName(err?.name || "UnknownError");
        console.error("[pre-join] mic access failed:", err);
      }
    })();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      void audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      rafRef.current = null;
    };
  }, [micRetryKey]);

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    try {
      await onJoin();
    } finally {
      setJoining(false);
    }
  };

  const retryMicrophone = () => {
    setMicState("checking");
    setMicRetryKey((key) => key + 1);
  };

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

        <div data-testid="status-internet-check" className="bg-card/5 border border-card/10 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {networkState === "checking" && <Loader2 className="h-4 w-4 text-secondary animate-spin" />}
              {(networkState === "ok" || networkState === "weak") && <Wifi className={`h-4 w-4 ${networkState === "ok" ? "text-green-400" : "text-amber-400"}`} />}
              {networkState === "error" && <WifiOff className="h-4 w-4 text-destructive" />}
              <span className="text-sm font-bold text-card">اختبار جودة الإنترنت</span>
            </div>
            {networkState === "ok" || networkState === "weak" ? (
              <span className={`text-xs ${networkState === "ok" ? "text-green-400" : "text-amber-400"}`}>
                {estimatedDownlink != null ? `${estimatedDownlink} Mbps · ` : ""}{networkLatency} ms
                {networkState === "weak" ? " · ضعيف" : " · مناسب للصوت"}
              </span>
            ) : networkState === "error" ? (
              <button data-testid="button-retry-internet-check" type="button" onClick={() => void checkInternet()} className="text-xs text-secondary flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> أعد الفحص
              </button>
            ) : (
              <span className="text-xs text-card/50">جارٍ الفحص…</span>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-card/50">
            {deviceOnline
              ? estimatedDownlink == null
                ? "اختبرنا زمن الاستجابة إلى خادم الجلسة. تقدير السرعة غير مدعوم في هذا المتصفح."
                : "يقيس الفحص تقدير سرعة التنزيل وزمن الاستجابة؛ السرعة التقديرية من المتصفح."
              : "الجهاز غير متصل بالشبكة."}
          </p>
          {networkState === "weak" && <p className="mt-2 text-xs leading-5 text-amber-300">الاتصال أبطأ أو أعلى تأخيرًا من المناسب لحصة صوتية مستقرة. جرّب شبكة أقوى ثم أعد الفحص.</p>}
          {networkState === "error" && (
            <p className="mt-2 text-xs leading-5 text-destructive">
              {networkErrorKind === "offline"
                ? "لا يوجد اتصال شبكة على هذا الجهاز. أعد الاتصال ثم أعد الفحص."
                : networkErrorKind === "timeout"
                  ? "لم يصل رد خادم الجلسة في الوقت المحدد. قد يكون اتصالك جيدًا لكن الخادم لا يستجيب الآن."
                  : networkErrorKind === "blocked"
                    ? "منعت إضافة في المتصفح أو إعداد شبكة الوصول إلى خادم الفحص. اسمح للموقع في إضافة الحجب ثم أعد الفحص."
                    : "تعذر الوصول إلى خادم الفحص. لم يبدأ اتصال Agora؛ أعد الفحص بعد قليل."}
            </p>
          )}
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
            <div className="text-xs text-destructive">
              <p>تم رفض إذن الميكروفون. اسمح للموقع باستخدام الميكروفون ثم أعد الفحص.</p>
              <button type="button" onClick={retryMicrophone} className="mt-2 underline">أعد فحص الميكروفون</button>
            </div>
          )}
          {micState === "error" && (
            <div className="text-xs text-destructive">
              <p>{micErrorName === "NotFoundError"
                ? "لم يتم العثور على ميكروفون. وصّل ميكروفونًا ثم أعد الفحص."
                : micErrorName === "NotReadableError"
                  ? "الميكروفون مستخدم من تطبيق آخر أو تعذر تشغيله. أغلق التطبيقات الأخرى ثم أعد الفحص."
                  : "تعذر الوصول إلى الميكروفون. تحقق من توصيله وصلاحيات المتصفح ثم أعد الفحص."}</p>
              <button type="button" onClick={retryMicrophone} className="mt-2 underline">أعد فحص الميكروفون</button>
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-secondary/25 bg-secondary/10 p-4 text-right" role="note">
          <p className="text-xs leading-6 text-card/80">
            قد تُستخدم فحوص آلية أثناء الجلسة لرصد مخالفات مثل مشاركة معلومات التواصل أو العناوين أو الصمت الطويل. لا تُحفَظ مقاطع الفحص الصوتي القصيرة أو نصوصها في سجل المخالفات؛ يُحفَظ تصنيف المخالفة فقط لمراجعة الإدارة. وبشكل منفصل، تُسجَّل الحصة كاملةً وتُحفَظ وفق سياسة تسجيل الجلسات.
          </p>
        </div>

        {/* Join button */}
        <Button
          onClick={handleJoin}
          disabled={joining || !canJoin || micState !== "ok" || networkState !== "ok"}
          className="w-full h-14 text-lg font-bold gradient-cta text-secondary-foreground shadow-button rounded-2xl gap-2"
        >
          {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : <Headphones className="h-5 w-5" />}
          {joining ? "جارٍ تجهيز الاتصال..." : networkState !== "ok" ? "تحقق من الاتصال للمتابعة" : canJoin ? "انضم الآن" : (joinDisabledReason || "غير متاح")}
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
