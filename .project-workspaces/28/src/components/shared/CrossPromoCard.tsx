import { useState, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CrossPromoCardProps {
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  icon: ReactNode;
  dismissKey: string;
}

export default function CrossPromoCard({ title, description, ctaText, ctaUrl, icon, dismissKey }: CrossPromoCardProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 mt-3">
      <button
        onClick={handleDismiss}
        className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>

      <div className="flex-1 min-w-0 pr-4">
        <p className="text-xs font-semibold text-foreground leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-snug truncate">{description}</p>
      </div>

      <Button
        size="sm"
        className="shrink-0 h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={() => window.open(ctaUrl, "_blank", "noopener")}
      >
        {ctaText}
      </Button>

      <span className="absolute bottom-0.5 right-2 text-[8px] text-muted-foreground/50">From Into Innovations</span>
    </div>
  );
}
