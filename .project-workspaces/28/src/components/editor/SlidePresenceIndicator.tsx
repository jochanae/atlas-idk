import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceUser {
  userId: string;
  displayName: string;
  color: string;
  activeSlide: number;
}

/** Shows colored dots on slide thumbnails for other users viewing that slide */
export default function SlidePresenceIndicator({ presentationId, slideIndex }: { presentationId: string; slideIndex: number }) {
  const [viewers, setViewers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const checkPresence = () => {
      const channel = supabase.getChannels().find((c) => c.topic === `realtime:presence:${presentationId}`);
      if (!channel) return;
      const state = channel.presenceState<PresenceUser>();
      const users: PresenceUser[] = [];
      for (const entries of Object.values(state)) {
        if (entries?.[0]?.activeSlide === slideIndex) users.push(entries[0]);
      }
      setViewers(users);
    };

    checkPresence();
    const interval = setInterval(checkPresence, 1500);
    return () => clearInterval(interval);
  }, [presentationId, slideIndex]);

  if (viewers.length === 0) return null;

  return (
    <div className="absolute top-1 left-1 flex -space-x-1 z-10">
      {viewers.slice(0, 3).map((v) => (
        <div
          key={v.userId}
          className="w-3 h-3 rounded-full border border-card"
          style={{ backgroundColor: v.color }}
          title={`${v.displayName} is here`}
        />
      ))}
    </div>
  );
}
