import { useRef, useState, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  src: string;
  className?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({ src, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onMeta = () => setDuration(isFinite(v.duration) ? v.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [src]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
  };

  const skip = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((duration || v.duration || 0), v.currentTime + sec));
  };

  const seek = (val: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = val[0];
  };

  const changeVolume = (val: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val[0];
    setVolume(val[0]);
    if (val[0] > 0 && v.muted) {
      v.muted = false;
      setMuted(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const setPlaybackSpeed = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
  };

  const fullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else v.requestFullscreen?.();
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("relative rounded-xl overflow-hidden bg-black group", className)}>
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-96 bg-black"
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 space-y-2 opacity-100 transition-opacity">
        {/* Progress */}
        <div className="flex items-center gap-2 text-white text-xs" dir="ltr">
          <span className="tabular-nums">{fmt(current)}</span>
          <Slider
            value={[current]}
            min={0}
            max={duration || 0.1}
            step={0.1}
            onValueChange={seek}
            className="flex-1"
          />
          <span className="tabular-nums">{fmt(duration)}</span>
        </div>
        {/* Controls */}
        <div className="flex items-center gap-1 text-white" dir="ltr">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white" onClick={() => skip(-10)} title="رجوع 10 ثوانٍ">
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/20 hover:text-white" onClick={togglePlay} title={playing ? "إيقاف" : "تشغيل"}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white" onClick={() => skip(10)} title="تقديم 10 ثوانٍ">
            <SkipForward className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 ml-2">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white" onClick={toggleMute}>
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Slider
              value={[muted ? 0 : volume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={changeVolume}
              className="w-20"
            />
          </div>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-white hover:bg-white/20 hover:text-white text-xs gap-1">
                <Gauge className="h-3.5 w-3.5" />
                {speed}x
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SPEEDS.map((s) => (
                <DropdownMenuItem key={s} onClick={() => setPlaybackSpeed(s)} className={speed === s ? "font-bold" : ""}>
                  {s}x {speed === s && "✓"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white" onClick={fullscreen} title="ملء الشاشة">
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
