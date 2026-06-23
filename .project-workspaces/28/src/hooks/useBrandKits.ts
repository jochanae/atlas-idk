import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BrandKit {
  id: string;
  user_id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  created_at: string;
  updated_at: string;
}

export function useBrandKits() {
  return useQuery({
    queryKey: ["brand-kits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_kits")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BrandKit[];
    },
  });
}

export function useCreateBrandKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Omit<BrandKit, "id" | "user_id" | "created_at" | "updated_at">>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("brand_kits")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as BrandKit;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-kits"] }),
  });
}

export function useUpdateBrandKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Omit<BrandKit, "id" | "user_id" | "created_at" | "updated_at">>) => {
      const { data, error } = await supabase
        .from("brand_kits")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as BrandKit;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-kits"] }),
  });
}

export function useDeleteBrandKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_kits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-kits"] }),
  });
}
