import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_CONFIG = {
  nextSlide: "ArrowRight",
  prevSlide: "ArrowLeft",
  toggleNotes: "n",
  togglePointer: "p",
  blackScreen: "b",
  endPresentation: "Escape",
};

export function useRemotePresets() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["remote-presets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("remote_presets" as any).select("*").order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { name: string; config?: any; is_default?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("remote_presets" as any).insert({
        ...values,
        config: values.config ?? DEFAULT_CONFIG,
        user_id: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["remote-presets"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; config?: any; is_default?: boolean }) => {
      const { error } = await supabase.from("remote_presets" as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["remote-presets"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("remote_presets" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["remote-presets"] }),
  });

  return { ...query, create, update, remove, DEFAULT_CONFIG };
}
