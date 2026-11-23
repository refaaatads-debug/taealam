import { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Download, RotateCcw, RotateCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SessionVideoPlayerProps {
  src: string;
  title?: string;
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function SessionVideoPlayer({ src, title }: SessionVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [rate, setRate] = useState(1);
  const [buffered, setBuffered] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onDur = () => setDuration(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onProgress = () => {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("progress", onProgress);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("progress", onProgress);
    };
  }, [src]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const handleVolume = (val: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val[0];
    v.muted = val[0] === 0;
    setVolume(val[0]);
    setMuted(val[0] === 0);
  };

  const handleSeek = (val: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    const target = val[0];
    if (!isFinite(target)) return;
    v.currentTime = target;
    setCurrent(target);
  };

  const skip = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + sec));
  };

  const setSpeed = (r: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = r;
    setRate(r);
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else c.requestFullscreen?.();
  };

  const showAndAutoHide = () => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-xl overflow-hidden group"
      onMouseMove={showAndAutoHide}
      onMouseLeave={() => playing && setShowControls(false)}
      dir="ltr"
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-[70vh] bg-black cursor-pointer"
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      {/* Center play button when paused */}
      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          aria-label="تشغيل"
        >
          <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl">
            <Play className="h-8 w-8 text-primary-foreground fill-current ml-1" />
          </div>
        </button>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div className="relative mb-2">
          <div className="absolute inset-y-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-white/20 rounded-full overflow-hidden pointer-events-none">
            <div
              className="h-full bg-white/40"
              style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }}
            />
          </div>
          <Slider
            value={[current]}
            max={duration || 0}
            step={0.1}
            onValueChange={handleSeek}
            className="relative z-10 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:bg-primary [&_[role=slider]]:border-2 [&_[role=slider]]:border-white"
          />
        </div>

        <div className="flex items-center gap-2 text-white">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={togglePlay}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => skip(-10)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => skip(10)}>
            <RotateCw className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 group/vol">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleMute}>
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <div className="w-0 group-hover/vol:w-20 transition-all overflow-hidden">
              <Slider
                value={[muted ? 0 : volume]}
                max={1}
                step={0.05}
                onValueChange={handleVolume}
                className="[&_[role=slider]]:h-2 [&_[role=slider]]:w-2"
              />
            </div>
          </div>

          <span className="text-xs font-mono mx-2 tabular-nums">
            {formatTime(current)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20">
                <span className="text-[11px] font-bold">{rate}x</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <DropdownMenuItem key={r} onClick={() => setSpeed(r)} className={rate === r ? "bg-accent" : ""}>
                  {r}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <a href={src} download className="inline-flex">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" asChild>
              <span><Download className="h-4 w-4" /></span>
            </Button>
          </a>

          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleFullscreen}>
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {title && showControls && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-3 transition-opacity">
          <p className="text-white text-sm font-bold">{title}</p>
        </div>
      )}
    </div>
  );
}
