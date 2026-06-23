import { useState } from "react";
import { Monitor, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

export default function MobileEditorWarning() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);

  if (!isMobile || dismissed) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Monitor className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs text-foreground">
          The editor works best on desktop. Some features may be limited on mobile.
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setDismissed(true)}>
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}
