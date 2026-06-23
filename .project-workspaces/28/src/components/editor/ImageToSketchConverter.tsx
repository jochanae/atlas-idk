import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, Pencil, Loader2, Download, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImageToSketchConverterProps {
  open: boolean;
  onClose: () => void;
  onInsert: (imageUrl: string) => void;
}

type SketchStyle = "line-art" | "pencil" | "ink" | "charcoal";

const STYLES: { id: SketchStyle; label: string; prompt: string }[] = [
  { id: "line-art", label: "Clean Line Art", prompt: "Convert this image into a clean, minimal line art drawing with thin black lines on white background. No shading, just outlines." },
  { id: "pencil", label: "Pencil Sketch", prompt: "Convert this image into a realistic graphite pencil sketch with soft shading and cross-hatching on white paper." },
  { id: "ink", label: "Ink Drawing", prompt: "Convert this image into a bold black ink drawing with confident strokes and high contrast on white background." },
  { id: "charcoal", label: "Charcoal Sketch", prompt: "Convert this image into a dramatic charcoal sketch with deep shadows and expressive strokes on white paper." },
];

export default function ImageToSketchConverter({ open, onClose, onInsert }: ImageToSketchConverterProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sketchResult, setSketchResult] = useState<string | null>(null);
  const [style, setStyle] = useState<SketchStyle>("line-art");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSourceImage(reader.result as string);
      setSketchResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleConvert = async () => {
    if (!sourceImage) return;
    setLoading(true);
    setSketchResult(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) { toast.error("Please sign in first"); return; }

      const selectedStyle = STYLES.find((s) => s.id === style)!;

      // Use the AI gateway to convert the image
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/image-to-sketch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageDataUrl: sourceImage,
          style: selectedStyle.prompt,
        }),
      });

      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted — please add funds"); return; }
      if (!resp.ok) throw new Error("Conversion failed");

      const { imageUrl } = await resp.json();
      setSketchResult(imageUrl);
      toast.success("Sketch created!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to convert image");
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (sketchResult) {
      onInsert(sketchResult);
      onClose();
    }
  };

  const handleReset = () => {
    setSourceImage(null);
    setSketchResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[95dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Image → Sketch Converter
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Style selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Style:</span>
            <Select value={style} onValueChange={(v) => setStyle(v as SketchStyle)}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLES.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Image area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Source */}
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Original</span>
              {sourceImage ? (
                <div className="relative rounded-lg border border-border overflow-hidden aspect-video bg-muted">
                  <img src={sourceImage} alt="Source" className="w-full h-full object-contain" />
                  <button
                    onClick={handleReset}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Upload a photo</span>
                </button>
              )}
            </div>

            {/* Result */}
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sketch</span>
              {loading ? (
                <div className="w-full aspect-video rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Converting to sketch...</span>
                </div>
              ) : sketchResult ? (
                <div className="relative rounded-lg border border-border overflow-hidden aspect-video bg-white">
                  <img src={sketchResult} alt="Sketch" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-full aspect-video rounded-lg border border-border bg-muted flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Result will appear here</span>
                </div>
              )}
            </div>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {sourceImage && !sketchResult && (
              <Button onClick={handleConvert} disabled={loading} className="gap-1.5">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                Convert to Sketch
              </Button>
            )}
            {sketchResult && (
              <>
                <Button variant="outline" onClick={handleConvert} disabled={loading} className="gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Retry
                </Button>
                <Button onClick={handleInsert} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Insert to Slide
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
