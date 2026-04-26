import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download } from "lucide-react";

interface Props {
  url: string;
  fileName?: string;
  className?: string;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/** Custom waveform-style audio player for voice messages. */
export default function VoicePlayer({ url, fileName, className }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);

  // Static pseudo-waveform bars (visual only)
  const bars = useRef<number[]>(
    Array.from({ length: 32 }, () => 0.3 + Math.random() * 0.7)
  ).current;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => { setDuration(a.duration || 0); setReady(true); };
    const onTime = () => {
      setCurrent(a.currentTime);
      setProgress(a.duration > 0 ? a.currentTime / a.duration : 0);
    };
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrent(0); a.currentTime = 0; };
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (playing) { a.pause(); setPlaying(false); }
      else { await a.play(); setPlaying(true); }
    } catch (e) {
      console.error("audio play error", e);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // RTL: progress flows right-to-left
    const ratio = 1 - (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(duration, ratio * duration));
  };

  return (
    <div className={`mt-2 flex items-center gap-2 bg-background/80 border border-border/40 rounded-2xl px-2.5 py-1.5 max-w-[280px] ${className || ""}`}>
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className="shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow"
        title={playing ? "إيقاف مؤقت" : "تشغيل"}
        aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ms-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className="flex items-end gap-[2px] h-7 cursor-pointer select-none"
          onClick={seek}
          role="slider"
          aria-label="موضع التشغيل"
          aria-valuenow={Math.round(progress * 100)}
        >
          {bars.map((b, i) => {
            // RTL fill direction
            const filledFromRight = (1 - progress) * bars.length;
            const filled = i >= filledFromRight;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-colors ${filled ? "bg-primary" : "bg-muted-foreground/30"}`}
                style={{ height: `${Math.round(b * 100)}%` }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-0.5 text-[10px] text-muted-foreground font-mono">
          <span>{fmt(current)}</span>
          <span>{ready ? fmt(duration) : "--:--"}</span>
        </div>
      </div>

      <a
        href={url}
        download={fileName || "voice.webm"}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title="تحميل"
        aria-label="تحميل"
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
