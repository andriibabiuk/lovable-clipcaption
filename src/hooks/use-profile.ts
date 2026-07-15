import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
};

export const PROFILE_QUERY_KEY = ["profile"] as const;

/**
 * Shared, cached fetch of the current user's profile row.
 * Consumers should call `invalidateProfile(qc)` (or `useInvalidateProfile()`)
 * after mutating `profiles.display_name` so the header/settings refresh.
 */
export function useProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<Profile | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle();
      return {
        id: user.id,
        name: p?.display_name ?? user.email?.split("@")[0] ?? null,
        email: p?.email ?? user.email ?? null,
      };
    },
  });
}

export function useInvalidateProfile() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
}