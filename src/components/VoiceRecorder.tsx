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
 * Hold-to-record style mic button used inside chat input rows.
 * Uses MediaRecorder (audio/webm). Falls back gracefully if unsupported.
 */
export default function VoiceRecorder({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => stopStream(), []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const start = async () => {
    if (disabled || busy || recording) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("التسجيل الصوتي غير مدعوم في هذا المتصفح");
      return;
    }
    try {
      setBusy(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stopStream();
        setRecording(false);
        setSeconds(0);
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
        if (blob.size < 200) { toast.error("التسجيل قصير جداً"); return; }
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type });
        onRecorded(file);
      };
      recorderRef.current = rec;
      rec.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
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
      <div className="flex items-center gap-2 bg-destructive/10 rounded-xl px-2 py-1">
        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-xs font-mono text-destructive font-bold">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </span>
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
