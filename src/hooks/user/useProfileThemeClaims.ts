import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ThemeLaunchStatus {
  remaining: number;
  limit: number;
  claimed: boolean;
  eligible: boolean;
}
export function useOwnedProfileThemes(userId?: string | null) {
  return useQuery({
    queryKey: ["owned_profile_themes", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("profile_theme_grants" as never)
        .select("theme_id")
        .eq("user_id", userId!);
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return [];
        throw error;
      }
      return (data as unknown as { theme_id: string }[]).map(
        (row) => row.theme_id
      );
    },
  });
}
export function useThemeLaunchOffer() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: ["profile_theme_launch", user?.id],
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ThemeLaunchStatus> => {
      const { data, error } = await supabase.rpc(
        "profile_theme_launch_status" as never
      );
      if (error)
        throw new Error(
          "The launch offer is unavailable. Please try again later."
        );
      return data as unknown as ThemeLaunchStatus;
    },
  });
  const claim = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to claim the collection.");
      const { data, error } = await supabase.rpc(
        "claim_profile_theme_launch" as never
      );
      if (error)
        throw new Error(
          error.message || "Could not claim the collection. Please try again."
        );
      return data as unknown as ThemeLaunchStatus;
    },
    onSuccess: async (value) => {
      cache.setQueryData(["profile_theme_launch", user?.id], value);
      await cache.invalidateQueries({
        queryKey: ["owned_profile_themes", user?.id],
      });
    },
    onSettled: async () => {
      await cache.invalidateQueries({
        queryKey: ["profile_theme_launch", user?.id],
      });
    },
  });
  return { status, claim };
}
