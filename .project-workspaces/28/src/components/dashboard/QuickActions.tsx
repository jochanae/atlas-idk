import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { BookOpen, Mic, Monitor, ExternalLink, FileDown, Palette, type LucideIcon } from "lucide-react";

interface QuickAction {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  tint: string;
}

const quickActions: QuickAction[] = [
  { icon: BookOpen, title: "Templates", description: "Pro starting points", action: "templates", tint: "bg-emerald-500/10 text-emerald-500" },
  { icon: Mic, title: "Practice", description: "AI coaching feedback", action: "practice", tint: "bg-blue-500/10 text-blue-500" },
  { icon: Monitor, title: "Teleprompter", description: "Scrolling script reader", action: "teleprompter", tint: "bg-orange-500/10 text-orange-500" },
  { icon: Palette, title: "Logo Generator", description: "AI-powered branding", action: "logo", tint: "bg-pink-500/10 text-pink-500" },
  { icon: ExternalLink, title: "Quick Research", description: "Explore with Perplexity/GPT", action: "deepdive", tint: "bg-rose-500/10 text-rose-500" },
  { icon: FileDown, title: "Audience Resources", description: "Handouts & more", action: "resources", tint: "bg-teal-500/10 text-teal-500" },
];

interface QuickActionsProps {
  onAction: (action: string) => void;
}

const QuickActions = ({ onAction }: QuickActionsProps) => (
  <div>
    <h2 className="font-display text-base font-semibold mb-3">Quick Start</h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {quickActions.map((item, i) => (
        <motion.div
          key={item.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <Card
            className="group p-4 bg-card border-border hover:border-primary/30 transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5"
            onClick={() => onAction(item.action)}
          >
            <div className={`w-9 h-9 rounded-lg ${item.tint} flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform`}>
              <item.icon className="w-4.5 h-4.5" />
            </div>
            <h3 className="font-display font-semibold text-sm">{item.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
          </Card>
        </motion.div>
      ))}
    </div>
  </div>
);

export default QuickActions;
