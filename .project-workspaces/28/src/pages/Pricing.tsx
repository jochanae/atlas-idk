import { Check, Sparkles, Zap, Crown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useSubscription, TIER_CONFIG } from "@/hooks/useSubscription";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Get started with the essentials",
    features: ["3 presentations", "Basic Arc AI coaching", "Standard templates", "Watermarked exports"],
    cta: "Current Plan",
    highlight: false,
    priceId: null,
    icon: Sparkles,
    tier: "free" as const,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "Unlimited power for serious creators",
    features: ["Unlimited presentations", "Full Arc AI coaching", "Premium templates", "No watermarks", "Presenter mode", "Priority support"],
    cta: "Upgrade to Pro",
    highlight: true,
    priceId: TIER_CONFIG.pro.price_id,
    icon: Zap,
    tier: "pro" as const,
  },
  {
    name: "Team",
    price: "$49",
    period: "/user/month",
    description: "Collaborate and scale with your team",
    features: ["Everything in Pro", "Shared brand kits", "Deck collaboration", "Team analytics", "Centralized billing", "Admin dashboard"],
    cta: "Start Team Plan",
    highlight: false,
    priceId: TIER_CONFIG.team.price_id,
    icon: Users,
    tier: "team" as const,
  },
  {
    name: "Creator+",
    price: "$99",
    period: "/month",
    description: "For power creators who demand the best",
    features: ["Everything in Team", "White-label exports", "Audience analytics", "Rehearsal with speech feedback", "API access", "Dedicated support"],
    cta: "Go Creator+",
    highlight: false,
    priceId: TIER_CONFIG.creatorPlus.price_id,
    icon: Crown,
    tier: "creatorPlus" as const,
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: subscription } = useSubscription();
  const currentTier = subscription?.tier ?? "free";

  const handleCheckout = async (priceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleManage = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const tierOrder = ["free", "pro", "team", "creatorPlus"];
  const currentTierIndex = tierOrder.indexOf(currentTier);

  return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl font-bold mb-2">Choose Your Plan</h1>
          <p className="text-muted-foreground">Scale your presentations with the right tools.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => {
            const planIndex = tierOrder.indexOf(plan.tier);
            const isCurrentPlan = plan.tier === currentTier;
            const isDowngrade = planIndex < currentTierIndex;
            const isUpgrade = planIndex > currentTierIndex;

            return (
              <Card
                key={plan.name}
                className={`p-5 bg-card border-border relative overflow-hidden flex flex-col ${
                  plan.highlight ? "border-primary ring-1 ring-primary/20" : ""
                } ${isCurrentPlan ? "border-primary/60 bg-primary/5" : ""}`}
              >
                {plan.highlight && !isCurrentPlan && (
                  <div className="absolute top-0 right-0 bg-gradient-gold text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg">
                    Popular
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg">
                    Your Plan
                  </div>
                )}

                <div className="mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <plan.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-display text-lg font-bold mb-1">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                  <div className="mt-3">
                    <span className="font-display text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground text-xs">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.priceId ? (
                  isCurrentPlan ? (
                    <Button variant="outline" className="w-full" onClick={handleManage}>
                      Manage Plan
                    </Button>
                  ) : isDowngrade ? (
                    <Button variant="outline" className="w-full" onClick={handleManage}>
                      Downgrade
                    </Button>
                  ) : (
                    <Button
                      className={`w-full ${plan.highlight ? "bg-gradient-gold text-primary-foreground hover:opacity-90" : ""}`}
                      variant={plan.highlight ? "default" : "outline"}
                      onClick={() => handleCheckout(plan.priceId!)}
                    >
                      {plan.cta}
                    </Button>
                  )
                ) : (
                  <Button variant="outline" className="w-full" disabled={isCurrentPlan}>
                    {isCurrentPlan ? "Current Plan" : plan.cta}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
