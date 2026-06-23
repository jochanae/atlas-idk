import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Loader2, Download, Save, RotateCw, Upload, X } from "lucide-react";
import { useBrandKits } from "@/hooks/useBrandKits";

const STYLES = [
  { value: "modern and minimal", label: "Modern Minimal" },
  { value: "bold and geometric", label: "Bold Geometric" },
  { value: "elegant and luxurious", label: "Elegant Luxury" },
  { value: "playful and colorful", label: "Playful & Fun" },
  { value: "retro vintage", label: "Retro Vintage" },
  { value: "tech and futuristic", label: "Tech Futuristic" },
];

interface LogoGeneratorProps {
  onSaveToBrandKit?: (logoDataUrl: string) => void;
}

export default function LogoGenerator({ onSaveToBrandKit }: LogoGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("modern and minimal");
  const [generating, setGenerating] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const refFileInput = useRef<HTMLInputElement>(null);
  const { data: kits = [] } = useBrandKits();

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImage(reader.result as string);
      setReferenceFileName(file.name);
    };
    reader.readAsDataURL(file);
    // Reset so user can re-select same file
    e.target.value = "";
  };

  const clearReference = () => {
    setReferenceImage(null);
    setReferenceFileName(null);
  };

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe your brand or logo idea");
      return;
    }
    setGenerating(true);
    setLogoDataUrl(null);
    try {
      const body: Record<string, any> = { prompt: prompt.trim(), style };
      if (referenceImage) body.referenceImage = referenceImage;
      // Only inject brand kit colors when generating from scratch (no reference image)
      // When a reference image is uploaded, preserve its existing colors unless user says otherwise
      if (!referenceImage) {
        const activeKit = kits[0];
        if (activeKit) {
          body.brandColors = {
            primary: activeKit.primary_color,
            secondary: activeKit.secondary_color,
            accent: activeKit.accent_color,
          };
        }
      }

      const { data, error } = await supabase.functions.invoke("generate-logo", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.image) throw new Error("No image returned");
      const mime = data.mimeType || "image/png";
      setLogoDataUrl(`data:${mime};base64,${data.image}`);
      toast.success(referenceImage ? "Logo refined!" : "Logo generated!");
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const downloadAs = (format: string) => {
    if (!logoDataUrl) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = format === "ico" ? 64 : 1024;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);

      let mimeType = "image/png";
      let ext = format;
      if (format === "jpg") mimeType = "image/jpeg";
      if (format === "ico") { mimeType = "image/png"; ext = "ico"; }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `logo.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Downloaded as .${ext}`);
      }, mimeType);
    };
    img.src = logoDataUrl;
  };

  const downloadSvgPlaceholder = () => {
    if (!logoDataUrl) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024"><image width="1024" height="1024" xlink:href="${logoDataUrl}"/></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "logo.svg";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as .svg");
  };

  const handleSave = async () => {
    if (!logoDataUrl) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const res = await fetch(logoDataUrl);
      const blob = await res.blob();
      const path = `${user.id}/ai-logo-${Date.now()}.png`;
      const { error } = await supabase.storage.from("slide-assets").upload(path, blob, { upsert: true, contentType: "image/png" });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("slide-assets").getPublicUrl(path);
      onSaveToBrandKit?.(publicUrl);
      toast.success("Logo saved to Brand Kit!");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-sm">AI Logo Generator</h3>
          <p className="text-xs text-muted-foreground">Describe your brand and get a logo instantly</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Reference image upload */}
        <div>
          <input
            ref={refFileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleReferenceUpload}
          />
          {referenceImage ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2">
              <img
                src={referenceImage}
                alt="Reference"
                className="h-12 w-12 rounded object-contain border border-border bg-background"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{referenceFileName}</p>
                <p className="text-[10px] text-muted-foreground">Reference image — AI will refine this</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={clearReference}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 py-5"
              onClick={() => refFileInput.current?.click()}
            >
              <Upload className="w-4 h-4 text-primary" />
              <span>Upload existing logo to refine</span>
            </Button>
          )}
        </div>

        <Input
          placeholder={referenceImage
            ? "e.g. Make it more modern, add a gradient, simplify the shapes"
            : "e.g. A modern tech startup called Nova that focuses on AI analytics"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
        />
        <div className="flex gap-2">
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger className="h-9 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={generate} disabled={generating} className="bg-gradient-gold text-primary-foreground shrink-0">
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
            {generating ? "Generating…" : referenceImage ? "Refine" : "Generate"}
          </Button>
        </div>
      </div>

      {generating && (
        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-6 flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer" />
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3 relative z-10" />
          <p className="text-sm text-muted-foreground relative z-10">
            {referenceImage ? "Refining your logo…" : "Generating your logo…"}
          </p>
          <div className="mt-3 w-48 h-1.5 rounded-full bg-primary/10 overflow-hidden relative z-10">
            <div className="h-full rounded-full bg-primary/40 animate-shimmer" style={{ width: "40%" }} />
          </div>
        </div>
      )}

      {logoDataUrl && !generating && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-border bg-white p-6 flex items-center justify-center">
            <img src={logoDataUrl} alt="Generated logo" className="max-h-48 max-w-full object-contain" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadAs("png")}>
              <Download className="w-3.5 h-3.5 mr-1" /> PNG
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadAs("jpg")}>
              <Download className="w-3.5 h-3.5 mr-1" /> JPG
            </Button>
            <Button variant="outline" size="sm" onClick={downloadSvgPlaceholder}>
              <Download className="w-3.5 h-3.5 mr-1" /> SVG
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadAs("ico")}>
              <Download className="w-3.5 h-3.5 mr-1" /> ICO
            </Button>
            {onSaveToBrandKit && (
              <Button variant="default" size="sm" onClick={handleSave}>
                <Save className="w-3.5 h-3.5 mr-1" /> Save to Brand Kit
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={generate} disabled={generating}>
              <RotateCw className="w-3.5 h-3.5 mr-1" /> Regenerate
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
