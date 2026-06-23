import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LibraryFile {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  thumbnail_url: string | null;
  ai_summary: string | null;
  ai_key_points: string[];
  ai_suggested_slides: { title: string; description: string }[];
  annotations: Annotation[];
  tags: string[];
  created_at: string;
  updated_at: string;
  publicUrl: string;
}

export interface Annotation {
  id: string;
  type: "highlight" | "comment";
  color?: string;
  text: string;
  startOffset: number;
  endOffset: number;
  comment?: string;
  createdAt: string;
}

export function useFileLibrary() {
  return useQuery({
    queryKey: ["file-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("file_library")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((f: any) => ({
        ...f,
        ai_key_points: f.ai_key_points || [],
        ai_suggested_slides: f.ai_suggested_slides || [],
        annotations: f.annotations || [],
        tags: f.tags || [],
        publicUrl: supabase.storage.from("file-library").getPublicUrl(f.file_path).data.publicUrl,
      })) as LibraryFile[];
    },
  });
}

export function useUploadToLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop() || "bin";
      const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("file-library")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw uploadErr;

      const publicUrl = supabase.storage.from("file-library").getPublicUrl(filePath).data.publicUrl;

      const { data, error: dbErr } = await supabase.from("file_library").insert({
        user_id: user.id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
      }).select().single();
      if (dbErr) throw dbErr;

      return {
        ...data,
        ai_key_points: (data.ai_key_points || []) as unknown as string[],
        ai_suggested_slides: (data.ai_suggested_slides || []) as unknown as { title: string; description: string }[],
        annotations: (data.annotations || []) as unknown as Annotation[],
        tags: data.tags || [],
        publicUrl,
      } as LibraryFile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file-library"] });
    },
  });
}

export function useDeleteFromLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      await supabase.storage.from("file-library").remove([filePath]);
      const { error } = await supabase.from("file_library").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file-library"] });
    },
  });
}

export function useUpdateLibraryFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<LibraryFile, "ai_summary" | "ai_key_points" | "ai_suggested_slides" | "annotations" | "tags">> }) => {
      const { error } = await supabase.from("file_library").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file-library"] });
    },
  });
}

export function useLinkFileToPresentation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fileId, presentationId }: { fileId: string; presentationId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("file_library_links").insert({
        file_id: fileId,
        presentation_id: presentationId,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file-library"] });
    },
  });
}
