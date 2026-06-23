import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { Json } from "@/integrations/supabase/types";

export interface Slide {
  id: string;
  presentation_id: string;
  user_id: string;
  block_type: string;
  content: Json;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useSlides(presentationId: string | undefined) {
  return useQuery({
    queryKey: ["slides", presentationId],
    enabled: !!presentationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slides")
        .select("*")
        .eq("presentation_id", presentationId!)
        .order("sort_order");
      if (error) throw error;
      return data as Slide[];
    },
  });
}

export function useCreateSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { presentation_id: string; block_type: string; content: Json; sort_order: number; notes?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("slides").insert({ ...input, user_id: user.id }).select().single();
      if (error) throw error;
      return data as Slide;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["slides", data.presentation_id] });
    },
  });
}

export function useUpdateSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; block_type?: string; content?: Json; notes?: string | null; sort_order?: number }) => {
      const { data, error } = await supabase.from("slides").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as Slide;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["slides", data.presentation_id] });
    },
  });
}

export function useDeleteSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, presentationId }: { id: string; presentationId: string }) => {
      const { error } = await supabase.from("slides").delete().eq("id", id);
      if (error) throw error;
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["slides", presId] });
    },
  });
}

export function useDuplicateSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slide, sortOrder }: { slide: Slide; sortOrder: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("slides").insert({
        presentation_id: slide.presentation_id,
        user_id: user.id,
        block_type: slide.block_type,
        content: slide.content,
        notes: slide.notes,
        sort_order: sortOrder,
      }).select().single();
      if (error) throw error;
      return data as Slide;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["slides", data.presentation_id] });
    },
  });
}

export function useReorderSlides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slides, presentationId }: { slides: { id: string; sort_order: number }[]; presentationId: string }) => {
      const promises = slides.map((s) =>
        supabase.from("slides").update({ sort_order: s.sort_order }).eq("id", s.id)
      );
      await Promise.all(promises);
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["slides", presId] });
    },
  });
}
