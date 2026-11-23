import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, X } from "lucide-react";
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
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
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

  const cancel = () => {
    if (!recording) return;
    cancelledRef.current = true;
    recorderRef.current?.stop();
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-2xl px-2 py-1 shrink-0">
        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-xs font-mono text-destructive font-bold tabular-nums w-[42px]">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </span>
        {/* Live waveform meter */}
        <div className="flex items-end gap-[2px] h-6 w-24" aria-hidden="true">
          {levels.map((v, i) => (
            <span
              key={i}
              className="flex-1 bg-destructive rounded-full transition-[height] duration-75"
              style={{ height: `${Math.round(v * 100)}%`, minHeight: 2 }}
            />
          ))}
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={cancel} title="إلغاء">
          <X className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" className="h-7 w-7 rounded-lg" onClick={stop} title="إنهاء التسجيل">
          <Square className="h-3.5 w-3.5" />
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
