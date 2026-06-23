import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import type { Json } from "@/integrations/supabase/types";

export interface Presentation {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  goal: string | null;
  theme: Json | null;
  is_public: boolean;
  slide_order: string[];
  created_at: string;
  updated_at: string;
  folder: string | null;
  deleted_at: string | null;
}

export function usePresentations() {
  return useQuery({
    queryKey: ["presentations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentations")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Presentation[];
    },
  });
}

export function useTrashPresentations() {
  return useQuery({
    queryKey: ["presentations-trash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentations")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data as Presentation[];
    },
  });
}

export function usePresentation(id: string | undefined) {
  return useQuery({
    queryKey: ["presentation", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentations")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Presentation;
    },
  });
}

export function useCreatePresentation() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { title?: string; goal?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("presentations")
        .insert({ user_id: user.id, title: input.title || "Untitled Presentation", goal: input.goal || "Teach" })
        .select()
        .single();
      if (error) throw error;

      const { error: slideErr } = await supabase.from("slides").insert({
        presentation_id: data.id,
        user_id: user.id,
        block_type: "title",
        content: { heading: data.title, subheading: "Built with PresentQ", layout: "center" },
        notes: `Welcome everyone! Today I'll be presenting "${data.title}". Let me start by giving you a quick overview of what we'll cover and why it matters.`,
        sort_order: 0,
      });
      if (slideErr) console.error("Error creating default slide:", slideErr);

      return data as Presentation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presentations"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdatePresentation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; description?: string | null; goal?: string | null; is_public?: boolean; slide_order?: string[]; theme?: Json | null; folder?: string | null }) => {
      const { data, error } = await supabase
        .from("presentations")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["presentations"] });
      qc.invalidateQueries({ queryKey: ["presentation", vars.id] });
    },
  });
}

export function useSoftDeletePresentation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("presentations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presentations"] });
      qc.invalidateQueries({ queryKey: ["presentations-trash"] });
      toast({ title: "Moved to trash", description: "You can restore it from the trash." });
    },
  });
}

export function useRestorePresentation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("presentations")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presentations"] });
      qc.invalidateQueries({ queryKey: ["presentations-trash"] });
      toast({ title: "Restored", description: "Presentation moved back to workspace." });
    },
  });
}

export function useDeletePresentation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("presentations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presentations"] });
      qc.invalidateQueries({ queryKey: ["presentations-trash"] });
      toast({ title: "Deleted", description: "Presentation permanently removed." });
    },
  });
}

export function useDuplicatePresentation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get source presentation
      const { data: source, error: srcErr } = await supabase
        .from("presentations")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (srcErr) throw srcErr;

      // Create copy
      const { data: copy, error: copyErr } = await supabase
        .from("presentations")
        .insert({
          user_id: user.id,
          title: `${source.title} (Copy)`,
          description: source.description,
          goal: source.goal,
          theme: source.theme,
          folder: source.folder,
        })
        .select()
        .single();
      if (copyErr) throw copyErr;

      // Copy slides
      const { data: slides } = await supabase
        .from("slides")
        .select("*")
        .eq("presentation_id", sourceId)
        .order("sort_order");

      if (slides?.length) {
        const newSlides = slides.map((s) => ({
          presentation_id: copy.id,
          user_id: user.id,
          block_type: s.block_type,
          content: s.content,
          notes: s.notes,
          sort_order: s.sort_order,
        }));
        await supabase.from("slides").insert(newSlides);
      }

      return copy as Presentation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presentations"] });
      toast({ title: "Duplicated", description: "A copy has been created." });
    },
  });
}
