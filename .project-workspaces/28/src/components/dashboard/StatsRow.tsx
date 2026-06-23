import { Layers, Sparkles, Clock, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

interface StatsRowProps {
  totalDecks: number;
  tier: string;
  isAdmin: boolean;
  recentCount: number;
}

const StatsRow = ({ totalDecks, tier, isAdmin, recentCount }: StatsRowProps) => {
  const stats = [
    { label: "Total Decks", value: totalDecks, icon: Layers, tint: "bg-primary/10 text-primary" },
    { label: "Plan", value: tier === "free" ? "Free" : tier.charAt(0).toUpperCase() + tier.slice(1), icon: Sparkles, tint: "bg-purple-500/10 text-purple-500" },
    { label: "Recent Edits", value: recentCount, icon: Clock, tint: "bg-emerald-500/10 text-emerald-500" },
    { label: "Hours Saved", value: "—", icon: TrendingUp, tint: "bg-blue-500/10 text-blue-500" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-3.5 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${stat.tint} flex items-center justify-center shrink-0`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-display font-bold truncate">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default StatsRow;
