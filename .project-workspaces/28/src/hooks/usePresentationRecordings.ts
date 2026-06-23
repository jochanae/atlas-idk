import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PresentationRecording {
  id: string;
  presentation_id: string | null;
  user_id: string;
  title: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number;
  slide_timestamps: { slideIndex: number; time: number }[];
  status: string;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export function usePresentationRecordings(presentationId: string | undefined) {
  return useQuery({
    queryKey: ["presentation-recordings", presentationId],
    enabled: !!presentationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentation_recordings")
        .select("*")
        .eq("presentation_id", presentationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PresentationRecording[];
    },
  });
}

export function useAllRecordings() {
  return useQuery({
    queryKey: ["all-recordings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentation_recordings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as PresentationRecording[];
    },
  });
}

export function useCreateRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { presentation_id: string; title?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("presentation_recordings").insert({
        presentation_id: input.presentation_id,
        user_id: user.id,
        title: input.title || "Untitled Recording",
        status: "recording",
      }).select().single();
      if (error) throw error;
      return data as unknown as PresentationRecording;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["presentation-recordings", data.presentation_id] });
      qc.invalidateQueries({ queryKey: ["all-recordings"] });
    },
  });
}

export function useUpdateRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; video_url?: string; thumbnail_url?: string; duration_seconds?: number; slide_timestamps?: any; status?: string; file_size?: number; title?: string }) => {
      const { data, error } = await supabase.from("presentation_recordings").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as PresentationRecording;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["presentation-recordings", data.presentation_id] });
      qc.invalidateQueries({ queryKey: ["all-recordings"] });
    },
  });
}

export function useDeleteRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, presentationId }: { id: string; presentationId: string }) => {
      const { error } = await supabase.from("presentation_recordings").delete().eq("id", id);
      if (error) throw error;
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["presentation-recordings", presId] });
      qc.invalidateQueries({ queryKey: ["all-recordings"] });
    },
  });
}

export async function uploadRecordingBlob(blob: Blob, userId: string, recordingId: string): Promise<string> {
  const ext = blob.type.includes("webm") ? "webm" : "mp4";
  const path = `${userId}/${recordingId}.${ext}`;
  const { error } = await supabase.storage.from("presentation-recordings").upload(path, blob, {
    contentType: blob.type,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("presentation-recordings").getPublicUrl(path);
  return data.publicUrl;
}
