import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, Trash2, Pause, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  /** Called once recording finishes — receives a webm/audio File ready to upload */
  onRecorded: (file: File) => void;
  disabled?: boolean;
}

/**
 * Tap-to-record mic button used inside chat input rows.
 * Uses MediaRecorder (audio/webm) with a real-time waveform meter.
 */
export default function VoiceRecorder({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0.1));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => stopStream(), []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const startMeter = (stream: MediaStream) => {
    try {
      const Ctx: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        if (pausedRef.current) { rafRef.current = requestAnimationFrame(tick); return; }
        analyserRef.current.getByteFrequencyData(data);
        // Compute amplitude bands and shift into the bars array
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255; // 0..1
        setLevels((prev) => {
          const next = prev.slice(1);
          next.push(Math.max(0.08, Math.min(1, avg * 2.2)));
          return next;
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("Audio meter unavailable", e);
    }
  };

  const start = async () => {
    if (disabled || busy || recording) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("التسجيل الصوتي غير مدعوم في هذا المتصفح");
      return;
    }
    try {
      setBusy(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const wasCancelled = cancelledRef.current;
        const blobType = chunksRef.current[0]?.type || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        stopStream();
        setRecording(false);
        setPaused(false);
        pausedRef.current = false;
        setSeconds(0);
        setLevels(Array(20).fill(0.1));
        if (wasCancelled) return;
        if (blob.size < 200) { toast.error("التسجيل قصير جداً"); return; }
        // Always use a .webm extension when type is webm/opus (best compat)
        const ext = blobType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blobType });
        onRecorded(file);
      };
      recorderRef.current = rec;
      rec.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => { if (!pausedRef.current) setSeconds((s) => s + 1); }, 1000);
      startMeter(stream);
    } catch (err: any) {
      console.error("mic error", err);
      toast.error("لم يتم منح إذن الميكروفون");
      stopStream();
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    if (!recording) return;
    recorderRef.current?.stop();
  };

  const togglePause = () => {
    const rec = recorderRef.current;
    if (!recording || !rec) return;
    try {
      if (pausedRef.current) rec.resume(); else rec.pause();
      pausedRef.current = !pausedRef.current;
      setPaused(pausedRef.current);
    } catch (e) {
      console.warn("pause not supported", e);
    }
  };

  const cancel = () => {
    if (!recording) return;
    cancelledRef.current = true;
    recorderRef.current?.stop();
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2 bg-muted border border-border rounded-full px-2 py-1 shrink-0" dir="rtl">
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10" onClick={cancel} title="حذف التسجيل">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={togglePause} title={paused ? "استئناف" : "إيقاف مؤقت"}>
          {paused ? <Mic className="h-4 w-4 text-destructive" /> : <Pause className="h-4 w-4" />}
        </Button>
        {/* Live waveform meter */}
        <div className="flex items-center gap-[2px] h-6 w-24" aria-hidden="true" dir="ltr">
          {levels.map((v, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-[height] duration-75 ${paused ? "bg-muted-foreground" : "bg-primary"}`}
              style={{ height: `${Math.round(v * 100)}%`, minHeight: 2 }}
            />
          ))}
        </div>
        <span className="text-xs font-mono font-bold tabular-nums w-[42px] text-center" dir="ltr">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </span>
        <Button type="button" size="icon" className="h-9 w-9 rounded-full bg-primary text-primary-foreground" onClick={stop} title="إرسال التسجيل">
          <Send className="h-4 w-4 -scale-x-100" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="rounded-xl shrink-0"
      onClick={start}
      disabled={disabled || busy}
      title="رسالة صوتية"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
