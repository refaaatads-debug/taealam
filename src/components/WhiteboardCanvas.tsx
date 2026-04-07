import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Pen, Eraser, Type, Square, Circle, Minus, Undo2, Redo2, Trash2, Download,
  MousePointer, Palette
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Tool = "pen" | "eraser" | "text" | "rect" | "circle" | "line" | "select";

interface DrawAction {
  type: "path" | "rect" | "circle" | "line" | "text" | "clear";
  points?: { x: number; y: number }[];
  color?: string;
  lineWidth?: number;
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
}

const COLORS = [
  "#1a1a2e", "#e74c3c", "#2ecc71", "#3498db", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#ffffff",
];

export default function WhiteboardCanvas({ bookingId, userId, enabled = true }: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1a1a2e");
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showColors, setShowColors] = useState(false);

  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const actionsRef = useRef<DrawAction[]>([]);
  const undoneRef = useRef<DrawAction[]>([]);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const channelRef = useRef<any>(null);

  // Resize canvas to fit container
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
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // Supabase Realtime Broadcast for live sync
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel(`whiteboard-${bookingId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "draw" }, ({ payload }: any) => {
      if (payload.senderId === userId) return;
      const action = payload.action as DrawAction;
      actionsRef.current.push(action);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const container = containerRef.current;
      if (!ctx || !container) return;
      const rect = container.getBoundingClientRect();
      redrawAll(ctx, rect.width, rect.height);
    });

    channel.on("broadcast", { event: "clear" }, ({ payload }: any) => {
      if (payload.senderId === userId) return;
      actionsRef.current = [];
      undoneRef.current = [];
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext("2d");
      const rect = container.getBoundingClientRect();
      if (ctx) {
        ctx.clearRect(0, 0, rect.width, rect.height);
        fillBackground(ctx, rect.width, rect.height);
      }
    });

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") {
        console.error("Whiteboard channel status:", status);
      }
    });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookingId, userId, enabled]);

  const fillBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // Draw grid dots
    ctx.fillStyle = "#e0e0e0";
    for (let x = 20; x < w; x += 20) {
      for (let y = 20; y < h; y += 20) {
        ctx.beginPath();
        ctx.arc(x, y, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const redrawAll = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    fillBackground(ctx, w, h);

    for (const action of actionsRef.current) {
      drawAction(ctx, action);
    }
  };

  const drawAction = (ctx: CanvasRenderingContext2D, action: DrawAction) => {
    ctx.save();
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
  };

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const broadcastAction = (action: DrawAction) => {
    if (!enabled) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "draw",
      payload: { senderId: userId, action },
    });
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pt = getCanvasPoint(e);

    if (tool === "text") {
      const text = prompt("اكتب النص:");
      if (text) {
        const action: DrawAction = { type: "text", text, x: pt.x, y: pt.y, fontSize: lineWidth * 6, color };
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
      return;
    }

    setIsDrawing(true);

    if (tool === "pen" || tool === "eraser") {
      currentPathRef.current = [pt];
    } else {
      shapeStartRef.current = pt;
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);

    if (tool === "pen" || tool === "eraser") {
      currentPathRef.current.push(pt);

      // Live draw for smooth feedback
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const points = currentPathRef.current;
      if (points.length < 2) return;

      ctx.save();
      ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
      ctx.lineWidth = tool === "eraser" ? lineWidth * 4 : lineWidth;
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
    if (!isDrawing) return;
    setIsDrawing(false);

    const pt = "changedTouches" in e
      ? { x: e.changedTouches[0].clientX - (canvasRef.current?.getBoundingClientRect().left || 0), y: e.changedTouches[0].clientY - (canvasRef.current?.getBoundingClientRect().top || 0) }
      : getCanvasPoint(e);

    let action: DrawAction | null = null;

    if (tool === "pen" || tool === "eraser") {
      action = {
        type: "path",
        points: [...currentPathRef.current],
        color: tool === "eraser" ? "#ffffff" : color,
        lineWidth: tool === "eraser" ? lineWidth * 4 : lineWidth,
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
    if (actionsRef.current.length === 0) return;
    const last = actionsRef.current.pop()!;
    undoneRef.current.push(last);
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      const ctx = canvas.getContext("2d");
      const rect = container.getBoundingClientRect();
      if (ctx) redrawAll(ctx, rect.width, rect.height);
    }
  };

  const handleRedo = () => {
    if (undoneRef.current.length === 0) return;
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
    actionsRef.current = [];
    undoneRef.current = [];
    if (enabled) channelRef.current?.send({
      type: "broadcast",
      event: "clear",
      payload: { senderId: userId },
    });
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

  const tools: { id: Tool; icon: typeof Pen; label: string }[] = [
    { id: "pen", icon: Pen, label: "قلم" },
    { id: "eraser", icon: Eraser, label: "ممحاة" },
    { id: "text", icon: Type, label: "نص" },
    { id: "line", icon: Minus, label: "خط" },
    { id: "rect", icon: Square, label: "مستطيل" },
    { id: "circle", icon: Circle, label: "دائرة" },
  ];

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/30 flex-wrap">
        {tools.map((t) => (
          <Button
            key={t.id}
            size="icon"
            variant={tool === t.id ? "default" : "ghost"}
            className={`h-8 w-8 rounded-lg ${tool === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTool(t.id)}
            title={t.label}
          >
            <t.icon className="h-4 w-4" />
          </Button>
        ))}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Color picker */}
        <div className="relative">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg"
            onClick={() => setShowColors(!showColors)}
          >
            <div className="w-5 h-5 rounded-full border-2 border-border" style={{ backgroundColor: color }} />
          </Button>
          {showColors && (
            <div className="absolute top-10 left-0 z-50 bg-card rounded-xl shadow-lg border p-2 flex gap-1 flex-wrap w-[120px]">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? "border-primary scale-110" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => { setColor(c); setShowColors(false); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Line width */}
        <div className="flex items-center gap-1 mx-1 w-20">
          <Slider
            value={[lineWidth]}
            onValueChange={([v]) => setLineWidth(v)}
            min={1}
            max={12}
            step={1}
            className="w-full"
          />
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={handleUndo} title="تراجع">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={handleRedo} title="إعادة">
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={handleClear} title="مسح الكل">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={handleDownload} title="تحميل">
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative cursor-crosshair overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
      </div>
    </div>
  );
}
