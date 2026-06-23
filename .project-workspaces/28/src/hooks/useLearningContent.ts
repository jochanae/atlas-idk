import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LearningContent {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  category: string;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
}

export function useLearningContent() {
  return useQuery({
    queryKey: ["learning-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LearningContent[];
    },
  });
}

export function useFeaturedVideos() {
  return useQuery({
    queryKey: ["featured-videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content")
        .select("*")
        .eq("is_featured", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LearningContent[];
    },
  });
}
