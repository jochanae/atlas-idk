import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Referral {
  id: string;
  referrer_id: string;
  referred_email: string;
  referred_user_id: string | null;
  code: string;
  status: string;
  created_at: string;
}

export function useReferrals() {
  return useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Referral[];
    },
  });
}

export function useCreateReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const code = `${user.id.slice(0, 6)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
      const { data, error } = await supabase
        .from("referrals")
        .insert({ referrer_id: user.id, referred_email: email, code })
        .select()
        .single();
      if (error) throw error;
      return data as Referral;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referrals"] }),
  });
}
