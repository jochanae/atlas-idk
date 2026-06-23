import { Lock, Sparkles, ArrowRight, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
}

const benefits = [
  "Unlimited presentations",
  "Premium templates & slide blocks",
  "Full Arc AI coaching",
  "No watermarks on exports",
  "Presenter mode & teleprompter",
  "Priority support",
];

export function UpgradeDialog({ open, onOpenChange, feature }: UpgradeDialogProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Lock className="w-4.5 h-4.5 text-primary" />
            </div>
            Upgrade to Pro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {feature && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-sm text-foreground">
                <span className="font-semibold">{feature}</span> is a Pro feature.
                Upgrade to unlock it and much more.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full bg-gradient-gold text-primary-foreground font-semibold gap-1.5"
              onClick={() => {
                onOpenChange(false);
                navigate("/pricing");
              }}
            >
              <Zap className="w-4 h-4" />
              View Plans
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
              Maybe later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
