import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  join_url: string | null;
  is_published: boolean;
  created_at: string;
}

export function useUpcomingEvents() {
  return useQuery({
    queryKey: ["upcoming-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as AppEvent[];
    },
  });
}

export function useEventReminders() {
  return useQuery({
    queryKey: ["event-reminders"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("event_reminders")
        .select("event_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((r: { event_id: string }) => r.event_id);
    },
  });
}

export function useToggleReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, isSet }: { eventId: string; isSet: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (isSet) {
        await supabase.from("event_reminders").delete().eq("user_id", user.id).eq("event_id", eventId);
      } else {
        await supabase.from("event_reminders").insert({ user_id: user.id, event_id: eventId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-reminders"] });
    },
  });
}
