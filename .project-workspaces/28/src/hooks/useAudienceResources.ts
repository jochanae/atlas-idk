import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AudienceResource {
  id: string;
  user_id: string;
  presentation_id: string | null;
  title: string;
  description: string | null;
  resource_type: string;
  file_url: string | null;
  external_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export const RESOURCE_TYPES = [
  { value: "pdf", label: "PDF / Key Slides" },
  { value: "summary", label: "One-Page Summary" },
  { value: "checklist", label: "Checklist" },
  { value: "worksheet", label: "Worksheet / Fillable PDF" },
  { value: "reflection", label: "Reflection Questions" },
  { value: "action-plan", label: "Action Plan" },
  { value: "qr-handout", label: "QR-Code Handout" },
  { value: "replay-link", label: "Recording / Replay Link" },
  { value: "other", label: "Other" },
] as const;

export function useAudienceResources(presentationId?: string) {
  return useQuery({
    queryKey: ["audience-resources", presentationId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("audience_resources" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (presentationId) {
        query = query.eq("presentation_id", presentationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AudienceResource[];
    },
  });
}

export function useCreateAudienceResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      resource_type: string;
      presentation_id?: string;
      file_url?: string;
      external_url?: string;
      is_public?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("audience_resources" as any)
        .insert({
          user_id: user.id,
          title: input.title,
          description: input.description || null,
          resource_type: input.resource_type,
          presentation_id: input.presentation_id || null,
          file_url: input.file_url || null,
          external_url: input.external_url || null,
          is_public: input.is_public ?? false,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AudienceResource;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-resources"] });
      toast.success("Resource created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteAudienceResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("audience_resources" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-resources"] });
      toast.success("Resource deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAudienceResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; description?: string; is_public?: boolean; external_url?: string }) => {
      const { error } = await supabase
        .from("audience_resources" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-resources"] });
      toast.success("Resource updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export async function uploadResourceFile(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("audience-resources")
    .upload(path, file);
  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("audience-resources")
    .getPublicUrl(path);

  return urlData.publicUrl;
}
