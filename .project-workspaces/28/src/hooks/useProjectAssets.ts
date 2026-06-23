import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cloudinaryUrl } from "@/lib/cloudinary";

export interface ProjectAsset {
  id: string;
  slide_id: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
  publicUrl: string;
}

export function useProjectAssets(presentationId: string | undefined) {
  return useQuery({
    queryKey: ["project-assets", presentationId],
    enabled: !!presentationId,
    queryFn: async () => {
      const { data: slides, error: sErr } = await supabase
        .from("slides")
        .select("id")
        .eq("presentation_id", presentationId!);
      if (sErr) throw sErr;
      if (!slides?.length) return [];

      const slideIds = slides.map((s) => s.id);
      const { data: assets, error: aErr } = await supabase
        .from("slide_assets")
        .select("*")
        .in("slide_id", slideIds)
        .order("created_at", { ascending: false });
      if (aErr) throw aErr;

      return (assets || []).map((a) => {
        // Use Cloudinary URL if available, fall back to Supabase storage
        const rawUrl = a.file_path.startsWith("https://res.cloudinary.com")
          ? a.file_path
          : supabase.storage.from("slide-assets").getPublicUrl(a.file_path).data.publicUrl;
        return {
          ...a,
          publicUrl: cloudinaryUrl(rawUrl),
        };
      }) as ProjectAsset[];
    },
  });
}

export function useUploadProjectAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      presentationId,
      slideId,
    }: {
      file: File;
      presentationId: string;
      slideId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload via Cloudinary edge function
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", `presentq/${user.id}/${presentationId}`);

      const { data, error: fnErr } = await supabase.functions.invoke("cloudinary-upload", {
        body: formData,
      });

      if (fnErr) throw fnErr;
      if (!data?.url) throw new Error("Upload failed - no URL returned");

      const cloudinaryFileUrl = data.url as string;

      // Store Cloudinary URL as file_path for future lookups
      const { error: dbErr } = await supabase.from("slide_assets").insert({
        slide_id: slideId,
        user_id: user.id,
        file_path: cloudinaryFileUrl,
        file_type: file.type,
        file_size: file.size,
      });
      if (dbErr) throw dbErr;

      return cloudinaryFileUrl;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["project-assets", vars.presentationId] });
    },
  });
}

export function useDeleteProjectAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath, presentationId }: { id: string; filePath: string; presentationId: string }) => {
      // Only remove from Supabase storage if it's a legacy path (not Cloudinary)
      if (!filePath.startsWith("https://res.cloudinary.com")) {
        await supabase.storage.from("slide-assets").remove([filePath]);
      }
      await supabase.from("slide_assets").delete().eq("id", id);
      return presentationId;
    },
    onSuccess: (presId) => {
      qc.invalidateQueries({ queryKey: ["project-assets", presId] });
    },
  });
}
