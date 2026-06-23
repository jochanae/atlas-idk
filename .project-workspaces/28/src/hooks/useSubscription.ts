import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TIER_CONFIG = {
  pro: {
    price_id: "price_1SzhxRIDuABttloFKyWrpH6T",
    product_id: "prod_TxiJAl6MH7oJdO",
  },
  team: {
    price_id: "price_1Szn6GIDuABttloF9nBr3xLk",
    product_id: "prod_TxiXTEyBpeExog",
  },
  creatorPlus: {
    price_id: "price_1Szn6jIDuABttloF0Qdb6DZO",
    product_id: "prod_TxiXT682ZvPbPB",
  },
} as const;

export type Tier = "free" | "pro" | "team" | "creatorPlus";

function productIdToTier(productId: string | null): Tier {
  if (!productId) return "free";
  if (productId === "admin_all_access") return "creatorPlus"; // admins get highest tier
  for (const [tier, config] of Object.entries(TIER_CONFIG)) {
    if (config.product_id === productId) return tier as Tier;
  }
  return "pro"; // fallback for unknown product ids
}

export interface SubscriptionState {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
  plan: string;
  tier: Tier;
  is_admin: boolean;
}

const FREE_DECK_LIMIT = 3;

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async (): Promise<SubscriptionState> => {
      try {
        const { data, error } = await supabase.functions.invoke("check-subscription");
        if (error) throw error;
        const tier = productIdToTier(data?.product_id ?? null);
        return {
          subscribed: data?.subscribed ?? false,
          product_id: data?.product_id ?? null,
          subscription_end: data?.subscription_end ?? null,
          plan: tier === "free" ? "free" : tier,
          tier,
          is_admin: data?.is_admin ?? false,
        };
      } catch {
        return { subscribed: false, product_id: null, subscription_end: null, plan: "free", tier: "free", is_admin: false };
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useIsPro() {
  const { data } = useSubscription();
  return data?.subscribed ?? false;
}

export function useTier(): Tier {
  const { data } = useSubscription();
  return data?.tier ?? "free";
}

export function useHasTier(minTier: Tier): boolean {
  const tier = useTier();
  const order: Tier[] = ["free", "pro", "team", "creatorPlus"];
  return order.indexOf(tier) >= order.indexOf(minTier);
}

export { FREE_DECK_LIMIT };
