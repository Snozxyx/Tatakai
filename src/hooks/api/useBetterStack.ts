import { useQuery } from "@tanstack/react-query";
import { fetchBetterStackReport } from "@/lib/betterStackStatus";
export function useBetterStack() {
  return useQuery({
    queryKey: ["betterstack-report"],
    queryFn: ({ signal }) => fetchBetterStackReport(signal),
    staleTime: 30000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
