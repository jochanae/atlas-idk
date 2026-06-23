import { useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Gift, Copy, Check, UserPlus, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useReferrals, useCreateReferral } from "@/hooks/useReferrals";
import { toast } from "sonner";

export default function Referrals() {
  const { data: referrals = [], isLoading } = useReferrals();
  const createReferral = useCreateReferral();
  const [email, setEmail] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!email.trim()) return;
    try {
      await createReferral.mutateAsync(email.trim());
      toast.success(`Referral sent to ${email}`);
      setEmail("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create referral");
    }
  };

  const copyCode = (code: string) => {
    const url = `${window.location.origin}/auth?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    toast.success("Referral link copied!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const statusColor: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    signed_up: "bg-primary/20 text-primary",
    converted: "bg-primary text-primary-foreground",
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Gift className="w-6 h-6 text-primary" />
          <h1 className="font-display text-2xl font-bold">Referrals</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Invite friends to PresentQ. When they sign up, you both benefit from extended features.
        </p>

        {/* Invite form */}
        <Card className="p-6 bg-card border-border mb-6">
          <h2 className="font-display font-semibold mb-3">Invite Someone</h2>
          <div className="flex gap-2">
            <Input
              placeholder="friend@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-secondary border-border"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <Button
              onClick={handleInvite}
              disabled={createReferral.isPending || !email.trim()}
              className="bg-gradient-gold text-primary-foreground shrink-0"
            >
              {createReferral.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
              Invite
            </Button>
          </div>
        </Card>

        {/* Referral list */}
        <Card className="p-6 bg-card border-border">
          <h2 className="font-display font-semibold mb-4">Your Referrals</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner size="sm" text="Loading referrals…" /></div>
          ) : referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet. Invite someone to get started!</p>
          ) : (
            <div className="space-y-2">
              {referrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.referred_email}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{r.code}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-[10px] ${statusColor[r.status] || ""}`}>
                      {r.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyCode(r.code)}
                    >
                      {copiedCode === r.code ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
