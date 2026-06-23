import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Square, Circle, Type, Eraser, Undo2, Redo2, Download, Trash2, X, Minus, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Tool = "pen" | "line" | "rect" | "circle" | "eraser" | "text";
type DrawAction = {
  tool: Tool;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  color: string;
  width: number;
  text?: string;
};

const COLORS = [
  "hsl(var(--foreground))",
  "hsl(var(--primary))",
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
  "hsl(var(--muted-foreground))",
];

interface QuickSketchCanvasProps {
  open: boolean;
  onClose: () => void;
  onExport: (dataUrl: string) => void;
}

export default function QuickSketchCanvas({ open, onClose, onExport }: QuickSketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawAction[]>([]);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // White background for export
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const action of actions) {
      ctx.strokeStyle = action.color;
      ctx.fillStyle = action.color;
      ctx.lineWidth = action.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (action.tool === "pen" && action.points && action.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
      } else if (action.tool === "eraser" && action.points && action.points.length > 1) {
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = action.width * 4;
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      } else if (action.tool === "line" && action.start && action.end) {
        ctx.beginPath();
        ctx.moveTo(action.start.x, action.start.y);
        ctx.lineTo(action.end.x, action.end.y);
        ctx.stroke();
      } else if (action.tool === "rect" && action.start && action.end) {
        ctx.strokeRect(action.start.x, action.start.y, action.end.x - action.start.x, action.end.y - action.start.y);
      } else if (action.tool === "circle" && action.start && action.end) {
        const rx = Math.abs(action.end.x - action.start.x) / 2;
        const ry = Math.abs(action.end.y - action.start.y) / 2;
        const cx = action.start.x + (action.end.x - action.start.x) / 2;
        const cy = action.start.y + (action.end.y - action.start.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (action.tool === "text" && action.start && action.text) {
        ctx.font = `${action.width * 6}px sans-serif`;
        ctx.fillText(action.text, action.start.x, action.start.y);
      }
    }
  }, [actions]);

  useEffect(() => { redrawCanvas(); }, [redrawCanvas]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pt = getCanvasPoint(e);
    if (tool === "text") {
      setTextPos(pt);
      return;
    }
    setIsDrawing(true);
    setStartPoint(pt);
    if (tool === "pen" || tool === "eraser") {
      setCurrentPoints([pt]);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);
    if (tool === "pen" || tool === "eraser") {
      setCurrentPoints((prev) => [...prev, pt]);
      // Live draw
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx && currentPoints.length > 0) {
        ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
        ctx.lineWidth = tool === "eraser" ? strokeWidth * 4 : strokeWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(currentPoints[currentPoints.length - 1].x, currentPoints[currentPoints.length - 1].y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
    }
  };

  const handleEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const pt = getCanvasPoint(e);

    let newAction: DrawAction;
    if (tool === "pen" || tool === "eraser") {
      newAction = { tool, points: [...currentPoints, pt], color, width: strokeWidth };
    } else {
      newAction = { tool, start: startPoint!, end: pt, color, width: strokeWidth };
    }

    setActions((prev) => [...prev, newAction]);
    setRedoStack([]);
    setCurrentPoints([]);
    setStartPoint(null);
  };

  const handleTextSubmit = () => {
    if (!textPos || !textInput.trim()) { setTextPos(null); return; }
    setActions((prev) => [...prev, { tool: "text", start: textPos, color, width: strokeWidth, text: textInput }]);
    setRedoStack([]);
    setTextInput("");
    setTextPos(null);
  };

  const undo = () => {
    if (actions.length === 0) return;
    const last = actions[actions.length - 1];
    setActions((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setActions((prev) => [...prev, last]);
  };

  const clearCanvas = () => { setActions([]); setRedoStack([]); };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    redrawCanvas();
    const dataUrl = canvas.toDataURL("image/png");
    onExport(dataUrl);
    onClose();
  };

  const tools: { id: Tool; icon: React.ElementType; label: string }[] = [
    { id: "pen", icon: Pencil, label: "Pen" },
    { id: "line", icon: Minus, label: "Line" },
    { id: "rect", icon: Square, label: "Rectangle" },
    { id: "circle", icon: Circle, label: "Circle" },
    { id: "text", icon: Type, label: "Text" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[95dvh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Quick Sketch Canvas
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={undo} disabled={actions.length === 0}><Undo2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={redo} disabled={redoStack.length === 0}><Redo2 className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={clearCanvas}><Trash2 className="w-3.5 h-3.5" /></Button>
              <Button size="sm" className="h-7 gap-1.5 text-xs ml-2" onClick={handleExport}>
                <Download className="w-3 h-3" /> Insert to Slide
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex">
          {/* Tool palette */}
          <div className="w-12 border-r border-border bg-card p-1.5 space-y-1 flex flex-col items-center">
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  tool === t.id ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                title={t.label}
              >
                <t.icon className="w-4 h-4" />
              </button>
            ))}

            <div className="w-8 border-t border-border my-1" />

            {/* Color swatches */}
            <div className="space-y-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? "border-primary scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <div className="w-8 border-t border-border my-1" />

            {/* Stroke width */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[8px] text-muted-foreground">{strokeWidth}px</span>
              <Slider
                value={[strokeWidth]}
                onValueChange={([v]) => setStrokeWidth(v)}
                min={1}
                max={12}
                step={1}
                orientation="vertical"
                className="h-16"
              />
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-white relative" style={{ aspectRatio: "16/9" }}>
            <canvas
              ref={canvasRef}
              width={1920}
              height={1080}
              className="w-full h-full cursor-crosshair touch-none"
              onMouseDown={handleStart}
              onMouseMove={handleMove}
              onMouseUp={handleEnd}
              onMouseLeave={(e) => isDrawing && handleEnd(e)}
              onTouchStart={handleStart}
              onTouchMove={handleMove}
              onTouchEnd={handleEnd}
            />

            {/* Text input overlay */}
            <AnimatePresence>
              {textPos && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute z-10"
                  style={{
                    left: `${(textPos.x / 1920) * 100}%`,
                    top: `${(textPos.y / 1080) * 100}%`,
                  }}
                >
                  <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 shadow-lg">
                    <Input
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Type text..."
                      className="h-7 text-xs w-40"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                    />
                    <Button size="icon" className="h-7 w-7" onClick={handleTextSubmit}><Type className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTextPos(null)}><X className="w-3 h-3" /></Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
