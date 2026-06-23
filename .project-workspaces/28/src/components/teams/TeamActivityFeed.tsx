import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Activity, FileText, Users, MessageSquare, Star, Presentation } from "lucide-react";

interface ActivityItem {
  id: string;
  team_id: string;
  user_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  link: string | null;
  created_at: string;
}

const ICONS: Record<string, typeof Activity> = {
  presentation: Presentation,
  comment: MessageSquare,
  member: Users,
  template: FileText,
  rating: Star,
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TeamActivityFeed({ teamId }: { teamId: string }) {
  const { data: activities = [] } = useQuery({
    queryKey: ["team-activity", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_activity" as any)
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as ActivityItem[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`team-activity-${teamId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_activity", filter: `team_id=eq.${teamId}` }, () => {
        // Re-fetch on new activity
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId]);

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No team activity yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Activity Feed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {activities.map((act) => {
          const Icon = ICONS[act.activity_type] || Activity;
          return (
            <div key={act.id} className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-secondary/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{act.title}</p>
                {act.description && <p className="text-xs text-muted-foreground line-clamp-1">{act.description}</p>}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(act.created_at)}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
