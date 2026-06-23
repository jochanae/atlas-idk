/**
 * CertificationBadges — Shows earned teaching milestone badges on the Settings/Profile page.
 * Badges are computed client-side from user data.
 */
import { useMemo } from "react";
import { Award, BookOpen, Mic, Video, Presentation, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePresentations } from "@/hooks/usePresentations";
import { useRehearsalRecordings } from "@/hooks/useRehearsalRecordings";
import { useCoachingReports } from "@/hooks/useCoachingReports";

interface CertBadge {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  earned: boolean;
  color: string;
}

export default function CertificationBadges() {
  const { data: presentations = [] } = usePresentations();
  const rehearsalQuery = useRehearsalRecordings();
  const reportsQuery = useCoachingReports();

  const recordings = rehearsalQuery.data ?? [];
  const reports = reportsQuery.data ?? [];

  const badges = useMemo<CertBadge[]>(() => {
    const deckCount = presentations.length;
    const rehearsalCount = recordings.length;
    const reportCount = reports.length;

    return [
      {
        id: "first-deck",
        label: "First Deck",
        description: "Created your first presentation",
        icon: <Presentation className="w-3.5 h-3.5" />,
        earned: deckCount >= 1,
        color: "bg-primary/15 text-primary border-primary/30",
      },
      {
        id: "deck-builder",
        label: "Deck Builder",
        description: "Created 5 or more presentations",
        icon: <BookOpen className="w-3.5 h-3.5" />,
        earned: deckCount >= 5,
        color: "bg-accent/15 text-accent-foreground border-accent/30",
      },
      {
        id: "first-rehearsal",
        label: "Stage Ready",
        description: "Completed your first rehearsal",
        icon: <Mic className="w-3.5 h-3.5" />,
        earned: rehearsalCount >= 1,
        color: "bg-secondary text-secondary-foreground border-border",
      },
      {
        id: "rehearsal-pro",
        label: "Rehearsal Pro",
        description: "Completed 10+ rehearsals",
        icon: <Video className="w-3.5 h-3.5" />,
        earned: rehearsalCount >= 10,
        color: "bg-primary/20 text-primary border-primary/40",
      },
      {
        id: "coached",
        label: "AI Coached",
        description: "Received your first coaching report",
        icon: <Star className="w-3.5 h-3.5" />,
        earned: reportCount >= 1,
        color: "bg-destructive/15 text-destructive border-destructive/30",
      },
      {
        id: "master-presenter",
        label: "Master Presenter",
        description: "10+ decks, 10+ rehearsals, and 5+ coaching reports",
        icon: <Award className="w-3.5 h-3.5" />,
        earned: deckCount >= 10 && rehearsalCount >= 10 && reportCount >= 5,
        color: "bg-primary/25 text-primary border-primary/50",
      },
    ];
  }, [presentations, recordings, reports]);

  const earnedCount = badges.filter(b => b.earned).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Award className="w-4 h-4 text-primary" />
          Teaching Badges
        </h3>
        <span className="text-xs text-muted-foreground">
          {earnedCount}/{badges.length} earned
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <Tooltip key={badge.id}>
            <TooltipTrigger asChild>
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  badge.earned
                    ? badge.color
                    : "bg-secondary/30 text-muted-foreground/40 border-border/50 opacity-50"
                }`}
              >
                {badge.icon}
                {badge.label}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              <p className="font-medium">{badge.label}</p>
              <p className="text-muted-foreground">{badge.description}</p>
              {!badge.earned && <p className="text-primary mt-1">Not yet earned</p>}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
