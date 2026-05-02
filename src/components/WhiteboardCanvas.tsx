import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Pen, Eraser, Type, Square, Circle, Minus, Undo2, Redo2, Trash2, Download,
  Highlighter, Crosshair, PaintBucket, UserCheck, UserX, Check, X
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Tool = "pen" | "highlighter" | "eraser" | "text" | "rect" | "circle" | "line" | "laser";

interface DrawAction {
  type: "path" | "rect" | "circle" | "line" | "text" | "clear";
  points?: { x: number; y: number }[];
  color?: string;
  lineWidth?: number;
  opacity?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  text?: string;
  fontSize?: number;
}

interface WhiteboardCanvasProps {
  bookingId: string;
  userId: string;
  enabled?: boolean;
  isTeacher?: boolean;
  onSendData?: (msg: any) => void;
  overlay?: boolean;
  remoteActions?: DrawAction[];
  remoteLaserPos?: { x: number; y: number } | null;
  /** When true, student is allowed to draw (granted by teacher) */
  studentCanDraw?: boolean;
  /** Teacher-only: toggle student draw permission. Called when teacher clicks the grant button */
  onToggleStudentDraw?: (allow: boolean) => void;
}

const COLORS = [
  "#1a1a2e", "#e74c3c", "#2ecc71", "#3498db", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#ffffff",
];

// Virtual canvas size for coordinate normalization (same for all users)
const VIRTUAL_W = 1920;
const VIRTUAL_H = 1080;

const CURSOR_MAP: Record<Tool, string> = {
  pen: "crosshair",
  highlighter: "crosshair",
  eraser: "cell",
  text: "text",
  rect: "crosshair",
  circle: "crosshair",
  line: "crosshair",
  laser: "none",
};

export default function WhiteboardCanvas({
  bookingId,
  userId,
  enabled = true,
  isTeacher = true,
  onSendData,
  overlay = false,
  remoteActions,
  remoteLaserPos,
  studentCanDraw = false,
  onToggleStudentDraw,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#e74c3c");
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [whiteBg, setWhiteBg] = useState(false);
  // Inline text editor (replaces prompt())
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; value: string } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const actionsRef = useRef<DrawAction[]>([]);
  const undoneRef = useRef<DrawAction[]>([]);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const throttleRef = useRef<number>(0);
  const hideTimerRef = useRef<number>();

  // Teacher always draws. Student draws only when teacher grants permission.
  const canDraw = isTeacher || studentCanDraw;

  // Auto-hide toolbar after 4s of inactivity
  const resetHideTimer = useCallback(() => {
    setToolbarVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!isDrawing) setToolbarVisible(false);
    }, 4000);
  }, [isDrawing]);

  useEffect(() => {
    if (canDraw) resetHideTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [canDraw, resetHideTimer]);

  const fillBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    if (!overlay || whiteBg) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e0e0e0";
      for (let x = 20; x < w; x += 20) {
        for (let y = 20; y < h; y += 20) {
          ctx.beginPath();
          ctx.arc(x, y, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [overlay, whiteBg]);

  const drawAction = useCallback((ctx: CanvasRenderingContext2D, action: DrawAction) => {
    ctx.save();
    ctx.globalAlpha = action.opacity ?? 1;
    ctx.strokeStyle = action.color || "#1a1a2e";
    ctx.fillStyle = action.color || "#1a1a2e";
    ctx.lineWidth = action.lineWidth || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (action.type) {
      case "path":
        if (action.points && action.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            const prev = action.points[i - 1];
            const curr = action.points[i];
            const mx = (prev.x + curr.x) / 2;
            const my = (prev.y + curr.y) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
          }
          ctx.stroke();
        }
        break;
      case "rect":
        ctx.strokeRect(action.x || 0, action.y || 0, action.w || 0, action.h || 0);
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(action.x || 0, action.y || 0, action.r || 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "line":
        if (action.points && action.points.length === 2) {
          ctx.beginPath();
          ctx.moveTo(action.points[0].x, action.points[0].y);
          ctx.lineTo(action.points[1].x, action.points[1].y);
          ctx.stroke();
        }
        break;
      case "text":
        ctx.font = `${action.fontSize || 18}px sans-serif`;
        ctx.fillText(action.text || "", action.x || 0, action.y || 0);
        break;
    }
    ctx.restore();
  }, []);

  const redrawAll = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    fillBackground(ctx, w, h);
    for (const action of actionsRef.current) {
      drawAction(ctx, action);
    }
  }, [fillBackground, drawAction]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      redrawAll(ctx, rect.width, rect.height);
    }
  }, [redrawAll]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // Re-render canvas when whiteBg toggles so the background paints immediately
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    redrawAll(ctx, rect.width, rect.height);
  }, [whiteBg, redrawAll]);

  // Denormalize action from virtual canvas to local coordinates
  const denormalizeAction = useCallback((action: DrawAction): DrawAction => {
    const container = containerRef.current;
    if (!container) return action;
    const rect = container.getBoundingClientRect();
    const sx = rect.width / VIRTUAL_W;
    const sy = rect.height / VIRTUAL_H;
    const a = { ...action };
    if (a.points) a.points = a.points.map(p => ({ x: p.x * sx, y: p.y * sy }));
    if (a.x !== undefined) a.x = a.x * sx;
    if (a.y !== undefined) a.y = a.y * sy;
    if (a.w !== undefined) a.w = a.w * sx;
    if (a.h !== undefined) a.h = a.h * sy;
    if (a.r !== undefined) a.r = a.r * Math.min(sx, sy);
    if (a.lineWidth !== undefined) a.lineWidth = a.lineWidth * Math.min(sx, sy);
    if (a.fontSize !== undefined) a.fontSize = a.fontSize * Math.min(sx, sy);
    return a;
  }, []);

  // Normalize action coordinates to virtual canvas
  const normalizeAction = (action: DrawAction, sx: number, sy: number): DrawAction => {
    const a = { ...action };
    if (a.points) a.points = a.points.map(p => ({ x: p.x * sx, y: p.y * sy }));
    if (a.x !== undefined) a.x = a.x * sx;
    if (a.y !== undefined) a.y = a.y * sy;
    if (a.w !== undefined) a.w = a.w * sx;
    if (a.h !== undefined) a.h = a.h * sy;
    if (a.r !== undefined) a.r = a.r * Math.min(sx, sy);
    if (a.lineWidth !== undefined) a.lineWidth = a.lineWidth * Math.min(sx, sy);
    if (a.fontSize !== undefined) a.fontSize = a.fontSize * Math.min(sx, sy);
    return a;
  };

  useEffect(() => {
    if (!remoteActions || canDraw) return;
    actionsRef.current = remoteActions.map(a => denormalizeAction(a));
    undoneRef.current = [];
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    const rect = container.getBoundingClientRect();
    if (ctx) redrawAll(ctx, rect.width, rect.height);
  }, [remoteActions, canDraw, redrawAll, denormalizeAction]);

  const broadcastAction = (action: DrawAction) => {
    if (!enabled || !onSendData) return;
    const container = containerRef.current;
    if (!container) { onSendData({ type: "whiteboard-action", action }); return; }
    const rect = container.getBoundingClientRect();
    const scaleX = VIRTUAL_W / rect.width;
    const scaleY = VIRTUAL_H / rect.height;
    const normalized = normalizeAction(action, scaleX, scaleY);
    onSendData({ type: "whiteboard-action", action: normalized });
  };

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canDraw) return;
    e.preventDefault();
    resetHideTimer();
    const pt = getCanvasPoint(e);

    if (tool === "laser") {
      setIsDrawing(true);
      setLaserPos(pt);
      onSendData?.({ type: "laser-move", pos: pt });
      return;
    }

    if (tool === "text") {
      // Open inline floating text editor at click position; no native prompt() interruption.
      setTextEditor({ x: pt.x, y: pt.y, value: "" });
      // Focus the input on next tick after it mounts
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    setIsDrawing(true);
    if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
      currentPathRef.current = [pt];
    } else {
      shapeStartRef.current = pt;
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canDraw) return;
    
    // Show toolbar on mouse move
    if (!isDrawing) resetHideTimer();

    if (!isDrawing) return;
    e.preventDefault();

    const pt = getCanvasPoint(e);

    if (tool === "laser") {
      const now = Date.now();
      if (now - throttleRef.current < 8) return;
      throttleRef.current = now;
      setLaserPos(pt);
      onSendData?.({ type: "laser-move", pos: pt });
      return;
    }

    const now = Date.now();
    if (now - throttleRef.current < 8) return;
    throttleRef.current = now;

    if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
      currentPathRef.current.push(pt);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const points = currentPathRef.current;
      if (points.length < 2) return;

      ctx.save();
      if (tool === "highlighter") {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth * 4;
      } else if (tool === "eraser") {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = overlay ? "rgba(0,0,0,0)" : "#ffffff";
        ctx.lineWidth = lineWidth * 4;
        if (overlay) ctx.globalCompositeOperation = "destination-out";
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const p1 = points[points.length - 2];
      const p2 = points[points.length - 1];
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canDraw) return;

    if (tool === "laser") {
      setIsDrawing(false);
      setLaserPos(null);
      onSendData?.({ type: "laser-hide" });
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    const pt = "changedTouches" in e
      ? { x: e.changedTouches[0].clientX - (canvasRef.current?.getBoundingClientRect().left || 0), y: e.changedTouches[0].clientY - (canvasRef.current?.getBoundingClientRect().top || 0) }
      : getCanvasPoint(e);

    let action: DrawAction | null = null;

    if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
      const isHighlighter = tool === "highlighter";
      const isEraser = tool === "eraser";
      action = {
        type: "path",
        points: [...currentPathRef.current],
        color: isEraser ? (overlay ? "rgba(0,0,0,0)" : "#ffffff") : color,
        lineWidth: isEraser ? lineWidth * 4 : isHighlighter ? lineWidth * 4 : lineWidth,
        opacity: isHighlighter ? 0.3 : 1,
      };
    } else if (shapeStartRef.current) {
      const start = shapeStartRef.current;
      if (tool === "rect") {
        action = { type: "rect", x: Math.min(start.x, pt.x), y: Math.min(start.y, pt.y), w: Math.abs(pt.x - start.x), h: Math.abs(pt.y - start.y), color, lineWidth };
      } else if (tool === "circle") {
        const r = Math.sqrt((pt.x - start.x) ** 2 + (pt.y - start.y) ** 2);
        action = { type: "circle", x: start.x, y: start.y, r, color, lineWidth };
      } else if (tool === "line") {
        action = { type: "line", points: [start, pt], color, lineWidth };
      }
    }

    if (action) {
      actionsRef.current.push(action);
      undoneRef.current = [];
      broadcastAction(action);
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const ctx = canvas.getContext("2d");
        const rect = container.getBoundingClientRect();
        if (ctx) redrawAll(ctx, rect.width, rect.height);
      }
    }

    currentPathRef.current = [];
    shapeStartRef.current = null;
  };

  const handleUndo = () => {
    if (actionsRef.current.length === 0 || !canDraw) return;
    const last = actionsRef.current.pop()!;
    undoneRef.current.push(last);
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      const ctx = canvas.getContext("2d");
      const rect = container.getBoundingClientRect();
      if (ctx) redrawAll(ctx, rect.width, rect.height);
    }
    onSendData?.({ type: "whiteboard-undo" });
  };

  const handleRedo = () => {
    if (undoneRef.current.length === 0 || !canDraw) return;
    const action = undoneRef.current.pop()!;
    actionsRef.current.push(action);
    broadcastAction(action);
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      const ctx = canvas.getContext("2d");
      const rect = container.getBoundingClientRect();
      if (ctx) redrawAll(ctx, rect.width, rect.height);
    }
  };

  const handleClear = () => {
    if (!canDraw) return;
    actionsRef.current = [];
    undoneRef.current = [];
    onSendData?.({ type: "whiteboard-clear" });
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      const ctx = canvas.getContext("2d");
      const rect = container.getBoundingClientRect();
      if (ctx) {
        ctx.clearRect(0, 0, rect.width, rect.height);
        fillBackground(ctx, rect.width, rect.height);
      }
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `whiteboard-${bookingId}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Commit the inline text editor as a text action
  const commitText = useCallback(() => {
    if (!textEditor) return;
    const trimmed = textEditor.value.trim();
    if (trimmed) {
      const fontSize = lineWidth * 6 + 12;
      const action: DrawAction = {
        type: "text",
        text: trimmed,
        x: textEditor.x,
        y: textEditor.y + fontSize * 0.85,
        fontSize,
        color,
      };
      actionsRef.current.push(action);
      undoneRef.current = [];
      broadcastAction(action);
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const ctx = canvas.getContext("2d");
        const rect = container.getBoundingClientRect();
        if (ctx) redrawAll(ctx, rect.width, rect.height);
      }
    }
    setTextEditor(null);
  }, [textEditor, lineWidth, color, redrawAll]);

  const tools: { id: Tool; icon: typeof Pen; label: string }[] = [
    { id: "pen", icon: Pen, label: "قلم" },
    { id: "highlighter", icon: Highlighter, label: "تحديد" },
    { id: "eraser", icon: Eraser, label: "ممحاة" },
    { id: "laser", icon: Crosshair, label: "مؤشر ليزر" },
    { id: "text", icon: Type, label: "نص" },
    { id: "line", icon: Minus, label: "خط" },
    { id: "rect", icon: Square, label: "مستطيل" },
    { id: "circle", icon: Circle, label: "دائرة" },
  ];

  const cursorStyle = canDraw ? CURSOR_MAP[tool] : "default";

  // Determine which laser position to show
  const activeLaser = canDraw ? laserPos : remoteLaserPos;

  return (
    <div className={`flex flex-col h-full ${overlay ? (whiteBg ? "bg-white" : "bg-transparent") : "bg-card"}`}>
      {/* Floating Toolbar - teacher only, auto-hide */}
      {canDraw && (
        <TooltipProvider delayDuration={200}>
          <div
            className={`absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-3 py-2 rounded-2xl bg-foreground/80 backdrop-blur-md shadow-xl border border-border/20 transition-all duration-300 ${
              toolbarVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
            }`}
            onMouseEnter={() => { clearTimeout(hideTimerRef.current); setToolbarVisible(true); }}
            onMouseLeave={resetHideTimer}
          >
            {tools.map((t) => (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-9 w-9 rounded-xl transition-all duration-150 ${
                      tool === t.id
                        ? t.id === "laser"
                          ? "bg-destructive text-destructive-foreground shadow-md scale-110"
                          : "bg-primary text-primary-foreground shadow-md scale-110"
                        : "text-card/70 hover:text-card hover:bg-card/10"
                    }`}
                    onClick={() => { setTool(t.id); resetHideTimer(); }}
                  >
                    <t.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {t.label}
                </TooltipContent>
              </Tooltip>
            ))}

            <div className="w-px h-7 bg-card/20 mx-1" />

            {/* Color picker */}
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-card/70 hover:text-card hover:bg-card/10" onClick={() => setShowColors(!showColors)}>
                    <div className="w-5 h-5 rounded-full border-2 border-card/30 shadow-sm" style={{ backgroundColor: color }} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">اختيار اللون</TooltipContent>
              </Tooltip>
              {showColors && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-foreground/90 backdrop-blur-md rounded-xl shadow-xl border border-border/20 p-2 flex gap-1.5 flex-wrap w-[140px]">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-7 h-7 rounded-full border-2 transition-all duration-150 ${color === c ? "border-primary scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                      onClick={() => { setColor(c); setShowColors(false); }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Stroke width */}
            <div className="flex items-center gap-1 mx-1 w-20">
              <Slider value={[lineWidth]} onValueChange={([v]) => setLineWidth(v)} min={1} max={12} step={1} className="w-full" />
            </div>

            <div className="w-px h-7 bg-card/20 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-card/70 hover:text-card hover:bg-card/10" onClick={handleUndo}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">تراجع</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-card/70 hover:text-card hover:bg-card/10" onClick={handleRedo}>
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">إعادة</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleClear}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">مسح الكل</TooltipContent>
            </Tooltip>

            {overlay && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-9 w-9 rounded-xl transition-all duration-150 ${
                      whiteBg
                        ? "bg-primary text-primary-foreground shadow-md scale-110"
                        : "text-card/70 hover:text-card hover:bg-card/10"
                    }`}
                    onClick={() => { setWhiteBg(v => !v); resetHideTimer(); }}
                  >
                    <PaintBucket className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {whiteBg ? "إخفاء الخلفية البيضاء" : "خلفية بيضاء (تخفي مشاركة الشاشة)"}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Teacher-only: grant/revoke student drawing permission */}
            {isTeacher && onToggleStudentDraw && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-9 w-9 rounded-xl transition-all duration-150 ${
                      studentCanDraw
                        ? "bg-secondary text-secondary-foreground shadow-md scale-110"
                        : "text-card/70 hover:text-card hover:bg-card/10"
                    }`}
                    onClick={() => { onToggleStudentDraw(!studentCanDraw); resetHideTimer(); }}
                  >
                    {studentCanDraw ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {studentCanDraw ? "سحب إذن الرسم من الطالب" : "السماح للطالب بالرسم"}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-card/70 hover:text-card hover:bg-card/10" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">تحميل</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}

      {/* Student status label (view-only or permission granted) */}
      {!isTeacher && !overlay && (
        <div className={`flex items-center gap-2 p-2 border-b text-sm ${
          studentCanDraw ? "bg-secondary/15 text-secondary border-secondary/30" : "bg-muted/30 text-muted-foreground"
        }`}>
          <Pen className="h-4 w-4" />
          <span className="font-bold">
            {studentCanDraw ? "✏️ يمكنك الرسم الآن — منحك المعلم الإذن" : "السبورة - عرض فقط"}
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground mr-auto" onClick={handleDownload} title="تحميل">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Floating "permission granted" badge for student in overlay mode */}
      {!isTeacher && overlay && studentCanDraw && (
        <div className="absolute top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-bold shadow-lg animate-pulse">
          <UserCheck className="h-3.5 w-3.5" />
          <span>يمكنك الرسم</span>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${overlay ? "pointer-events-auto" : ""}`}
        style={{ cursor: cursorStyle }}
      >
        <canvas
          ref={canvasRef}
          data-whiteboard="true"
          className="absolute inset-0"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />

        {/* Laser Pointer Dot */}
        {activeLaser && (
          <div
            className="absolute pointer-events-none z-50"
            style={{
              left: activeLaser.x - 8,
              top: activeLaser.y - 8,
              width: 16,
              height: 16,
            }}
          >
            <div className="w-4 h-4 rounded-full bg-destructive animate-pulse shadow-[0_0_12px_4px_rgba(239,68,68,0.6)]" />
          </div>
        )}
      </div>
    </div>
  );
}
