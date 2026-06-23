import { useState } from "react";
import { Share2, Globe, Copy, Code, Check, Link2, GlobeIcon } from "lucide-react";
import CrossPromoCard from "@/components/shared/CrossPromoCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { nativeShare } from "@/lib/nativeShare";

interface ShareDialogProps {
  presentationId: string;
  isPublic: boolean;
  onTogglePublic: (isPublic: boolean) => void;
}

export default function ShareDialog({ presentationId, isPublic, onTogglePublic }: ShareDialogProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const viewUrl = `${window.location.origin}/view/${presentationId}`;
  const embedUrl = `${window.location.origin}/embed/${presentationId}`;
  const embedCode = `<iframe src="${embedUrl}" width="960" height="540" frameborder="0" allowfullscreen style="border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.12);"></iframe>`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied!`);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Share2 className="w-3.5 h-3.5" />
          <span className="text-xs">Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Share Presentation</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Public toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Public access</p>
                <p className="text-xs text-muted-foreground">Anyone with the link can view</p>
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={onTogglePublic} />
          </div>

          {!isPublic && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Enable public access to share your presentation via link or embed.
            </p>
          )}

          {isPublic && (
            <Tabs defaultValue="link">
              <TabsList className="w-full">
                <TabsTrigger value="link" className="flex-1 gap-1.5 text-xs">
                  <Link2 className="w-3 h-3" /> Share Link
                </TabsTrigger>
                <TabsTrigger value="embed" className="flex-1 gap-1.5 text-xs">
                  <Code className="w-3 h-3" /> Embed
                </TabsTrigger>
              </TabsList>

              <TabsContent value="link" className="space-y-3 mt-3">
                <Label className="text-xs text-muted-foreground">Viewer link (no login required)</Label>
                <div className="flex gap-2">
                  <Input value={viewUrl} readOnly className="text-xs bg-secondary border-border" />
                  <Button variant="outline" size="icon" className="shrink-0 h-9 w-9" onClick={() => copyToClipboard(viewUrl, "Link")}>
                    {copied === "Link" ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="default"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    onClick={() => nativeShare({ title: "Check out my presentation", url: viewUrl })}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="embed" className="space-y-3 mt-3">
                <Label className="text-xs text-muted-foreground">Paste this into your website HTML</Label>
                <div className="relative">
                  <pre className="text-[11px] bg-secondary border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
                    {embedCode}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2 h-7 gap-1 text-[10px]"
                    onClick={() => copyToClipboard(embedCode, "Embed code")}
                  >
                    {copied === "Embed code" ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                    Copy
                  </Button>
                </div>
                <div className="border border-border rounded-lg overflow-hidden bg-secondary/30 p-3">
                  <p className="text-[10px] text-muted-foreground mb-2">Preview:</p>
                  <div className="aspect-video rounded border border-border overflow-hidden bg-background">
                    <iframe src={embedUrl} className="w-full h-full" title="Preview" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <CrossPromoCard
            title="Need a landing page for this?"
            description="IntoIQ turns your pitch into a deployed funnel with lead capture — powered by AI"
            ctaText="Try IntoIQ"
            ctaUrl="https://intoiq.app"
            icon={<GlobeIcon className="w-4 h-4 text-primary" />}
            dismissKey="promo-intoiq-share"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
