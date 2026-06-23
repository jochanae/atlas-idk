import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDownloadGates() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["download-gates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("download_gates" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { resource_id?: string; lead_magnet_id?: string; gate_type?: string; require_name?: boolean; custom_message?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("download_gates" as any).insert({ ...values, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["download-gates"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; is_active?: boolean; custom_message?: string }) => {
      const { error } = await supabase.from("download_gates" as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["download-gates"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("download_gates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["download-gates"] }),
  });

  return { ...query, create, update, remove };
}

export function useGateSubmissions(gateId?: string) {
  return useQuery({
    queryKey: ["gate-submissions", gateId],
    enabled: !!gateId,
    queryFn: async () => {
      const { data, error } = await supabase.from("gate_submissions" as any).select("*").eq("gate_id", gateId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}
