import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "free" | "premium" | "admin";

export interface UserQuota {
  tier: AppRole;
  used: number;
  monthly_limit: number | null; // null = unlimited (admin)
  remaining: number | null;
}

export function useUserQuota() {
  return useQuery({
    queryKey: ["user-quota"],
    queryFn: async (): Promise<UserQuota | null> => {
      const { data, error } = await supabase.rpc("current_user_quota");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as UserQuota) ?? null;
    },
    staleTime: 30_000,
  });
}

export function useIsAdmin() {
  const q = useUserQuota();
  return { isAdmin: q.data?.tier === "admin", loading: q.isLoading };
}