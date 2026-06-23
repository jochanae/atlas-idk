import { useState } from "react";
import { Sparkles, Palette, Loader2, Users, Maximize2, Minimize2, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBrandKits } from "@/hooks/useBrandKits";
import { cn } from "@/lib/utils";

export type RemixMode = "brand" | "audience" | "length";

interface RemixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (brandKitId: string | null, mode?: RemixMode, options?: Record<string, string>) => void;
  isLoading?: boolean;
  presentationTitle?: string;
}

const audienceOptions = [
  { id: "investors", label: "Investors", desc: "Focus on ROI, traction, market size" },
  { id: "partners", label: "Partners", desc: "Emphasize collaboration, integration, mutual benefit" },
  { id: "executive", label: "Executive", desc: "High-level, outcome-driven, concise" },
  { id: "technical", label: "Technical", desc: "Deep-dive, specs, architecture" },
  { id: "customer", label: "Customers", desc: "Benefits, value, ease of use" },
];

const lengthOptions = [
  { id: "lightning", label: "Lightning (5 min)", desc: "Condense to 3-5 key slides" },
  { id: "standard", label: "Standard (15 min)", desc: "Core message, balanced depth" },
  { id: "keynote", label: "Keynote (30+ min)", desc: "Expand with stories, data, Q&A prep" },
];

export default function RemixDialog({ open, onOpenChange, onConfirm, isLoading, presentationTitle }: RemixDialogProps) {
  const { data: brandKits = [] } = useBrandKits();
  const [selectedKit, setSelectedKit] = useState<string | null>(null);
  const [mode, setMode] = useState<RemixMode>("brand");
  const [audienceTarget, setAudienceTarget] = useState<string | null>(null);
  const [lengthTarget, setLengthTarget] = useState<string | null>(null);

  const handleConfirm = () => {
    const options: Record<string, string> = {};
    if (mode === "audience" && audienceTarget) options.audience = audienceTarget;
    if (mode === "length" && lengthTarget) options.length = lengthTarget;
    onConfirm(selectedKit, mode, options);
  };

  const canConfirm = mode === "brand" || (mode === "audience" && audienceTarget) || (mode === "length" && lengthTarget);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="w-5 h-5 text-primary" />
            Remix Deck
          </DialogTitle>
          <DialogDescription>
            Create a fresh version of{" "}
            <span className="font-semibold text-foreground">{presentationTitle || "this deck"}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as RemixMode)} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="brand" className="flex-1 gap-1.5 text-xs">
              <Palette className="w-3.5 h-3.5" /> Brand Restyle
            </TabsTrigger>
            <TabsTrigger value="audience" className="flex-1 gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" /> Audience
            </TabsTrigger>
            <TabsTrigger value="length" className="flex-1 gap-1.5 text-xs">
              <Maximize2 className="w-3.5 h-3.5" /> Length
            </TabsTrigger>
          </TabsList>

          {/* Brand Kit Tab */}
          <TabsContent value="brand" className="mt-3">
            <p className="text-xs text-muted-foreground mb-3">Apply a different brand kit (colors, fonts, logo) to a copy of your deck.</p>
            {brandKits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <Palette className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No brand kits yet.</p>
                <p className="text-xs text-muted-foreground mt-1">A copy will be created with the current theme.</p>
              </div>
            ) : (
              <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
                {brandKits.map((kit) => (
                  <button
                    key={kit.id}
                    onClick={() => setSelectedKit(kit.id === selectedKit ? null : kit.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                      selectedKit === kit.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:border-primary/30 bg-card"
                    )}
                  >
                    <div className="flex gap-1 shrink-0">
                      <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: kit.primary_color }} />
                      <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: kit.secondary_color }} />
                      <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: kit.accent_color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{kit.name}</p>
                      <p className="text-[11px] text-muted-foreground">{kit.heading_font} / {kit.body_font}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Audience Tab */}
          <TabsContent value="audience" className="mt-3">
            <p className="text-xs text-muted-foreground mb-3">Adapt your deck's tone and emphasis for a different audience.</p>
            <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
              {audienceOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAudienceTarget(opt.id === audienceTarget ? null : opt.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                    audienceTarget === opt.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30 bg-card"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>

          {/* Length Tab */}
          <TabsContent value="length" className="mt-3">
            <p className="text-xs text-muted-foreground mb-3">Condense or expand your deck to fit a different time slot.</p>
            <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
              {lengthOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLengthTarget(opt.id === lengthTarget ? null : opt.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                    lengthTarget === opt.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30 bg-card"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !canConfirm}
            className="bg-gradient-gold text-primary-foreground font-semibold gap-1.5"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {mode === "brand" ? (selectedKit ? "Remix with Brand Kit" : "Remix (Copy)") :
             mode === "audience" ? "Remix for Audience" :
             "Remix Length"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
