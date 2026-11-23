import { useEffect, useRef, useState, useCallback } from "react";
import { Pen, Highlighter, Eraser, Trash2, X, GripVertical, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tool = "none" | "pen" | "highlighter" | "eraser";

interface DrawAction {
  type: "path" | "clear";
  points?: { x: number; y: number }[];
  color?: string;
  lineWidth?: number;
  opacity?: number;
}

interface Props {
  enabled: boolean;
  onClose: () => void;
  /** Send a drawing action to the remote peer (student) */
  onSendAction?: (action: DrawAction) => void;
  /** Remote actions coming from the other side (rendered too) */
  remoteActions?: DrawAction[];
}

const COLORS = ["#e74c3c", "#2ecc71", "#3498db", "#f39c12", "#9b59b6", "#ffffff", "#1a1a2e"];

export default function ScreenShareToolbar({ enabled, onClose, onSendAction, remoteActions = [] }: Props) {
  // Toolbar position (draggable)
  const [pos, setPos] = useState({ x: 24, y: 120 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Drawing state
  const [tool, setTool] = useState<Tool>("none");
  const [color, setColor] = useState<string>("#e74c3c");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ active: boolean; pts: { x: number; y: number }[] } | null>(null);
  const localActionsRef = useRef<DrawAction[]>([]);
  const lastRemoteCountRef = useRef(0);

  // Resize canvas to viewport
  useEffect(() => {
    if (!enabled) return;
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      c.style.width = "100%";
      c.style.height = "100%";
      const ctx = c.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const all = [...localActionsRef.current, ...remoteActions];
    all.forEach(a => {
      if (a.type === "clear") {
        ctx.clearRect(0, 0, c.width, c.height);
      } else if (a.type === "path" && a.points && a.points.length > 0) {
        ctx.save();
        ctx.strokeStyle = a.color || "#e74c3c";
        ctx.lineWidth = a.lineWidth || 3;
        ctx.globalAlpha = a.opacity ?? 1;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(a.points[0].x, a.points[0].y);
        for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y);
        ctx.stroke();
        ctx.restore();
      }
    });
  }, [remoteActions]);

  // Re-render when remote actions arrive
  useEffect(() => {
    if (remoteActions.length !== lastRemoteCountRef.current) {
      lastRemoteCountRef.current = remoteActions.length;
      redraw();
    }
  }, [remoteActions, redraw]);

  // Pointer handlers — only active when a tool is selected
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "none") return;
    e.stopPropagation();
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawingRef.current = { active: true, pts: [{ x, y }] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current?.active) return;
    e.stopPropagation();
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Downsample: skip points within 2px of the previous point to reduce payload size
    const prev = drawingRef.current.pts[drawingRef.current.pts.length - 1];
    if (Math.abs(x - prev.x) < 2 && Math.abs(y - prev.y) < 2) return;
    drawingRef.current.pts.push({ x, y });

    // live preview (always smooth — local)
    const ctx = c.getContext("2d");
    if (ctx && drawingRef.current.pts.length >= 2) {
      const a = drawingRef.current.pts[drawingRef.current.pts.length - 2];
      ctx.save();
      ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : color;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.lineWidth = tool === "highlighter" ? 18 : tool === "eraser" ? 24 : 3;
      ctx.globalAlpha = tool === "highlighter" ? 0.35 : 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }
  };
  const onPointerUp = () => {
    if (!drawingRef.current?.active) return;
    const pts = drawingRef.current.pts;
    drawingRef.current = null;
    if (pts.length === 0) return;
    const action: DrawAction = {
      type: "path",
      points: pts,
      color: tool === "eraser" ? "#000" : color,
      lineWidth: tool === "highlighter" ? 18 : tool === "eraser" ? 24 : 3,
      opacity: tool === "highlighter" ? 0.35 : 1,
    };
    localActionsRef.current.push(action);
    onSendAction?.(action);
  };

  const handleClear = () => {
    localActionsRef.current.push({ type: "clear" });
    onSendAction?.({ type: "clear" });
    redraw();
  };

  // Toolbar drag — handlers stop propagation so they never reach the canvas overlay
  const onDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 60, dragRef.current.origX + (e.clientX - dragRef.current.startX))),
      y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.origY + (e.clientY - dragRef.current.startY))),
    });
  };
  const onDragEnd = (e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = null; };

  if (!enabled) return null;

  const drawingActive = tool !== "none";

  return (
    <>
      {/* Drawing canvas overlay (only intercepts pointer when a tool is active) */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "fixed inset-0 z-[60] transition-colors",
          drawingActive ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
        )}
      />

      {/* Floating draggable toolbar */}
      <div
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[70] bg-card/95 backdrop-blur-md rounded-2xl shadow-xl border border-border/50 p-2 flex items-center gap-1 select-none"
        dir="ltr"
      >
        <button
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="cursor-move p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          title="اسحب للتحريك"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <Button size="icon" variant={tool === "none" ? "default" : "ghost"} className="h-8 w-8" onClick={() => setTool("none")} title="مؤشر">
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant={tool === "pen" ? "default" : "ghost"} className="h-8 w-8" onClick={() => setTool("pen")} title="قلم">
          <Pen className="h-4 w-4" />
        </Button>
        <Button size="icon" variant={tool === "highlighter" ? "default" : "ghost"} className="h-8 w-8" onClick={() => setTool("highlighter")} title="هايلايتر">
          <Highlighter className="h-4 w-4" />
        </Button>
        <Button size="icon" variant={tool === "eraser" ? "default" : "ghost"} className="h-8 w-8" onClick={() => setTool("eraser")} title="ممحاة">
          <Eraser className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-0.5" />

        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); if (tool === "none") setTool("pen"); }}
            className={cn(
              "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
              color === c ? "border-foreground scale-110" : "border-border"
            )}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}

        <div className="w-px h-6 bg-border mx-0.5" />

        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={handleClear} title="مسح الكل">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} title="إغلاق الأدوات">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
