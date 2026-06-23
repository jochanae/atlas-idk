import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PresenceUser {
  userId: string;
  displayName: string;
  color: string;
  activeSlide: number;
}

const PRESENCE_COLORS = [
  "hsl(37 90% 55%)", "hsl(210 80% 55%)", "hsl(340 75% 55%)",
  "hsl(150 70% 45%)", "hsl(280 70% 55%)", "hsl(20 85% 55%)",
];

export default function CollaborationPresence({ presentationId, activeSlideIndex }: { presentationId: string; activeSlideIndex: number }) {
  const [others, setOthers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let myUserId = "";

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      myUserId = user.id;

      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      const displayName = profile?.display_name || user.email?.split("@")[0] || "Anonymous";
      const color = PRESENCE_COLORS[Math.abs(user.id.charCodeAt(0)) % PRESENCE_COLORS.length];

      const channel = supabase.channel(`presence:${presentationId}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<{ userId: string; displayName: string; color: string; activeSlide: number }>();
          const users: PresenceUser[] = [];
          for (const key of Object.keys(state)) {
            if (key === myUserId) continue;
            const entries = state[key];
            if (entries?.[0]) users.push(entries[0]);
          }
          setOthers(users);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ userId: user.id, displayName, color, activeSlide: activeSlideIndex });
          }
        });

      return channel;
    };

    let channelRef: ReturnType<typeof supabase.channel> | undefined;
    setup().then((ch) => { channelRef = ch; });

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationId]);

  // Track slide changes
  useEffect(() => {
    const trackSlide = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const channel = supabase.getChannels().find((c) => c.topic === `realtime:presence:${presentationId}`);
      if (channel) {
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
        const displayName = profile?.display_name || user.email?.split("@")[0] || "Anonymous";
        const color = PRESENCE_COLORS[Math.abs(user.id.charCodeAt(0)) % PRESENCE_COLORS.length];
        channel.track({ userId: user.id, displayName, color, activeSlide: activeSlideIndex });
      }
    };
    trackSlide();
  }, [activeSlideIndex, presentationId]);

  if (others.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <div className="flex -space-x-1.5">
          {others.map((u) => (
            <Tooltip key={u.userId}>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6 border-2 border-card ring-1 ring-border cursor-default" style={{ borderColor: u.color }}>
                  <AvatarFallback className="text-[9px] font-bold" style={{ backgroundColor: u.color + "22", color: u.color }}>
                    {u.displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <span style={{ color: u.color }}>●</span> {u.displayName} — Slide {u.activeSlide + 1}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground ml-1">{others.length} online</span>
      </div>
    </TooltipProvider>
  );
}
